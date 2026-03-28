import { type DebateRecordSide } from "@/lib/debate-record";

const ARCHIVE_PARTICIPANT_PREFIX = "archive:";
const ARCHIVE_OTHER_PREFIX = `${ARCHIVE_PARTICIPANT_PREFIX}other`;

export function buildArchiveParticipantId(side: DebateRecordSide, key?: string | null) {
  if (side === "A") {
    return `${ARCHIVE_PARTICIPANT_PREFIX}a`;
  }
  if (side === "B") {
    return `${ARCHIVE_PARTICIPANT_PREFIX}b`;
  }

  const normalizedKey = key?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return normalizedKey ? `${ARCHIVE_OTHER_PREFIX}:${normalizedKey}` : ARCHIVE_OTHER_PREFIX;
}

export function getArchiveMessageSide(participantId?: string | null): DebateRecordSide | null {
  const normalized = participantId?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === `${ARCHIVE_PARTICIPANT_PREFIX}a`) {
    return "A";
  }
  if (normalized === `${ARCHIVE_PARTICIPANT_PREFIX}b`) {
    return "B";
  }
  if (normalized === ARCHIVE_OTHER_PREFIX || normalized.startsWith(`${ARCHIVE_OTHER_PREFIX}:`)) {
    return "other";
  }
  return null;
}

export function isArchiveConversationSide(side: DebateRecordSide | null) {
  return side === "A" || side === "B" || side === "other";
}
