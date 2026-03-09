import {
  ConversationLlmJson,
  ConversationLlmProvider,
  ConversationLlmInvocation,
} from "./types";

export class MockConversationLlmProvider implements ConversationLlmProvider {
  async invoke(invocation: ConversationLlmInvocation): Promise<ConversationLlmJson> {
    return {
      mode: invocation.mode,
      style: invocation.style,
      prompt: invocation.prompt,
      input: invocation.input,
    };
  }
}
