import { RoomAnalysisProfile as PrismaRoomAnalysisProfile } from "@prisma/client";

import { type RoomTranscriptionLanguagePreference } from "./room-transcription-language";

export const ROOM_ANALYSIS_PROFILE_PREFERENCES = ["default", "humor"] as const;

export type RoomAnalysisProfilePreference =
  (typeof ROOM_ANALYSIS_PROFILE_PREFERENCES)[number];

export type ConversationOutputLanguage = "zh" | "en";

export function normalizeRoomAnalysisProfilePreference(
  value: string | null | undefined,
): RoomAnalysisProfilePreference | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "default" || normalized === "humor") {
    return normalized;
  }

  return null;
}

export function toPrismaRoomAnalysisProfile(
  value: RoomAnalysisProfilePreference | null,
): PrismaRoomAnalysisProfile | null {
  if (value === "humor") {
    return PrismaRoomAnalysisProfile.HUMOR;
  }
  if (value === "default") {
    return PrismaRoomAnalysisProfile.DEFAULT;
  }

  return null;
}

export function fromPrismaRoomAnalysisProfile(
  value: PrismaRoomAnalysisProfile | null | undefined,
): RoomAnalysisProfilePreference | null {
  if (value === PrismaRoomAnalysisProfile.HUMOR) {
    return "humor";
  }
  if (value === PrismaRoomAnalysisProfile.DEFAULT) {
    return "default";
  }

  return null;
}

export function getDefaultRoomAnalysisProfilePreference(): RoomAnalysisProfilePreference {
  return "default";
}

export function resolveConversationOutputLanguage(
  transcriptionLanguagePreference: RoomTranscriptionLanguagePreference | null | undefined,
): ConversationOutputLanguage {
  return transcriptionLanguagePreference === "en" ? "en" : "zh";
}
