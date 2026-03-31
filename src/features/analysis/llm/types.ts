import type { ResolvedConversationLlmRuntime } from "@/lib/llm-provider-keys";
import type { RuntimeSource } from "@/lib/llm-provider-keys";
import type { ConversationOutputLanguage } from "@/lib/room-analysis-profile";

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

export type ArchiveAnalysisPlanningTurnSide = "A" | "B" | "other" | "unknown";

export type ArchiveAnalysisPlanningTurn = {
  index: number;
  speakerLabel: string;
  speakerName: string;
  side: ArchiveAnalysisPlanningTurnSide;
  text: string;
  latestMessageId: string;
};

export type ArchiveAnalysisPlanningInput = {
  roomId: string;
  speakerMap: Record<string, string>;
  turns: ArchiveAnalysisPlanningTurn[];
};

export type RealtimeConversationLlmInvocation = {
  mode: "realtime";
  style: string;
  prompt: string;
  outputLanguage: ConversationOutputLanguage;
  input: RealtimeConversationInput;
  runtime: ResolvedConversationLlmRuntime;
};

export type SummaryConversationLlmInvocation = {
  mode: "summary";
  style: string;
  prompt: string;
  outputLanguage: ConversationOutputLanguage;
  input: SummaryConversationInput;
  runtime: ResolvedConversationLlmRuntime;
};

export type ArchiveAnalysisPlanningLlmInvocation = {
  mode: "archive-plan";
  style: string;
  prompt: string;
  outputLanguage: ConversationOutputLanguage;
  input: ArchiveAnalysisPlanningInput;
  runtime: ResolvedConversationLlmRuntime;
};

export type ConversationLlmInvocation =
  | RealtimeConversationLlmInvocation
  | SummaryConversationLlmInvocation
  | ArchiveAnalysisPlanningLlmInvocation;

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
