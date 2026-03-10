import {
  ConversationLlmProvider,
  ConversationLlmInvocation,
  ConversationLlmProviderResult,
} from "./types";

export class MockConversationLlmProvider implements ConversationLlmProvider {
  async invoke(invocation: ConversationLlmInvocation): Promise<ConversationLlmProviderResult> {
    return {
      content: {
        mode: invocation.mode,
        style: invocation.style,
        prompt: invocation.prompt,
        input: invocation.input,
      },
      usage: null,
    };
  }
}
