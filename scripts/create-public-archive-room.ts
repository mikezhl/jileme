import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { MessageType, Prisma, RoomStatus } from "@prisma/client";

import { buildArchiveParticipantId } from "../src/lib/archive-room";
import {
  DEBATE_RECORD_SCHEMA_VERSION,
  isDebateRecordSide,
  type DebateRecord,
  type DebateRecordTurn,
} from "../src/lib/debate-record";
import { SYSTEM_DEFAULT_PASSWORD, SYSTEM_USERNAME } from "../src/lib/constants";
import { prisma } from "../src/lib/prisma";
import { normalizeRoomName } from "../src/lib/room-name";
import { generateRoomId } from "../src/lib/room-utils";

type CliOptions = {
  recordPath: string;
  sourceUrl: string;
  titleOverride: string | null;
};

type ValidatedTurn = DebateRecordTurn & {
  speaker: string;
  content: string;
};

function printUsage(error?: string) {
  if (error) {
    console.error(error);
    console.error("");
  }

  console.info("Usage:");
  console.info(
    "  pnpm room:import-archive --record <path/to/record.json> --source <https://source.example> [--title <override title>]",
  );
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unknown argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const recordPath = values.get("record")?.trim();
  const sourceUrl = values.get("source")?.trim();
  const titleOverride = values.get("title")?.trim() ?? null;

  if (!recordPath) {
    throw new Error("--record is required");
  }
  if (!sourceUrl) {
    throw new Error("--source is required");
  }

  return {
    recordPath,
    sourceUrl,
    titleOverride: titleOverride && titleOverride.length > 0 ? titleOverride : null,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shouldInsertSpace(left: string, right: string) {
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
}

function mergeTurnContent(left: string, right: string) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (right.startsWith(left)) {
    return right;
  }
  if (left.endsWith(right)) {
    return left;
  }
  return shouldInsertSpace(left, right) ? `${left} ${right}` : `${left}${right}`;
}

function normalizeSpeaker(side: DebateRecordTurn["side"], speaker: string) {
  if (side === "A") {
    return "正方";
  }
  if (side === "B") {
    return "反方";
  }

  const normalized = normalizeWhitespace(speaker);
  return normalized || "其它";
}

function validateDebateRecord(value: unknown): DebateRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Record must be a JSON object");
  }

  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== DEBATE_RECORD_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${DEBATE_RECORD_SCHEMA_VERSION}`);
  }

  const title = typeof raw.title === "string" ? normalizeWhitespace(raw.title) : "";
  if (!title) {
    throw new Error("title is required");
  }

  if (!Array.isArray(raw.turns) || raw.turns.length === 0) {
    throw new Error("turns must be a non-empty array");
  }

  const turns = raw.turns.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`turns[${index}] must be an object`);
    }

    const turn = item as Record<string, unknown>;
    if (!isDebateRecordSide(turn.side)) {
      throw new Error(`turns[${index}].side must be A, B, or other`);
    }

    const speaker = typeof turn.speaker === "string" ? normalizeWhitespace(turn.speaker) : "";
    const content = typeof turn.content === "string" ? normalizeWhitespace(turn.content) : "";
    if (!speaker) {
      throw new Error(`turns[${index}].speaker is required`);
    }
    if (!content) {
      throw new Error(`turns[${index}].content is required`);
    }

    return {
      side: turn.side,
      speaker,
      content,
    } satisfies DebateRecordTurn;
  });

  const quality = raw.quality;
  if (quality !== undefined) {
    if (!quality || typeof quality !== "object") {
      throw new Error("quality must be an object when provided");
    }

    const typedQuality = quality as Record<string, unknown>;
    if (typeof typedQuality.needsReview !== "boolean") {
      throw new Error("quality.needsReview must be a boolean when provided");
    }
    if (
      typedQuality.notes !== undefined &&
      (!Array.isArray(typedQuality.notes) || typedQuality.notes.some((note) => typeof note !== "string"))
    ) {
      throw new Error("quality.notes must be an array of strings when provided");
    }
  }

  return {
    schemaVersion: DEBATE_RECORD_SCHEMA_VERSION,
    title,
    turns,
    quality:
      quality && typeof quality === "object"
        ? {
            needsReview: (quality as { needsReview: boolean }).needsReview,
            notes: Array.isArray((quality as { notes?: string[] }).notes)
              ? (quality as { notes: string[] }).notes.map((note) => normalizeWhitespace(note)).filter(Boolean)
              : [],
          }
        : undefined,
  };
}

function compactTurns(turns: DebateRecordTurn[]): ValidatedTurn[] {
  const compacted: ValidatedTurn[] = [];

  for (const turn of turns) {
    const speaker = normalizeSpeaker(turn.side, turn.speaker);
    const content = normalizeWhitespace(turn.content);
    if (!content) {
      continue;
    }

    const previous = compacted.at(-1);
    if (previous && previous.side === turn.side && previous.speaker === speaker) {
      previous.content = mergeTurnContent(previous.content, content);
      continue;
    }

    compacted.push({
      side: turn.side,
      speaker,
      content,
    });
  }

  if (compacted.length === 0) {
    throw new Error("No valid turns remained after normalization");
  }

  return compacted;
}

async function loadRecord(recordPath: string) {
  const absolutePath = path.resolve(recordPath);
  const file = await fs.readFile(absolutePath, "utf8");
  const parsed = JSON.parse(file) as unknown;
  const record = validateDebateRecord(parsed);

  return {
    absolutePath,
    record,
  };
}

function normalizeSourceUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--source must be a valid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("--source must use http or https");
  }

  return parsed.toString();
}

async function ensureSystemUser() {
  const existing = await prisma.user.findUnique({
    where: { username: SYSTEM_USERNAME },
    select: { id: true, username: true },
  });
  if (existing) {
    return { user: existing, created: false };
  }

  const passwordHash = await bcrypt.hash(SYSTEM_DEFAULT_PASSWORD, 12);
  try {
    const created = await prisma.user.create({
      data: {
        username: SYSTEM_USERNAME,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
      },
    });

    return { user: created, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const user = await prisma.user.findUnique({
        where: { username: SYSTEM_USERNAME },
        select: { id: true, username: true },
      });
      if (user) {
        return { user, created: false };
      }
    }

    throw error;
  }
}

async function createArchiveRoom({
  sourceUrl,
  title,
  turns,
  systemUserId,
}: {
  sourceUrl: string;
  title: string;
  turns: ValidatedTurn[];
  systemUserId: string;
}) {
  const normalizedTitle = normalizeRoomName(title);
  if (!normalizedTitle) {
    throw new Error("title is empty after normalization");
  }

  const baseTimestamp = Date.now();
  const otherParticipantKeys = new Map<string, string>();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomId();

    try {
      const result = await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
          data: {
            roomId,
            name: normalizedTitle,
            sourceUrl,
            status: RoomStatus.ENDED,
            isPublic: true,
            analysisEnabled: false,
            endedAt: new Date(baseTimestamp + Math.max(turns.length - 1, 0) * 1000),
            createdById: systemUserId,
            participants: {
              create: {
                userId: systemUserId,
                joinedAt: new Date(baseTimestamp),
                lastSeenAt: new Date(baseTimestamp),
              },
            },
          },
          select: {
            id: true,
            roomId: true,
            name: true,
            sourceUrl: true,
          },
        });

        await tx.message.createMany({
          data: turns.map((turn, index) => {
            const otherKeyBase = turn.speaker || `other-${index + 1}`;
            let otherKey = otherParticipantKeys.get(otherKeyBase);
            if (!otherKey) {
              otherKey = `other-${otherParticipantKeys.size + 1}`;
              otherParticipantKeys.set(otherKeyBase, otherKey);
            }

            return {
              roomRefId: room.id,
              type: MessageType.TEXT,
              externalRef: `archive:${room.roomId}:${index + 1}`,
              senderName: turn.speaker,
              senderUserId: null,
              participantId:
                turn.side === "other"
                  ? buildArchiveParticipantId(turn.side, otherKey)
                  : buildArchiveParticipantId(turn.side),
              content: turn.content,
              createdAt: new Date(baseTimestamp + index * 1000),
            };
          }),
        });

        return room;
      });

      return {
        ...result,
        importedCount: turns.length,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to generate a unique room ID for archive import");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceUrl = normalizeSourceUrl(options.sourceUrl);
  const { absolutePath, record } = await loadRecord(options.recordPath);
  const title = normalizeWhitespace(options.titleOverride ?? record.title);
  const turns = compactTurns(record.turns);

  if (!title) {
    throw new Error("Resolved title is empty");
  }

  const systemUserResult = await ensureSystemUser();
  const room = await createArchiveRoom({
    sourceUrl,
    title,
    turns,
    systemUserId: systemUserResult.user.id,
  });

  console.info("Public archive room created.");
  console.info(`Room ID: ${room.roomId}`);
  console.info(`Path: /${room.roomId}`);
  console.info(`Title: ${room.name ?? room.roomId}`);
  console.info(`Owner: @${SYSTEM_USERNAME}${systemUserResult.created ? " (created)" : ""}`);
  console.info(`Messages imported: ${room.importedCount}`);
  console.info(`Record file: ${absolutePath}`);
  console.info(`Source: ${room.sourceUrl}`);

  if (record.quality?.needsReview) {
    console.warn("Record marked for review:");
    if (record.quality.notes.length > 0) {
      for (const note of record.quality.notes) {
        console.warn(`- ${note}`);
      }
    }
  }
}

void main()
  .catch((error) => {
    printUsage(error instanceof Error ? error.message : "Failed to create public archive room");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
