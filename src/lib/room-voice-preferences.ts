import {
  RoomVoiceSource as PrismaRoomVoiceSource,
  type TranscriptionProvider as PrismaTranscriptionProvider,
} from "@prisma/client";

import {
  fromPrismaTranscriptionProvider,
  parseTranscriptionProviderName,
  toPrismaTranscriptionProvider,
  type TranscriptionProviderName,
} from "@/features/transcription/core/providers";

export type RoomVoiceSourcePreference = "user" | "system";

export type RoomVoiceRuntimePreferences = {
  sourcePreference: RoomVoiceSourcePreference | null;
  transcriptionProviderPreference: TranscriptionProviderName | null;
};

type RoomVoicePreferenceRecord = {
  voiceSourcePreference?: PrismaRoomVoiceSource | null;
  transcriptionProviderPreference?: PrismaTranscriptionProvider | null;
};

export function parseRoomVoiceSourcePreference(
  value: string | null | undefined,
): RoomVoiceSourcePreference | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "user" || normalized === "system") {
    return normalized;
  }

  return null;
}

export function toPrismaRoomVoiceSource(
  value: RoomVoiceSourcePreference,
): PrismaRoomVoiceSource {
  return value === "user" ? PrismaRoomVoiceSource.USER : PrismaRoomVoiceSource.SYSTEM;
}

export function fromPrismaRoomVoiceSource(
  value: PrismaRoomVoiceSource | null | undefined,
): RoomVoiceSourcePreference | null {
  if (value === PrismaRoomVoiceSource.USER) {
    return "user";
  }
  if (value === PrismaRoomVoiceSource.SYSTEM) {
    return "system";
  }

  return null;
}

export function toPrismaRoomTranscriptionProvider(
  value: TranscriptionProviderName | null,
): PrismaTranscriptionProvider | null {
  return value ? toPrismaTranscriptionProvider(value) : null;
}

export function normalizeRoomTranscriptionProviderPreference(
  value: string | null | undefined,
): TranscriptionProviderName | null {
  return parseTranscriptionProviderName(value);
}

export function getRoomVoiceRuntimePreferences(
  record: RoomVoicePreferenceRecord,
): RoomVoiceRuntimePreferences {
  return {
    sourcePreference: fromPrismaRoomVoiceSource(record.voiceSourcePreference),
    transcriptionProviderPreference: record.transcriptionProviderPreference
      ? fromPrismaTranscriptionProvider(record.transcriptionProviderPreference)
      : null,
  };
}
