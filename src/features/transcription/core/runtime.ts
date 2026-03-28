import {
  getUserProviderKeysMode,
  optionalEnv,
  parseBooleanEnv,
  parseIntegerEnv,
  type UserProviderKeysMode,
} from "@/lib/env";
import {
  resolveLivekitCredentialsForOwner,
  resolvePlatformLivekitCredentials,
  resolveUserOwnedLivekitCredentials,
  type ResolvedLivekitCredentials,
} from "@/lib/livekit-credentials";
import {
  getPlatformTranscriptionQuotaExceededMessage,
  getPlatformTranscriptionUsageGate,
} from "@/lib/platform-usage-limits";
import { type KeySource } from "@/lib/provider-sources";
import { inferRoomTranscriptionLanguagePreference, type RoomTranscriptionLanguagePreference } from "@/lib/room-transcription-language";
import {
  type RoomVoiceRuntimePreferences,
  type RoomVoiceSourcePreference,
} from "@/lib/room-voice-preferences";
import { maskSecret } from "@/lib/secret-utils";
import {
  getStoredUserTranscriptionProviderCredentials,
  getUserDefaultTranscriptionProvider,
} from "./user-settings";
import {
  getSupportedTranscriptionProviders,
  isValidTranscriptionApiKey,
  parseTranscriptionProviderName,
  type TranscriptionProviderName,
} from "./providers";

export type DeepgramTranscriptionRuntime = {
  provider: "deepgram";
  apiKey: string | null;
  source: KeySource;
  configured: boolean;
  credentialMask: string | null;
  model: string;
  language: string | null;
  interimResults: boolean;
  punctuate: boolean;
  smartFormat: boolean;
  endpointing: number;
  profanityFilter: boolean;
  fillerWords: boolean;
  numerals: boolean;
  detectLanguage: boolean;
  noDelay: boolean;
  diarize: boolean;
  dictation: boolean;
  sampleRate: number;
  numChannels: number;
  mipOptOut: boolean;
};

export type DashScopeTranscriptionRuntime = {
  provider: "dashscope";
  apiKey: string | null;
  source: KeySource;
  configured: boolean;
  credentialMask: string | null;
  baseUrl: string;
  model: string;
  language: string | null;
  inputAudioFormat: string;
  sampleRate: number;
  serverVad: boolean;
  silenceDurationMs: number;
};

export type ResolvedTranscriptionRuntime =
  | DeepgramTranscriptionRuntime
  | DashScopeTranscriptionRuntime;

export type RoomVoiceSourceOption = {
  value: RoomVoiceSourcePreference;
  available: boolean;
};

export type RoomVoiceTranscriptionOption = {
  value: TranscriptionProviderName;
  available: boolean;
};

export type RoomVoiceSelectionState = {
  sourcePreference: RoomVoiceSourcePreference | null;
  transcriptionProviderPreference: TranscriptionProviderName | null;
  transcriptionLanguagePreference: RoomTranscriptionLanguagePreference | null;
  selectedSource: RoomVoiceSourcePreference | null;
  sourceOptions: RoomVoiceSourceOption[];
  selectedTranscriptionLanguage: RoomTranscriptionLanguagePreference;
  selectedTranscriptionProvider: TranscriptionProviderName | null;
  transcriptionOptions: RoomVoiceTranscriptionOption[];
};

export type RoomVoiceRuntime = {
  livekit: ResolvedLivekitCredentials;
  transcription: ResolvedTranscriptionRuntime | null;
  transcriberEnabled: boolean;
  source: KeySource;
  ready: boolean;
  error: string | null;
  selection: RoomVoiceSelectionState;
};

type PlatformRuntimeOptions = {
  provider: TranscriptionProviderName;
};

type VoiceRuntimeCandidate = {
  livekit: ResolvedLivekitCredentials;
  transcription: ResolvedTranscriptionRuntime | null;
  source: KeySource;
  ready: boolean;
  error: string | null;
  selectedSource: RoomVoiceSourcePreference;
};

type TranscriptionRuntimeState = {
  source: RoomVoiceSourcePreference;
  keySource: Extract<KeySource, "system" | "user">;
  runtimes: Map<TranscriptionProviderName, ResolvedTranscriptionRuntime>;
  availableProviders: TranscriptionProviderName[];
  defaultProvider: TranscriptionProviderName | null;
};

