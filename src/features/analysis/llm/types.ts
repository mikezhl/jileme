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
};

export type SummaryConversationLlmInvocation = {
  mode: "summary";
  style: string;
  prompt: string;
  input: SummaryConversationInput;
};

export type ConversationLlmInvocation =
  | RealtimeConversationLlmInvocation
  | SummaryConversationLlmInvocation;

export type ConversationLlmJson = Record<string, unknown>;

export interface ConversationLlmProvider {
  invoke(invocation: ConversationLlmInvocation): Promise<ConversationLlmJson>;
}
