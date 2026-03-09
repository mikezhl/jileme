import { MockConversationLlmProvider } from "./mock-llm";
import { resolvePromptTemplate } from "./prompts";
import { RealConversationLlmProvider } from "./real-llm";
import {
  ConversationLlmProvider,
  ConversationLlmJson,
  RealtimeConversationInput,
  SummaryConversationInput,
} from "./types";

type ConversationLlmProviderName = "mock" | "real";

const providerRegistry: Record<ConversationLlmProviderName, ConversationLlmProvider> = {
  mock: new MockConversationLlmProvider(),
  real: new RealConversationLlmProvider(),
};

function resolveProviderName(): ConversationLlmProviderName {
  const provider = process.env.CONVERSATION_LLM_PROVIDER?.trim().toLowerCase() ?? "mock";
  if (provider === "mock" || provider === "real") {
    return provider;
  }

  throw new Error(`Unsupported CONVERSATION_LLM_PROVIDER: ${provider}`);
}

function getRealtimePromptStyle() {
  return process.env.CONVERSATION_REALTIME_PROMPT_STYLE ?? "default";
}

function getSummaryPromptStyle() {
  return process.env.CONVERSATION_SUMMARY_PROMPT_STYLE ?? "default";
}

function getProvider(): ConversationLlmProvider {
  const providerName = resolveProviderName();
  return providerRegistry[providerName];
}

export async function invokeRealtimeConversationAnalysis(
  input: RealtimeConversationInput,
): Promise<ConversationLlmJson> {
  const promptResolution = resolvePromptTemplate("realtime", getRealtimePromptStyle());
  const provider = getProvider();

  return provider.invoke({
    mode: "realtime",
    style: promptResolution.style,
    prompt: promptResolution.prompt,
    input,
  });
}

export async function invokeConversationSummary(input: SummaryConversationInput): Promise<ConversationLlmJson> {
  const promptResolution = resolvePromptTemplate("summary", getSummaryPromptStyle());
  const provider = getProvider();

  return provider.invoke({
    mode: "summary",
    style: promptResolution.style,
    prompt: promptResolution.prompt,
    input,
  });
}
