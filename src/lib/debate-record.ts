export const DEBATE_RECORD_SCHEMA_VERSION = "debate-record/v1";

export type DebateRecordSide = "A" | "B" | "other";

export type DebateRecordTurn = {
  side: DebateRecordSide;
  speaker: string;
  content: string;
};

export type DebateRecordQuality = {
  needsReview: boolean;
  notes: string[];
};

export type DebateRecord = {
  schemaVersion: typeof DEBATE_RECORD_SCHEMA_VERSION;
  title: string;
  turns: DebateRecordTurn[];
  quality?: DebateRecordQuality;
};

export function isDebateRecordSide(value: unknown): value is DebateRecordSide {
  return value === "A" || value === "B" || value === "other";
}