type VoiceSourceContext = {
  livekit: ResolvedLivekitCredentials;
  transcription: TranscriptionRuntimeState;
};

function buildTranscriptionOptions(
  source: RoomVoiceSourcePreference | null,
  transcriberEnabled: boolean,
  contexts: {
    user: VoiceSourceContext;
    system: VoiceSourceContext;
  },
): RoomVoiceTranscriptionOption[] {
  if (!transcriberEnabled || !source) {
    return [];
  }

  const context = source === "user" ? contexts.user : contexts.system;
  const available = new Set(context.transcription.availableProviders);
  return getSupportedTranscriptionProviders().map((provider) => ({
    value: provider,
    available: available.has(provider),
  }));
}

function buildVoiceRuntimeCandidate(
  livekit: ResolvedLivekitCredentials,
  transcription: ResolvedTranscriptionRuntime | null,
  transcriberEnabled: boolean,
  selectedSource: RoomVoiceSourcePreference,
  error: string | null = null,
): VoiceRuntimeCandidate {
  const ready = livekit.configured && (!transcriberEnabled || Boolean(transcription?.configured));
  return {
    livekit,
    transcription,
    source: ready ? livekit.source : "unavailable",
    ready,
    error,
    selectedSource,
  };
}

function disablePlatformTranscriptionRuntime(
  transcription: ResolvedTranscriptionRuntime,
): ResolvedTranscriptionRuntime {
  return {
    ...transcription,
    apiKey: null,
    configured: false,
    source: "system",
  };
}

export function isTranscriberEnabled() {
  return parseBooleanEnv(optionalEnv("LIVEKIT_TRANSCRIBER_ENABLED"), true);
}

export function getTranscriberAgentName() {
  return optionalEnv("LIVEKIT_TRANSCRIBER_AGENT_NAME") ?? "transcriber";
}

export function getPlatformDefaultTranscriptionProvider(): TranscriptionProviderName {
  return parseTranscriptionProviderName(optionalEnv("TRANSCRIPTION_PROVIDER")) ?? "deepgram";
}

function buildDeepgramRuntime(
  apiKey: string | null,
  source: KeySource,
  languagePreference?: RoomTranscriptionLanguagePreference | null,
): DeepgramTranscriptionRuntime {
  const configured = isValidTranscriptionApiKey("deepgram", apiKey);
  const envDetectLanguage = parseBooleanEnv(optionalEnv("DEEPGRAM_DETECT_LANGUAGE"), false);
  const resolvedLanguage =
    languagePreference === "en"
      ? "en"
      : languagePreference === "zh"
        ? "zh"
        : envDetectLanguage
          ? null
          : (optionalEnv("DEEPGRAM_LANGUAGE") ?? "zh");
  const detectLanguage = languagePreference === null ? envDetectLanguage : false;
  return {
    provider: "deepgram",
    apiKey,
    source: configured ? source : "unavailable",
    configured,
    credentialMask: source === "user" ? maskSecret(apiKey) : null,
    model: optionalEnv("DEEPGRAM_MODEL") ?? "nova-2",
    language: resolvedLanguage,
    interimResults: parseBooleanEnv(optionalEnv("DEEPGRAM_INTERIM_RESULTS"), true),
    punctuate: parseBooleanEnv(optionalEnv("DEEPGRAM_PUNCTUATE"), true),
    smartFormat: parseBooleanEnv(optionalEnv("DEEPGRAM_SMART_FORMAT"), true),
    endpointing: parseIntegerEnv(optionalEnv("DEEPGRAM_ENDPOINTING"), 25),
    profanityFilter: parseBooleanEnv(optionalEnv("DEEPGRAM_PROFANITY_FILTER"), false),
    fillerWords: parseBooleanEnv(optionalEnv("DEEPGRAM_FILLER_WORDS"), false),
    numerals: parseBooleanEnv(optionalEnv("DEEPGRAM_NUMERALS"), false),
    detectLanguage,
    noDelay: parseBooleanEnv(optionalEnv("DEEPGRAM_NO_DELAY"), true),
    diarize: parseBooleanEnv(optionalEnv("DEEPGRAM_DIARIZE"), false),
    dictation: parseBooleanEnv(optionalEnv("DEEPGRAM_DICTATION"), false),
    sampleRate: parseIntegerEnv(optionalEnv("DEEPGRAM_SAMPLE_RATE"), 16000),
    numChannels: parseIntegerEnv(optionalEnv("DEEPGRAM_NUM_CHANNELS"), 1),
    mipOptOut: parseBooleanEnv(optionalEnv("DEEPGRAM_MIP_OPT_OUT"), false),
  };
}

