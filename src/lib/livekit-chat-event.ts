import { ChatMessage } from "./chat-types";

export const LIVEKIT_CHAT_MESSAGE_TOPIC = "jileme.chat-message.v1";

export type LivekitChatMessageEvent = {
  type: "chat-message";
  version: 1;
  roomId: string;
  message: ChatMessage;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.type === "text" ||
      value.type === "transcript" ||
      value.type === "analysis" ||
      value.type === "summary") &&
    typeof value.senderName === "string" &&
    (value.participantId === null || typeof value.participantId === "string") &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string"
  );
}

export function createLivekitChatMessageEvent(
  roomId: string,
  message: ChatMessage,
): LivekitChatMessageEvent {
  return {
    type: "chat-message",
    version: 1,
    roomId,
    message,
  };
}

export function encodeLivekitChatMessageEvent(event: LivekitChatMessageEvent): Uint8Array {
  return textEncoder.encode(JSON.stringify(event));
}

export function decodeLivekitChatMessageEvent(payload: Uint8Array): LivekitChatMessageEvent | null {
  try {
    const parsed = JSON.parse(textDecoder.decode(payload)) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.type !== "chat-message" || parsed.version !== 1) {
      return null;
    }
    if (typeof parsed.roomId !== "string") {
      return null;
    }
    if (!isChatMessage(parsed.message)) {
      return null;
    }

    return {
      type: "chat-message",
      version: 1,
      roomId: parsed.roomId,
      message: parsed.message,
    };
  } catch {
    return null;
  }
}
