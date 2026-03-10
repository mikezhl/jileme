import {
  type ConversationLlmProviderName,
  resolveConversationLlmRuntimeForOwner,
} from "@/lib/llm-provider-keys";
import { MockConversationLlmProvider } from "./mock-llm";
import { OpenAiCompatibleConversationLlmProvider } from "./openai-compatible-llm";
import { resolvePromptTemplate } from "./prompts";
import {
  ConversationLlmProvider,
  ConversationLlmInvocationResult,
  RealtimeConversationInput,
  SummaryConversationInput,
} from "./types";

const providerRegistry: Record<ConversationLlmProviderName, ConversationLlmProvider> = {
  mock: new MockConversationLlmProvider(),
  "openai-compatible": new OpenAiCompatibleConversationLlmProvider(),
};

function getRealtimePromptStyle() {
  return process.env.CONVERSATION_REALTIME_PROMPT_STYLE ?? "default_cn";
}

function getSummaryPromptStyle() {
  return process.env.CONVERSATION_SUMMARY_PROMPT_STYLE ?? "default_cn";
}

export function getConversationAnalysisPromptProfiles() {
  return {
    realtime: resolvePromptTemplate("realtime", getRealtimePromptStyle()).style,
    summary: resolvePromptTemplate("summary", getSummaryPromptStyle()).style,
  };
}

function getProvider(providerName: ConversationLlmProviderName): ConversationLlmProvider {
  return providerRegistry[providerName];
}

export async function invokeRealtimeConversationAnalysis(
  input: RealtimeConversationInput,
  ownerUserId?: string | null,
): Promise<ConversationLlmInvocationResult> {
  const promptResolution = resolvePromptTemplate("realtime", getRealtimePromptStyle());
  const runtime = await resolveConversationLlmRuntimeForOwner(ownerUserId);
  const provider = getProvider(runtime.provider);

  const result = await provider.invoke({
    mode: "realtime",
    style: promptResolution.style,
    prompt: promptResolution.prompt,
    input,
    runtime,
  });

  return {
    ...result,
    source: runtime.source,
  };
}

export async function invokeConversationSummary(
  input: SummaryConversationInput,
  ownerUserId?: string | null,
): Promise<ConversationLlmInvocationResult> {
  const promptResolution = resolvePromptTemplate("summary", getSummaryPromptStyle());
  const runtime = await resolveConversationLlmRuntimeForOwner(ownerUserId);
  const provider = getProvider(runtime.provider);

  const result = await provider.invoke({
    mode: "summary",
    style: promptResolution.style,
    prompt: promptResolution.prompt,
    input,
    runtime,
  });

  return {
    ...result,
    source: runtime.source,
  };
}