function buildDashScopeRuntime(
  apiKey: string | null,
  source: KeySource,
  languagePreference?: RoomTranscriptionLanguagePreference | null,
): DashScopeTranscriptionRuntime {
  const configured = isValidTranscriptionApiKey("dashscope", apiKey);
  return {
    provider: "dashscope",
    apiKey,
    source: configured ? source : "unavailable",
    configured,
    credentialMask: source === "user" ? maskSecret(apiKey) : null,
    baseUrl: optionalEnv("DASHSCOPE_REALTIME_URL") ?? "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    model: optionalEnv("DASHSCOPE_REALTIME_MODEL") ?? "qwen3-asr-flash-realtime",
    language:
      languagePreference === "en"
        ? "en"
        : languagePreference === "zh"
          ? "zh"
          : (optionalEnv("DASHSCOPE_REALTIME_LANGUAGE") ?? "zh"),
    inputAudioFormat: optionalEnv("DASHSCOPE_REALTIME_AUDIO_FORMAT") ?? "pcm",
    sampleRate: parseIntegerEnv(optionalEnv("DASHSCOPE_REALTIME_SAMPLE_RATE"), 16000),
    serverVad: parseBooleanEnv(optionalEnv("DASHSCOPE_REALTIME_SERVER_VAD"), true),
    silenceDurationMs: parseIntegerEnv(optionalEnv("DASHSCOPE_REALTIME_SILENCE_DURATION_MS"), 400),
  };
}

function buildRuntimeFromProvider(
  provider: TranscriptionProviderName,
  apiKey: string | null,
  source: KeySource,
  languagePreference?: RoomTranscriptionLanguagePreference | null,
): ResolvedTranscriptionRuntime {
  if (provider === "dashscope") {
    return buildDashScopeRuntime(apiKey, source, languagePreference);
  }
  return buildDeepgramRuntime(apiKey, source, languagePreference);
}

function buildTranscriptionState(options: {
  source: RoomVoiceSourcePreference;
  keySource: Extract<KeySource, "system" | "user">;
  defaultProvider: TranscriptionProviderName | null;
  runtimes: Map<TranscriptionProviderName, ResolvedTranscriptionRuntime>;
}): TranscriptionRuntimeState {
  return {
    source: options.source,
    keySource: options.keySource,
    defaultProvider: options.defaultProvider,
    runtimes: options.runtimes,
    availableProviders: getSupportedTranscriptionProviders().filter(
      (provider) => options.runtimes.get(provider)?.configured,
    ),
  };
}

function resolveConfiguredTranscriptionProvider(
  state: TranscriptionRuntimeState,
  providerPreference: TranscriptionProviderName | null,
  options?: {
    fallbackToAvailable?: boolean;
  },
): TranscriptionProviderName | null {
  if (providerPreference) {
    return state.runtimes.get(providerPreference)?.configured ? providerPreference : null;
  }

  if (state.defaultProvider && state.runtimes.get(state.defaultProvider)?.configured) {
    return state.defaultProvider;
  }

  if (!options?.fallbackToAvailable) {
    return null;
  }

  return state.availableProviders[0] ?? null;
}

function resolveTranscriptionRuntimeFromConfiguredProvider(
  state: TranscriptionRuntimeState,
  provider: TranscriptionProviderName | null,
): ResolvedTranscriptionRuntime | null {
  if (!provider) {
    return null;
  }

  return state.runtimes.get(provider) ?? buildRuntimeFromProvider(provider, null, state.keySource);
}

