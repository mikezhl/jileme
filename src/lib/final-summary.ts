import { type ChatMessage } from "@/lib/chat-types";

export type FinalSummaryContent = {
  type: "final-summary";
  focus: string;
  overall: string;
  sideAPoints: string[];
  sideBPoints: string[];
  sideAHighlights: string[];
  sideBHighlights: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(value);
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    const deduped = new Set<string>();

    for (const item of value) {
      const normalized = normalizeString(item);
      if (!normalized) {
        continue;
      }

      deduped.add(normalized);
    }

    return [...deduped];
  }

  const normalized = normalizeString(value);
  return normalized ? [normalized] : [];
}

export function parseFinalSummaryMessage(
  message: Pick<ChatMessage, "type" | "content">,
): FinalSummaryContent | null {
  if (message.type !== "summary") {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content) as unknown;
    if (!isRecord(parsed) || parsed.type !== "final-summary") {
      return null;
    }

    return {
      type: "final-summary",
      focus: normalizeString(parsed.focus),
      overall: normalizeString(parsed.overall),
      sideAPoints: normalizeStringList(parsed.side_a_points ?? parsed.sideAPoints),
      sideBPoints: normalizeStringList(parsed.side_b_points ?? parsed.sideBPoints),
      sideAHighlights: normalizeStringList(
        parsed.side_a_highlights ??
          parsed.sideAHighlights ??
          parsed.side_a_strengths ??
          parsed.sideAStrengths,
      ),
      sideBHighlights: normalizeStringList(
        parsed.side_b_highlights ??
          parsed.sideBHighlights ??
          parsed.side_b_strengths ??
          parsed.sideBStrengths,
      ),
    };
  } catch {
    return null;
  }
}
