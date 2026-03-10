import type { ResolvedConversationLlmRuntime } from "@/lib/llm-provider-keys";
import type { RuntimeSource } from "@/lib/llm-provider-keys";

export type RealtimeConversationInput = {
  roomId: string;
  speakerMap: Record<string, string>;
  historyConversation: string;
  currentRoundConversation: string;
};

export type SummaryConversationInput = {
  roomId: string;
  speakerMap: Record<string, string>;
  fullConversation: string;
};

export type RealtimeConversationLlmInvocation = {
  mode: "realtime";
  style: string;
  prompt: string;
  input: RealtimeConversationInput;
  runtime: ResolvedConversationLlmRuntime;
};

export type SummaryConversationLlmInvocation = {
  mode: "summary";
  style: string;
  prompt: string;
  input: SummaryConversationInput;
  runtime: ResolvedConversationLlmRuntime;
};

export type ConversationLlmInvocation =
  | RealtimeConversationLlmInvocation
  | SummaryConversationLlmInvocation;

export type ConversationLlmJson = Record<string, unknown>;

export type ConversationLlmUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ConversationLlmProviderResult = {
  content: ConversationLlmJson;
  usage: ConversationLlmUsage | null;
};

export type ConversationLlmInvocationResult = ConversationLlmProviderResult & {
  source: RuntimeSource;
};

export interface ConversationLlmProvider {
  invoke(invocation: ConversationLlmInvocation): Promise<ConversationLlmProviderResult>;
}