function resolveTranscriptionRuntimeFromState(
  state: TranscriptionRuntimeState,
  transcriberEnabled: boolean,
  providerPreference: TranscriptionProviderName | null,
): ResolvedTranscriptionRuntime | null {
  if (!transcriberEnabled) {
    return null;
  }

  if (providerPreference) {
    return resolveTranscriptionRuntimeFromConfiguredProvider(state, providerPreference);
  }

  const configuredProvider = resolveConfiguredTranscriptionProvider(state, null, {
    fallbackToAvailable: true,
  });
  if (configuredProvider) {
    return resolveTranscriptionRuntimeFromConfiguredProvider(state, configuredProvider);
  }

  if (state.defaultProvider) {
    return resolveTranscriptionRuntimeFromConfiguredProvider(state, state.defaultProvider);
  }

  return null;
}

function buildCandidateFromContext(
  context: VoiceSourceContext,
  transcriberEnabled: boolean,
  providerPreference: TranscriptionProviderName | null,
  selectedSource: RoomVoiceSourcePreference,
): VoiceRuntimeCandidate {
  return buildVoiceRuntimeCandidate(
    context.livekit,
    resolveTranscriptionRuntimeFromState(
      context.transcription,
      transcriberEnabled,
      providerPreference,
    ),
    transcriberEnabled,
    selectedSource,
  );
}

function getSupportedSourcePreferences(mode: UserProviderKeysMode): RoomVoiceSourcePreference[] {
  if (mode === "false") {
    return ["system"];
  }
  if (mode === "full") {
    return ["user"];
  }
  return ["system", "user"];
}

function normalizeSourcePreferenceForMode(
  sourcePreference: RoomVoiceSourcePreference | null | undefined,
  mode: UserProviderKeysMode,
): RoomVoiceSourcePreference | null {
  const normalized = sourcePreference ?? null;
  if (!normalized) {
    return null;
  }

  if (mode === "false") {
    return normalized === "system" ? normalized : null;
  }
  if (mode === "full") {
    return normalized === "user" ? normalized : null;
  }

  return normalized;
}

function isSourceUsable(
  context: VoiceSourceContext,
  transcriberEnabled: boolean,
  providerBlocked = false,
): boolean {
  if (providerBlocked || !context.livekit.configured) {
    return false;
  }

  return !transcriberEnabled || context.transcription.availableProviders.length > 0;
}

function buildVoiceRuntimeError(mode: UserProviderKeysMode, transcriberEnabled: boolean) {
  if (mode === "false") {
    return transcriberEnabled
      ? "Platform LiveKit and transcription settings must both be configured"
      : "Platform LiveKit credentials are unavailable";
  }

  if (mode === "true") {
    return transcriberEnabled
      ? "Voice runtime requires either a complete room-owner LiveKit + transcription bundle or a complete platform LiveKit + transcription bundle"
      : "Voice runtime requires either room-owner LiveKit credentials or platform LiveKit credentials";
  }

  return transcriberEnabled
    ? "Room owner must configure LiveKit credentials and a transcription provider with valid credentials"
    : "Room owner must configure LiveKit credentials";
}

function pickPreferredUnavailableVoiceRuntime(
  userRuntime: VoiceRuntimeCandidate,
  platformRuntime: VoiceRuntimeCandidate,
): VoiceRuntimeCandidate {
  const hasAnyUserState =
    userRuntime.livekit.source === "user" ||
    Boolean(userRuntime.livekit.livekitApiKeyMask) ||
    Boolean(userRuntime.transcription?.provider) ||
    Boolean(userRuntime.transcription?.credentialMask);

  return hasAnyUserState ? userRuntime : platformRuntime;
}

function applyPlatformUsageGate(
  candidate: VoiceRuntimeCandidate,
  quotaExceededMessage: string | null,
): VoiceRuntimeCandidate {
  if (!quotaExceededMessage || !candidate.ready || !candidate.transcription) {
    return candidate;
  }

  return {
    ...candidate,
    transcription: disablePlatformTranscriptionRuntime(candidate.transcription),
    source: "unavailable",
    ready: false,
    error: quotaExceededMessage,
  };
}

