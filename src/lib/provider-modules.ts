import { resolveConversationAnalysisPromptSelection } from "@/features/analysis/llm/core";
import type { TranscriptionProviderName } from "@/features/transcription/core/providers";
import type { RoomVoiceRuntime } from "@/features/transcription/core/runtime";
import type { ResolvedConversationLlmRuntime, RuntimeSource } from "./llm-provider-keys";
import {
  getDefaultRoomAnalysisProfilePreference,
  ROOM_ANALYSIS_PROFILE_PREFERENCES,
  type ConversationOutputLanguage,
  type RoomAnalysisProfilePreference,
} from "./room-analysis-profile";
import type { KeySource } from "./provider-sources";
import type { RoomTranscriptionLanguagePreference } from "./room-transcription-language";
import type { RoomVoiceSourcePreference } from "./room-voice-preferences";

export type ProviderOwnerKind = "platform" | "user" | "builtin" | "unavailable";

export type ProviderOwner = {
  kind: ProviderOwnerKind;
  username: string | null;
};

export type VoiceProviderModule = {
  providedBy: ProviderOwner;
  ready: boolean;
  error: string | null;
  transcriberEnabled: boolean;
  selection: {
    sourcePreference: RoomVoiceSourcePreference | null;
    transcriptionProviderPreference: TranscriptionProviderName | null;
    transcriptionLanguagePreference: RoomTranscriptionLanguagePreference | null;
    selectedSource: RoomVoiceSourcePreference | null;
    sourceOptions: Array<{
      value: RoomVoiceSourcePreference;
      available: boolean;
    }>;
    selectedTranscriptionLanguage: RoomTranscriptionLanguagePreference;
    selectedTranscriptionProvider: TranscriptionProviderName | null;
    transcriptionOptions: Array<{
      value: TranscriptionProviderName;
      available: boolean;
    }>;
  };
  transport: {
    provider: "livekit";
    source: KeySource;
    credentialMask: string | null;
    ready: boolean;
  };
  transcription: {
    provider: string | null;
    source: KeySource;
    credentialMask: string | null;
    ready: boolean;
  };
};

export type AnalysisProviderModule = {
  providedBy: ProviderOwner;
  provider: string;
  source: RuntimeSource;
  credentialMask: string | null;
  model: string | null;
  ready: boolean;
  error: string | null;
  selection: {
    profilePreference: RoomAnalysisProfilePreference | null;
    selectedProfile: RoomAnalysisProfilePreference;
    profileOptions: Array<{
      value: RoomAnalysisProfilePreference;
      available: boolean;
    }>;
    outputLanguage: ConversationOutputLanguage;
  };
};

export type RoomProviderModules = {
  voice: VoiceProviderModule;
  analysis: AnalysisProviderModule;
};

function resolveProviderOwnerFromSource(
  source: KeySource | RuntimeSource,
  ownerUsername: string | null,
): ProviderOwner {
  if (source === "user") {
    return {
      kind: "user",
      username: ownerUsername,
    };
  }
  if (source === "system") {
    return {
      kind: "platform",
      username: null,
    };
  }
  if (source === "builtin") {
    return {
      kind: "builtin",
      username: null,
    };
  }

  return {
    kind: "unavailable",
    username: null,
  };
}

export function buildRoomVoiceProviderModule(
  voiceRuntime: RoomVoiceRuntime,
  ownerUsername: string | null,
): VoiceProviderModule {
  return {
    providedBy: resolveProviderOwnerFromSource(voiceRuntime.source, ownerUsername),
    ready: voiceRuntime.ready,
    error: voiceRuntime.error,
    transcriberEnabled: voiceRuntime.transcriberEnabled,
    selection: voiceRuntime.selection,
    transport: {
      provider: "livekit",
      source: voiceRuntime.livekit.source,
      credentialMask: voiceRuntime.livekit.livekitApiKeyMask,
      ready: voiceRuntime.livekit.configured,
    },
    transcription: {
      provider: voiceRuntime.transcription?.provider ?? null,
      source: voiceRuntime.transcription?.source ?? "unavailable",
      credentialMask: voiceRuntime.transcription?.credentialMask ?? null,
      ready: voiceRuntime.transcription?.configured ?? !voiceRuntime.transcriberEnabled,
    },
  };
}

export function buildRoomAnalysisProviderModule(
  llmRuntime: ResolvedConversationLlmRuntime,
  ownerUsername: string | null,
  options?: {
    profilePreference?: RoomAnalysisProfilePreference | null;
    transcriptionLanguagePreference?: RoomTranscriptionLanguagePreference | null;
  },
): AnalysisProviderModule {
  const promptSelection = resolveConversationAnalysisPromptSelection({
    profilePreference: options?.profilePreference ?? getDefaultRoomAnalysisProfilePreference(),
    transcriptionLanguagePreference: options?.transcriptionLanguagePreference ?? null,
  });

  return {
    providedBy: resolveProviderOwnerFromSource(llmRuntime.source, ownerUsername),
    provider: llmRuntime.provider,
    source: llmRuntime.source,
    credentialMask: llmRuntime.apiKeyMask,
    model: llmRuntime.model,
    ready: llmRuntime.configured,
    error: llmRuntime.error,
    selection: {
      profilePreference: options?.profilePreference ?? null,
      selectedProfile: promptSelection.profile,
      profileOptions: ROOM_ANALYSIS_PROFILE_PREFERENCES.map((value) => ({
        value,
        available: true,
      })),
      outputLanguage: promptSelection.outputLanguage,
    },
  };
}

export function buildRoomProviderModules(
  voiceRuntime: RoomVoiceRuntime,
  llmRuntime: ResolvedConversationLlmRuntime,
  ownerUsername: string | null,
  options?: {
    profilePreference?: RoomAnalysisProfilePreference | null;
    transcriptionLanguagePreference?: RoomTranscriptionLanguagePreference | null;
  },
): RoomProviderModules {
  return {
    voice: buildRoomVoiceProviderModule(voiceRuntime, ownerUsername),
    analysis: buildRoomAnalysisProviderModule(llmRuntime, ownerUsername, options),
  };
}
