import { RoomTranscriptionLanguage as PrismaRoomTranscriptionLanguage } from "@prisma/client";

import { type UiLanguage } from "./ui-language";

export const ROOM_TRANSCRIPTION_LANGUAGE_PREFERENCES = ["zh", "en", "auto"] as const;

export type RoomTranscriptionLanguagePreference =
  (typeof ROOM_TRANSCRIPTION_LANGUAGE_PREFERENCES)[number];

export function normalizeRoomTranscriptionLanguagePreference(
  value: string | null | undefined,
): RoomTranscriptionLanguagePreference | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "zh" || normalized === "en" || normalized === "auto") {
    return normalized;
  }

  return null;
}

export function toPrismaRoomTranscriptionLanguage(
  value: RoomTranscriptionLanguagePreference | null,
): PrismaRoomTranscriptionLanguage | null {
  if (value === "zh") {
    return PrismaRoomTranscriptionLanguage.ZH;
  }
  if (value === "en") {
    return PrismaRoomTranscriptionLanguage.EN;
  }
  if (value === "auto") {
    return PrismaRoomTranscriptionLanguage.AUTO;
  }

  return null;
}

export function fromPrismaRoomTranscriptionLanguage(
  value: PrismaRoomTranscriptionLanguage | null | undefined,
): RoomTranscriptionLanguagePreference | null {
  if (value === PrismaRoomTranscriptionLanguage.ZH) {
    return "zh";
  }
  if (value === PrismaRoomTranscriptionLanguage.EN) {
    return "en";
  }
  if (value === PrismaRoomTranscriptionLanguage.AUTO) {
    return "auto";
  }

  return null;
}

export function getDefaultRoomTranscriptionLanguageForUiLanguage(
  language: UiLanguage,
): RoomTranscriptionLanguagePreference {
  return language === "en" ? "en" : "zh";
}

export function inferRoomTranscriptionLanguagePreference(options: {
  detectLanguage?: boolean;
  language?: string | null;
}): RoomTranscriptionLanguagePreference | null {
  if (options.detectLanguage) {
    return "auto";
  }

  const normalized = options.language?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("en")) {
    return "en";
  }
  if (normalized.startsWith("zh")) {
    return "zh";
  }

  return null;
}
