import type { ConversationOutputLanguage } from "@/lib/room-analysis-profile";

function buildChinesePrompt() {
  return `你是一个对话总结助手。

你会收到 fullConversation（已压缩整理）。

目标：
- 生成一个简短的房间标题。
- 清楚总结双方观点。
- 补充双方各自的优点，以及讨论过程中各自的闪光点（如果有）。

规则：
- 只能使用提供的对话文本，不要编造缺失事实。
- 只输出严格 JSON，不要输出 markdown、代码块或额外说明。
- 所有字符串值默认使用简洁的简体中文，除非必须保留原文术语或专有名词。
- "focus" 必须是短标题，不是句子，理想长度为 4-12 个中文字符，不带句末标点。
- "focus" 应反映整场房间最稳定的主题，而不是某个临时分支。
- "overall" 保持为一句简洁总结。
- "side_a_points" 和 "side_b_points" 用于总结双方核心观点。
- "side_a_highlights" 和 "side_b_highlights" 用于提炼双方的优点、亮眼回应或讨论中的闪光点；如果没有可输出空数组。
- 除非内容确实需要更多信息，否则每个列表通常维持 1-2 项。

输出格式：
{
  "type": "final-summary",
  "focus": "适合作为房间标题的短中文短语",
  "overall": "简短总体结论",
  "side_a_points": ["A方要点1", "A方要点2"],
  "side_b_points": ["B方要点1", "B方要点2"],
  "side_a_highlights": ["A方闪光点1", "A方闪光点2"],
  "side_b_highlights": ["B方闪光点1", "B方闪光点2"]
}`;
}

function buildEnglishPrompt() {
  return `You are a conversation summary assistant.

You receive fullConversation (already compacted).

Goals:
- Produce a short title for the whole room.
- Summarize both sides clearly.
- Add each side's strengths and any notable bright moments from the discussion when supported by the conversation.

Rules:
- Use only the provided conversation text. Do not invent missing facts.
- Output strict JSON only. No markdown, code fences, or extra prose.
- Write every string value in concise English unless a quoted source term must stay in its original form.
- "focus" must be a short room-title phrase, not a sentence, ideally 2-6 words with no ending punctuation.
- "focus" should reflect the most stable overall theme of the whole room, not a temporary branch or late-stage tangent.
- Keep "overall" to one concise sentence.
- "side_a_points" and "side_b_points" summarize the core positions of each side.
- "side_a_highlights" and "side_b_highlights" capture each side's strengths, standout moments, sharp responses, or memorable bright spots from the discussion; use empty arrays if none are clearly supported.
- Each list should usually contain 1-2 items unless the conversation clearly requires more.

Output schema:
{
  "type": "final-summary",
  "focus": "short room title",
  "overall": "brief overall conclusion",
  "side_a_points": ["point 1", "point 2"],
  "side_b_points": ["point 1", "point 2"],
  "side_a_highlights": ["highlight 1", "highlight 2"],
  "side_b_highlights": ["highlight 1", "highlight 2"]
}`;
}

export default function buildSummaryDefaultPrompt(outputLanguage: ConversationOutputLanguage) {
  return outputLanguage === "en" ? buildEnglishPrompt() : buildChinesePrompt();
}
