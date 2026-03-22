import { getConversationAnalysisPromptProfiles } from "@/features/analysis/llm/core";
import type { RoomVoiceRuntime } from "@/features/transcription/core/runtime";
import type { ResolvedConversationLlmRuntime, RuntimeSource } from "./llm-provider-keys";
import type { KeySource } from "./provider-sources";
import type { RoomVoiceSourcePreference } from "./room-voice-preferences";
import type { TranscriptionProviderName } from "@/features/transcription/core/providers";

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
    selectedSource: RoomVoiceSourcePreference | null;
    sourceOptions: Array<{
      value: RoomVoiceSourcePreference;
      available: boolean;
    }>;
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
  profiles: {
    realtime: string;
    summary: string;
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

export function buildRoomProviderModules(
  voiceRuntime: RoomVoiceRuntime,
  llmRuntime: ResolvedConversationLlmRuntime,
  ownerUsername: string | null,
): RoomProviderModules {
  const profiles = getConversationAnalysisPromptProfiles();

  return {
    voice: buildRoomVoiceProviderModule(voiceRuntime, ownerUsername),
    analysis: {
      providedBy: resolveProviderOwnerFromSource(llmRuntime.source, ownerUsername),
      provider: llmRuntime.provider,
      source: llmRuntime.source,
      credentialMask: llmRuntime.apiKeyMask,
      model: llmRuntime.model,
      ready: llmRuntime.configured,
      error: llmRuntime.error,
      profiles,
    },
  };
}