function buildSelectionState(options: {
  contexts: {
    user: VoiceSourceContext;
    system: VoiceSourceContext;
  };
  mode: UserProviderKeysMode;
  preferences: RoomVoiceRuntimePreferences;
  runtime: VoiceRuntimeCandidate;
  transcriberEnabled: boolean;
  systemSourceAvailable: boolean;
  userSourceAvailable: boolean;
}): RoomVoiceSelectionState {
  const sourceOptions = getSupportedSourcePreferences(options.mode).map((value) => ({
    value,
    available: value === "system" ? options.systemSourceAvailable : options.userSourceAvailable,
  }));
  const availableSources = sourceOptions.filter((option) => option.available);

  const selectedSource = options.preferences.sourcePreference
    ? options.preferences.sourcePreference
    : options.runtime.ready
      ? options.runtime.selectedSource
      : availableSources.length === 1
        ? availableSources[0]!.value
      : null;
  const transcriptionOptions = buildTranscriptionOptions(
    selectedSource,
    options.transcriberEnabled,
    options.contexts,
  );
  const selectedTranscriptionLanguage =
    options.preferences.transcriptionLanguagePreference ??
    inferRoomTranscriptionLanguagePreference({
      language: options.runtime.transcription?.language ?? null,
    }) ??
    "zh";

  return {
    sourcePreference: options.preferences.sourcePreference,
    transcriptionProviderPreference: options.preferences.transcriptionProviderPreference,
    transcriptionLanguagePreference: options.preferences.transcriptionLanguagePreference,
    selectedSource,
    sourceOptions,
    selectedTranscriptionLanguage,
    selectedTranscriptionProvider: options.runtime.transcription?.provider ?? null,
    transcriptionOptions,
  };
}

export function resolvePlatformTranscriptionRuntime(
  options?: PlatformRuntimeOptions & {
    languagePreference?: RoomTranscriptionLanguagePreference | null;
  },
): ResolvedTranscriptionRuntime {
  const provider = options?.provider ?? getPlatformDefaultTranscriptionProvider();
  if (provider === "dashscope") {
    return buildDashScopeRuntime(
      optionalEnv("DASHSCOPE_API_KEY"),
      "system",
      options?.languagePreference,
    );
  }
  return buildDeepgramRuntime(
    optionalEnv("DEEPGRAM_API_KEY"),
    "system",
    options?.languagePreference,
  );
}

function buildPlatformTranscriptionState(
  languagePreference?: RoomTranscriptionLanguagePreference | null,
): TranscriptionRuntimeState {
  const runtimes = new Map(
    getSupportedTranscriptionProviders().map((provider) => [
      provider,
      resolvePlatformTranscriptionRuntime({ provider, languagePreference }),
    ]),
  );

  return buildTranscriptionState({
    source: "system",
    keySource: "system",
    defaultProvider: getPlatformDefaultTranscriptionProvider(),
    runtimes,
  });
}

async function buildUserTranscriptionState(
  ownerUserId: string | null | undefined,
  languagePreference?: RoomTranscriptionLanguagePreference | null,
): Promise<TranscriptionRuntimeState> {
  if (!ownerUserId) {
    return buildTranscriptionState({
      source: "user",
      keySource: "user",
      defaultProvider: null,
      runtimes: new Map(),
    });
  }

  const [defaultProvider, credentialMap] = await Promise.all([
    getUserDefaultTranscriptionProvider(ownerUserId),
    getStoredUserTranscriptionProviderCredentials(ownerUserId),
  ]);
  const runtimes = new Map(
    getSupportedTranscriptionProviders().map((provider) => [
      provider,
      buildRuntimeFromProvider(
        provider,
        credentialMap.get(provider)?.apiKey ?? null,
        "user",
        languagePreference,
      ),
    ]),
  );

  return buildTranscriptionState({
    source: "user",
    keySource: "user",
    defaultProvider,
    runtimes,
  });
}

export async function resolveUserDefaultTranscriptionRuntimeForOwner(
  ownerUserId: string | null | undefined,
): Promise<ResolvedTranscriptionRuntime | null> {
  const state = await buildUserTranscriptionState(ownerUserId);
  return resolveTranscriptionRuntimeFromState(state, true, null);
}

