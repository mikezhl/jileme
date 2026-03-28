import {
  type ResolvedConversationLlmRuntime,
  type ConversationLlmProviderName,
  resolveConversationLlmRuntimeForOwner,
} from "@/lib/llm-provider-keys";
import {
  getDefaultRoomAnalysisProfilePreference,
  resolveConversationOutputLanguage,
  type RoomAnalysisProfilePreference,
} from "@/lib/room-analysis-profile";
import { type RoomTranscriptionLanguagePreference } from "@/lib/room-transcription-language";
import { MockConversationLlmProvider } from "./mock-llm";
import { OpenAiCompatibleConversationLlmProvider } from "./openai-compatible-llm";
import { resolvePromptProfile, resolvePromptTemplate } from "./prompts";
import { buildEmptyRealtimeAnalysisContent } from "./realtime-analysis";
import {
  ConversationLlmProvider,
  ConversationLlmJson,
  ConversationLlmInvocationResult,
  RealtimeConversationInput,
  SummaryConversationInput,
} from "./types";
import { normalizeConversationLlmError } from "./errors";

const providerRegistry: Record<ConversationLlmProviderName, ConversationLlmProvider> = {
  mock: new MockConversationLlmProvider(),
  "openai-compatible": new OpenAiCompatibleConversationLlmProvider(),
};
const REALTIME_RETRY_DELAYS_MS = [1000, 2000];
const SUMMARY_RETRY_DELAYS_MS = [1000, 2000, 5000];

type ConversationAnalysisPromptOptions = {
  profilePreference?: RoomAnalysisProfilePreference | null;
  transcriptionLanguagePreference?: RoomTranscriptionLanguagePreference | null;
};

function getDefaultAnalysisProfileFromEnv() {
  return (
    process.env.CONVERSATION_ANALYSIS_PROFILE ??
    process.env.CONVERSATION_REALTIME_PROMPT_STYLE ??
    process.env.CONVERSATION_SUMMARY_PROMPT_STYLE ??
    getDefaultRoomAnalysisProfilePreference()
  );
}

function getRequestedAnalysisProfile(
  profilePreference?: RoomAnalysisProfilePreference | null,
) {
  return profilePreference ?? resolvePromptProfile(getDefaultAnalysisProfileFromEnv());
}

export function resolveConversationAnalysisPromptSelection(
  options?: ConversationAnalysisPromptOptions,
) {
  const outputLanguage = resolveConversationOutputLanguage(options?.transcriptionLanguagePreference);
  const profile = getRequestedAnalysisProfile(options?.profilePreference);

  return {
    profile,
    outputLanguage,
  };
}

function getProvider(providerName: ConversationLlmProviderName): ConversationLlmProvider {
  return providerRegistry[providerName];
}

function buildFallbackConversationContent(
  mode: "realtime" | "summary",
  errorMessage: string,
): ConversationLlmJson {
  if (mode === "realtime") {
    return buildEmptyRealtimeAnalysisContent(errorMessage);
  }

  return {
    type: "final-summary",
    focus: "",
    insights: [],
    overall: "",
    side_a_points: [],
    side_b_points: [],
    open_questions: [],
    next_steps: [],
    error: errorMessage,
  };
}

function getRetryDelays(mode: "realtime" | "summary") {
  return mode === "realtime" ? REALTIME_RETRY_DELAYS_MS : SUMMARY_RETRY_DELAYS_MS;
}

