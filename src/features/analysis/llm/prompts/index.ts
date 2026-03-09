import realtimeCoachPrompt from "./realtime/coach";
import realtimeDefaultPrompt from "./realtime/default";
import summaryDefaultPrompt from "./summary/default";
import summaryStrategicPrompt from "./summary/strategic";

export type PromptMode = "realtime" | "summary";

const promptRegistry: Record<PromptMode, Record<string, string>> = {
  realtime: {
    default: realtimeDefaultPrompt,
    coach: realtimeCoachPrompt,
  },
  summary: {
    default: summaryDefaultPrompt,
    strategic: summaryStrategicPrompt,
  },
};

function normalizeStyle(raw: string | null | undefined) {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return "default";
  }

  return normalized.replace(/[^a-z0-9_-]/g, "");
}

export type PromptResolution = {
  style: string;
  prompt: string;
  fallbackUsed: boolean;
};

export function resolvePromptTemplate(mode: PromptMode, requestedStyle: string | null | undefined): PromptResolution {
  const registry = promptRegistry[mode];
  const style = normalizeStyle(requestedStyle);
  const prompt = registry[style] ?? registry.default;

  return {
    style: registry[style] ? style : "default",
    prompt,
    fallbackUsed: !registry[style],
  };
}