export async function resolveRoomVoiceRuntimeForOwner(
  ownerUserId: string | null | undefined,
  preferences?: Partial<RoomVoiceRuntimePreferences>,
): Promise<RoomVoiceRuntime> {
  const transcriberEnabled = isTranscriberEnabled();
  const mode = getUserProviderKeysMode();
  const normalizedPreferences: RoomVoiceRuntimePreferences = {
    sourcePreference: normalizeSourcePreferenceForMode(preferences?.sourcePreference, mode),
    transcriptionProviderPreference: preferences?.transcriptionProviderPreference ?? null,
    transcriptionLanguagePreference: preferences?.transcriptionLanguagePreference ?? null,
  };

  const [userLivekit, userTranscription, systemQuotaGate] = await Promise.all([
    resolveUserOwnedLivekitCredentials(ownerUserId),
    buildUserTranscriptionState(
      ownerUserId,
      normalizedPreferences.transcriptionLanguagePreference,
    ),
    ownerUserId && transcriberEnabled
      ? getPlatformTranscriptionUsageGate(ownerUserId)
      : Promise.resolve({ exceeded: false } as const),
  ]);

  const contexts = {
    user: {
      livekit: userLivekit,
      transcription: userTranscription,
    },
    system: {
      livekit: resolvePlatformLivekitCredentials(),
      transcription: buildPlatformTranscriptionState(
        normalizedPreferences.transcriptionLanguagePreference,
      ),
    },
  } satisfies Record<RoomVoiceSourcePreference, VoiceSourceContext>;

  const userRuntime = buildCandidateFromContext(
    contexts.user,
    transcriberEnabled,
    normalizedPreferences.transcriptionProviderPreference,
    "user",
  );
  const systemRuntime = applyPlatformUsageGate(
    buildCandidateFromContext(
      contexts.system,
      transcriberEnabled,
      normalizedPreferences.transcriptionProviderPreference,
      "system",
    ),
    systemQuotaGate.exceeded ? getPlatformTranscriptionQuotaExceededMessage() : null,
  );

  const userSourceAvailable = isSourceUsable(contexts.user, transcriberEnabled);
  const systemSourceAvailable = isSourceUsable(
    contexts.system,
    transcriberEnabled,
    systemQuotaGate.exceeded,
  );

  if (mode === "false") {
    const runtime = {
      livekit: systemRuntime.livekit,
      transcription: systemRuntime.transcription,
      transcriberEnabled,
      source: systemRuntime.source,
      ready: systemRuntime.ready,
      error: systemRuntime.ready
        ? null
        : (systemRuntime.error ?? buildVoiceRuntimeError(mode, transcriberEnabled)),
      selection: buildSelectionState({
        contexts,
        mode,
        preferences: normalizedPreferences,
        runtime: systemRuntime,
        transcriberEnabled,
        systemSourceAvailable,
        userSourceAvailable,
      }),
    } satisfies RoomVoiceRuntime;
    return runtime;
  }

  if (mode === "full" || normalizedPreferences.sourcePreference === "user") {
    return {
      livekit: userRuntime.livekit,
      transcription: userRuntime.transcription,
      transcriberEnabled,
      source: userRuntime.source,
      ready: userRuntime.ready,
      error: userRuntime.ready ? null : (userRuntime.error ?? buildVoiceRuntimeError(mode, transcriberEnabled)),
      selection: buildSelectionState({
        contexts,
        mode,
        preferences: normalizedPreferences,
        runtime: userRuntime,
        transcriberEnabled,
        systemSourceAvailable,
        userSourceAvailable,
      }),
    };
  }

  if (normalizedPreferences.sourcePreference === "system") {
    return {
      livekit: systemRuntime.livekit,
      transcription: systemRuntime.transcription,
      transcriberEnabled,
      source: systemRuntime.source,
      ready: systemRuntime.ready,
      error:
        systemRuntime.ready
          ? null
          : (systemRuntime.error ?? buildVoiceRuntimeError(mode, transcriberEnabled)),
      selection: buildSelectionState({
        contexts,
        mode,
        preferences: normalizedPreferences,
        runtime: systemRuntime,
        transcriberEnabled,
        systemSourceAvailable,
        userSourceAvailable,
      }),
    };
  }

  if (userRuntime.ready) {
    return {
      livekit: userRuntime.livekit,
      transcription: userRuntime.transcription,
      transcriberEnabled,
      source: userRuntime.source,
      ready: true,
      error: null,
      selection: buildSelectionState({
        contexts,
        mode,
        preferences: normalizedPreferences,
        runtime: userRuntime,
        transcriberEnabled,
        systemSourceAvailable,
        userSourceAvailable,
      }),
    };
  }

  if (systemRuntime.ready) {
    console.info("Room voice runtime fell back to platform bundle", {
      ownerUserId,
      transcriberEnabled,
      userLivekitConfigured: userRuntime.livekit.configured,
      userTranscriptionConfigured: Boolean(userRuntime.transcription?.configured),
      platformTranscriptionProvider: systemRuntime.transcription?.provider ?? null,
    });

    return {
      livekit: systemRuntime.livekit,
      transcription: systemRuntime.transcription,
      transcriberEnabled,
      source: systemRuntime.source,
      ready: true,
      error: null,
      selection: buildSelectionState({
        contexts,
        mode,
        preferences: normalizedPreferences,
        runtime: systemRuntime,
        transcriberEnabled,
        systemSourceAvailable,
        userSourceAvailable,
      }),
    };
  }

  const unavailableRuntime = pickPreferredUnavailableVoiceRuntime(userRuntime, systemRuntime);
  console.warn("Room voice runtime is unavailable", {
    ownerUserId,
    mode,
    transcriberEnabled,
    userLivekitConfigured: userRuntime.livekit.configured,
    userTranscriptionConfigured: Boolean(userRuntime.transcription?.configured),
    platformLivekitConfigured: systemRuntime.livekit.configured,
    platformTranscriptionConfigured: Boolean(systemRuntime.transcription?.configured),
  });

  return {
    livekit: unavailableRuntime.livekit,
    transcription: unavailableRuntime.transcription,
    transcriberEnabled,
    source: "unavailable",
    ready: false,
    error:
      unavailableRuntime.error ??
      systemRuntime.error ??
      buildVoiceRuntimeError(mode, transcriberEnabled),
    selection: buildSelectionState({
      contexts,
      mode,
      preferences: normalizedPreferences,
      runtime: unavailableRuntime,
      transcriberEnabled,
      systemSourceAvailable,
      userSourceAvailable,
    }),
  };
}