function buildFallbackResult(
  mode: "realtime" | "summary",
  source: ConversationLlmInvocationResult["source"],
  errorMessage: string,
): ConversationLlmInvocationResult {
  return {
    content: buildFallbackConversationContent(mode, errorMessage),
    usage: null,
    source,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function invokeWithRetries(
  mode: "realtime" | "summary",
  provider: ConversationLlmProvider,
  invocation: Parameters<ConversationLlmProvider["invoke"]>[0],
  source: ConversationLlmInvocationResult["source"],
): Promise<ConversationLlmInvocationResult> {
  const retryDelays = getRetryDelays(mode);
  let lastErrorMessage = "Unknown LLM error";

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const result = await provider.invoke(invocation);
      return {
        ...result,
        source,
      };
    } catch (error) {
      const normalizedError = normalizeConversationLlmError(error);
      lastErrorMessage = normalizedError.message;

      const isLastAttempt = attempt === retryDelays.length;
      if (!normalizedError.retryable || isLastAttempt) {
        console.error("[conversation-llm] Falling back to empty output", {
          mode,
          attempt: attempt + 1,
          retryable: normalizedError.retryable,
          status: normalizedError.status,
          requestId: normalizedError.requestId,
          error: normalizedError.message,
        });

        return buildFallbackResult(mode, source, lastErrorMessage);
      }

      const retryInMs = retryDelays[attempt];
      console.warn("[conversation-llm] Retrying failed request", {
        mode,
        attempt: attempt + 1,
        retryInMs,
        status: normalizedError.status,
        requestId: normalizedError.requestId,
        error: normalizedError.message,
      });
      await delay(retryInMs);
    }
  }

  return buildFallbackResult(mode, source, lastErrorMessage);
}

export async function invokeRealtimeConversationAnalysis(
  input: RealtimeConversationInput,
  ownerUserId?: string | null,
  runtimeOverride?: ResolvedConversationLlmRuntime,
  promptOptions?: ConversationAnalysisPromptOptions,
): Promise<ConversationLlmInvocationResult> {
  const promptSelection = resolveConversationAnalysisPromptSelection(promptOptions);
  const promptResolution = resolvePromptTemplate(
    "realtime",
    promptSelection.profile,
    promptSelection.outputLanguage,
  );
  let source: ConversationLlmInvocationResult["source"] = "unavailable";

  try {
    const runtime = runtimeOverride ?? (await resolveConversationLlmRuntimeForOwner(ownerUserId));
    source = runtime.source;
    const provider = getProvider(runtime.provider);

    return await invokeWithRetries(
      "realtime",
      provider,
      {
        mode: "realtime",
        style: promptResolution.profile,
        prompt: promptResolution.prompt,
        outputLanguage: promptResolution.outputLanguage,
        input,
        runtime,
      },
      source,
    );
  } catch (error) {
    const normalizedError = normalizeConversationLlmError(error);

    console.error("[conversation-llm] Falling back to empty output", {
      mode: "realtime",
      stage: "runtime",
      error: normalizedError.message,
    });

    return buildFallbackResult("realtime", source, normalizedError.message);
  }
}

export async function invokeConversationSummary(
  input: SummaryConversationInput,
  ownerUserId?: string | null,
  runtimeOverride?: ResolvedConversationLlmRuntime,
  promptOptions?: ConversationAnalysisPromptOptions,
): Promise<ConversationLlmInvocationResult> {
  const promptSelection = resolveConversationAnalysisPromptSelection(promptOptions);
  const promptResolution = resolvePromptTemplate(
    "summary",
    promptSelection.profile,
    promptSelection.outputLanguage,
  );
  let source: ConversationLlmInvocationResult["source"] = "unavailable";

  try {
    const runtime = runtimeOverride ?? (await resolveConversationLlmRuntimeForOwner(ownerUserId));
    source = runtime.source;
    const provider = getProvider(runtime.provider);

    return await invokeWithRetries(
      "summary",
      provider,
      {
        mode: "summary",
        style: promptResolution.profile,
        prompt: promptResolution.prompt,
        outputLanguage: promptResolution.outputLanguage,
        input,
        runtime,
      },
      source,
    );
  } catch (error) {
    const normalizedError = normalizeConversationLlmError(error);

    console.error("[conversation-llm] Falling back to empty output", {
      mode: "summary",
      stage: "runtime",
      error: normalizedError.message,
    });

    return buildFallbackResult("summary", source, normalizedError.message);
  }
}
