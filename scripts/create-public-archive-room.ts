import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  importArchiveRoomFromDebateRecord,
  parseDebateRecordJson,
} from "../src/lib/archive-room-import";
import { SYSTEM_USERNAME } from "../src/lib/constants";
import { prisma } from "../src/lib/prisma";

type CliOptions = {
  recordPath: string;
  sourceUrl: string | null;
  titleOverride: string | null;
};

function printUsage(error?: string) {
  if (error) {
    console.error(error);
    console.error("");
  }

  console.info("Usage:");
  console.info(
    "  pnpm room:import-archive --record <path/to/record.json> [--source <https://source.example>] [--title <override title>]",
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
  const sourceUrl = values.get("source")?.trim() ?? null;
  const titleOverride = values.get("title")?.trim() ?? null;

  if (!recordPath) {
    throw new Error("--record is required");
  }

  return {
    recordPath,
    sourceUrl: sourceUrl && sourceUrl.length > 0 ? sourceUrl : null,
    titleOverride: titleOverride && titleOverride.length > 0 ? titleOverride : null,
  };
}

async function loadRecord(recordPath: string) {
  const absolutePath = path.resolve(recordPath);
  const file = await fs.readFile(absolutePath, "utf8");

  return {
    absolutePath,
    record: parseDebateRecordJson(file),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { absolutePath, record } = await loadRecord(options.recordPath);
  const room = await importArchiveRoomFromDebateRecord({
    record,
    sourceUrl: options.sourceUrl,
    titleOverride: options.titleOverride,
  });

  console.info("Public archive room created.");
  console.info(`Room ID: ${room.roomId}`);
  console.info(`Path: ${room.path}`);
  console.info(`Title: ${room.title}`);
  console.info(`Owner: @${SYSTEM_USERNAME}${room.systemUserCreated ? " (created)" : ""}`);
  console.info(`Messages imported: ${room.importedCount}`);
  console.info(`Record file: ${absolutePath}`);
  if (room.sourceUrl) {
    console.info(`Source: ${room.sourceUrl}`);
  }

  if (room.warnings.length > 0) {
    console.warn("Record marked for review:");
    for (const note of room.warnings) {
      console.warn(`- ${note}`);
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
