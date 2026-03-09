import {
  ConversationLlmProvider,
  ConversationLlmInvocation,
  ConversationLlmJson,
} from "./types";

export class RealConversationLlmProvider implements ConversationLlmProvider {
  async invoke(invocation: ConversationLlmInvocation): Promise<ConversationLlmJson> {
    void invocation;
    throw new Error("CONVERSATION_LLM_PROVIDER=real is not implemented yet");
  }
}