export async function resolveLivekitTransportForRealtimeOrThrow(
  ownerUserId: string | null | undefined,
): Promise<ResolvedLivekitCredentials> {
  const credentials = await resolveLivekitCredentialsForOwner(ownerUserId);
  if (!credentials.configured) {
    throw new Error("LiveKit credentials are unavailable");
  }
  return credentials;
}

export async function getPreferredTranscriptionProviderForRoomVoiceSource(
  ownerUserId: string | null | undefined,
  source: RoomVoiceSourcePreference,
): Promise<TranscriptionProviderName | null> {
  const state =
    source === "user"
      ? await buildUserTranscriptionState(ownerUserId)
      : buildPlatformTranscriptionState();

  return (
    resolveConfiguredTranscriptionProvider(state, null, {
      fallbackToAvailable: true,
    }) ?? null
  );
}

export async function isRoomVoiceSourceAvailableForOwner(
  ownerUserId: string | null | undefined,
  source: RoomVoiceSourcePreference,
): Promise<boolean> {
  const transcriberEnabled = isTranscriberEnabled();
  const [userLivekit, userTranscription, systemQuotaGate] = await Promise.all([
    resolveUserOwnedLivekitCredentials(ownerUserId),
    buildUserTranscriptionState(ownerUserId),
    ownerUserId && transcriberEnabled
      ? getPlatformTranscriptionUsageGate(ownerUserId)
      : Promise.resolve({ exceeded: false } as const),
  ]);
  const contexts = {
    user: {
      livekit: userLivekit,
      transcription: userTranscription,
    },
    system: {
      livekit: resolvePlatformLivekitCredentials(),
      transcription: buildPlatformTranscriptionState(),
    },
  } satisfies Record<RoomVoiceSourcePreference, VoiceSourceContext>;

  if (source === "user") {
    return isSourceUsable(contexts.user, transcriberEnabled);
  }
  return isSourceUsable(contexts.system, transcriberEnabled, systemQuotaGate.exceeded);
}

export async function isTranscriptionProviderAvailableForRoomVoiceSource(
  ownerUserId: string | null | undefined,
  source: RoomVoiceSourcePreference,
  provider: TranscriptionProviderName,
): Promise<boolean> {
  const state =
    source === "user"
      ? await buildUserTranscriptionState(ownerUserId)
      : buildPlatformTranscriptionState();

  return Boolean(state.runtimes.get(provider)?.configured);
}
