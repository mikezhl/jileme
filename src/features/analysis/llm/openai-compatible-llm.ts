import {
  ConversationLlmInvocation,
  ConversationLlmProvider,
  ConversationLlmProviderResult,
} from "./types";

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type OpenAiCompatibleMessageContent =
  | string
  | Array<{
      type?: string;
      text?: string;
    }>
  | undefined;

function normalizeChatCompletionsPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (/\/v\d+$/i.test(normalized)) {
    return `${normalized}/chat/completions`;
  }
  if (!normalized || normalized === "/") {
    return "/v1/chat/completions";
  }
  return `${normalized}/v1/chat/completions`;
}

function resolveChatCompletionsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.pathname = normalizeChatCompletionsPath(url.pathname);
  return url.toString();
}

function buildUserMessage(invocation: ConversationLlmInvocation) {
  return JSON.stringify(
    {
      mode: invocation.mode,
      style: invocation.style,
      input: invocation.input,
    },
    null,
    2,
  );
}

function extractContentText(content: OpenAiCompatibleMessageContent) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

function normalizeJsonPayload(rawContent: string) {
  const trimmed = rawContent.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizeUsage(
  usage: OpenAiCompatibleResponse["usage"] | undefined,
): ConversationLlmProviderResult["usage"] {
  if (!usage) {
    return null;
  }

  return {
    promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens:
      typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
    totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : null,
  };
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as OpenAiCompatibleResponse;
    return payload.error?.message ?? `${response.status} ${response.statusText}`;
  } catch {
    const text = await response.text().catch(() => "");
    return text || `${response.status} ${response.statusText}`;
  }
}

export class OpenAiCompatibleConversationLlmProvider implements ConversationLlmProvider {
  async invoke(invocation: ConversationLlmInvocation): Promise<ConversationLlmProviderResult> {
    const { runtime } = invocation;
    if (!runtime.baseUrl || !runtime.apiKey || !runtime.model) {
      throw new Error(
        "OpenAI-compatible LLM requires baseUrl, apiKey and model from room owner or platform env",
      );
    }

    const response = await fetch(resolveChatCompletionsUrl(runtime.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.apiKey}`,
      },
      body: JSON.stringify({
        model: runtime.model,
        messages: [
          {
            role: "system",
            content: invocation.prompt,
          },
          {
            role: "user",
            content: buildUserMessage(invocation),
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible LLM request failed: ${await readErrorMessage(response)}`);
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const content = extractContentText(payload.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error("OpenAI-compatible LLM returned empty message content");
    }

    try {
      return {
        content: JSON.parse(normalizeJsonPayload(content)) as Record<string, unknown>,
        usage: normalizeUsage(payload.usage),
      };
    } catch (error) {
      throw new Error(
        `OpenAI-compatible LLM returned non-JSON content: ${
          error instanceof Error ? error.message : "unknown parse error"
        }`,
      );
    }
  }
}
