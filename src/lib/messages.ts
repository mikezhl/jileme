import { Message, MessageType } from "@prisma/client";

import { ChatMessage } from "@/lib/chat-types";

export function toChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    type: message.type === MessageType.TEXT ? "text" : "transcript",
    senderName: message.senderName,
    participantId: message.participantId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
