import bcrypt from "bcryptjs";

import { MessageType, Prisma, RoomStatus } from "@prisma/client";

import { buildArchiveParticipantId } from "@/lib/archive-room";
import { SYSTEM_DEFAULT_PASSWORD, SYSTEM_USERNAME } from "@/lib/constants";
import {
  DEBATE_RECORD_SCHEMA_VERSION,
  isDebateRecordSide,
  type DebateRecord,
  type DebateRecordTurn,
} from "@/lib/debate-record";
import { prisma } from "@/lib/prisma";
import { normalizeRoomName } from "@/lib/room-name";
import { generateRoomId } from "@/lib/room-utils";

type ValidatedTurn = DebateRecordTurn & {
  speaker: string;
  content: string;
};

export type ArchiveRoomImportResult = {
  roomId: string;
  path: string;
  title: string;
  sourceUrl: string | null;
  importedCount: number;
  systemUserCreated: boolean;
  warnings: string[];
};

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

export function validateDebateRecord(value: unknown): DebateRecord {
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

export function parseDebateRecordJson(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Record must be valid JSON");
  }

  return validateDebateRecord(parsed);
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

function normalizeSourceUrl(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("source URL must be a valid http or https URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("source URL must be a valid http or https URL");
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
  createdByUserId,
}: {
  sourceUrl: string | null;
  title: string;
  turns: ValidatedTurn[];
  createdByUserId: string;
}) {
  const normalizedTitle = normalizeRoomName(title);
  if (!normalizedTitle) {
    throw new Error("title is empty after normalization");
  }

  const baseTimestamp = Date.now();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomId();
    const otherParticipantKeys = new Map<string, string>();

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
            createdById: createdByUserId,
            participants: {
              create: {
                userId: createdByUserId,
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

export async function importArchiveRoomFromDebateRecord({
  record,
  titleOverride,
  sourceUrl,
  createdByUserId,
}: {
  record: DebateRecord;
  titleOverride?: string | null;
  sourceUrl?: string | null;
  createdByUserId?: string | null;
}): Promise<ArchiveRoomImportResult> {
  const title = normalizeWhitespace(titleOverride ?? record.title);
  if (!title) {
    throw new Error("Resolved title is empty");
  }

  const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
  const turns = compactTurns(record.turns);
  const systemUserResult =
    createdByUserId && createdByUserId.trim().length > 0 ? null : await ensureSystemUser();
  const room = await createArchiveRoom({
    sourceUrl: normalizedSourceUrl,
    title,
    turns,
    createdByUserId: createdByUserId?.trim() || systemUserResult!.user.id,
  });

  return {
    roomId: room.roomId,
    path: `/${room.roomId}`,
    title: room.name ?? room.roomId,
    sourceUrl: room.sourceUrl,
    importedCount: room.importedCount,
    systemUserCreated: systemUserResult?.created ?? false,
    warnings: record.quality?.needsReview ? record.quality.notes : [],
  };
}
