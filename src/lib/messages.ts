import { Message, MessageType } from "@prisma/client";

import { ChatMessage } from "@/lib/chat-types";

function toChatMessageType(type: MessageType): ChatMessage["type"] {
  switch (type) {
    case MessageType.TEXT:
      return "text";
    case MessageType.TRANSCRIPT:
      return "transcript";
    case MessageType.AI_ANALYSIS:
      return "analysis";
    case MessageType.AI_SUMMARY:
      return "summary";
    default:
      return "text";
  }
}

export function toChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    type: toChatMessageType(message.type),
    senderName: message.senderName,
    participantId: message.participantId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
