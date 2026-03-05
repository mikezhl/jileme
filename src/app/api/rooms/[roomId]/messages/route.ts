import { MessageType } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { ChatMessage } from "@/lib/chat-types";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { createRoomServiceClient, publishChatMessageViaLivekit } from "@/lib/livekit-chat-relay";
import { toChatMessage } from "@/lib/messages";
import { resolveProviderCredentialsForOwner } from "@/lib/provider-keys";
import { prisma } from "@/lib/prisma";
import { RoomAccessError, assertRoomNotEnded, getAccessibleRoomOrThrow } from "@/lib/rooms";
import { normalizeRoomId } from "@/lib/room-utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

type PostMessageRequest = {
  participantId?: string;
  content?: string;
};

async function relayMessageToRoom(roomId: string, ownerUserId: string | null, message: ChatMessage) {
  const credentials = await resolveProviderCredentialsForOwner(ownerUserId);
  if (!credentials.livekitUrl || !credentials.livekitApiKey || !credentials.livekitApiSecret) {
    return;
  }

  const roomServiceClient = createRoomServiceClient({
    livekitUrl: credentials.livekitUrl,
    livekitApiKey: credentials.livekitApiKey,
    livekitApiSecret: credentials.livekitApiSecret,
  });

  await publishChatMessageViaLivekit(roomServiceClient, roomId, message);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const { roomId: rawRoomId } = await context.params;
    const roomId = normalizeRoomId(rawRoomId);

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const room = await getAccessibleRoomOrThrow(roomId, user.id);

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");
    const sinceDate = since ? new Date(since) : undefined;
    const hasValidSince = Boolean(sinceDate && !Number.isNaN(sinceDate.getTime()));

    const messages = await prisma.message.findMany({
      where: {
        roomRefId: room.id,
        ...(hasValidSince && sinceDate
          ? {
              createdAt: {
                gt: sinceDate,
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: "asc",
      },
      ...(hasValidSince ? { take: MESSAGE_PAGE_SIZE } : {}),
    });

    return NextResponse.json({
      messages: messages.map(toChatMessage),
    });
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const { roomId: rawRoomId } = await context.params;
    const roomId = normalizeRoomId(rawRoomId);

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const body = (await request.json()) as PostMessageRequest;
    const content = body?.content?.trim();

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const room = await getAccessibleRoomOrThrow(roomId, user.id);
    assertRoomNotEnded(room.status);

    const message = await prisma.message.create({
      data: {
        roomRefId: room.id,
        type: MessageType.TEXT,
        senderName: user.username,
        senderUserId: user.id,
        participantId: body.participantId?.trim() || null,
        content,
      },
    });
    const chatMessage = toChatMessage(message);

    try {
      await relayMessageToRoom(roomId, room.createdById, chatMessage);
    } catch (relayError) {
      console.warn("Failed to relay text message through LiveKit data channel", {
        roomId,
        messageId: chatMessage.id,
        error: relayError instanceof Error ? relayError.message : relayError,
      });
    }

    return NextResponse.json({
      message: chatMessage,
    });
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
