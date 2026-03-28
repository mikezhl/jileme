import type { ConversationOutputLanguage, RoomAnalysisProfilePreference } from "@/lib/room-analysis-profile";

import buildRealtimeDefaultPrompt from "./realtime/default";
import buildRealtimeHumorPrompt from "./realtime/humor";
import buildSummaryDefaultPrompt from "./summary/default";
import buildSummaryHumorPrompt from "./summary/humor";

export type PromptMode = "realtime" | "summary";

type PromptBuilder = (outputLanguage: ConversationOutputLanguage) => string;

const promptRegistry: Record<PromptMode, Record<RoomAnalysisProfilePreference, PromptBuilder>> = {
  realtime: {
    default: buildRealtimeDefaultPrompt,
    humor: buildRealtimeHumorPrompt,
  },
  summary: {
    default: buildSummaryDefaultPrompt,
    humor: buildSummaryHumorPrompt,
  },
};

const defaultPromptProfile: RoomAnalysisProfilePreference = "default";

function normalizeProfile(raw: string | null | undefined) {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/[^a-z0-9_-]/g, "");
}

export type PromptResolution = {
  profile: RoomAnalysisProfilePreference;
  prompt: string;
  outputLanguage: ConversationOutputLanguage;
  fallbackUsed: boolean;
};

export function resolvePromptProfile(
  requestedProfile: string | null | undefined,
): RoomAnalysisProfilePreference {
  const normalizedProfile = normalizeProfile(requestedProfile);
  const registry = promptRegistry.realtime;

  return normalizedProfile in registry
    ? (normalizedProfile as RoomAnalysisProfilePreference)
    : defaultPromptProfile;
}

export function resolvePromptTemplate(
  mode: PromptMode,
  requestedProfile: string | null | undefined,
  outputLanguage: ConversationOutputLanguage,
): PromptResolution {
  const registry = promptRegistry[mode];
  const normalizedProfile = normalizeProfile(requestedProfile);
  const profile =
    normalizedProfile in registry
      ? (normalizedProfile as RoomAnalysisProfilePreference)
      : defaultPromptProfile;
  const prompt = registry[profile](outputLanguage);

  return {
    profile,
    prompt,
    outputLanguage,
    fallbackUsed: normalizedProfile !== profile,
  };
}
