import { MessageType } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { toChatMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { RoomAccessError, assertRoomNotEnded, getAccessibleRoomOrThrow } from "@/lib/rooms";
import { normalizeDisplayName, normalizeRoomId } from "@/lib/room-utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

type IncomingTranscriptionSegment = {
  id?: string;
  text?: string;
  final?: boolean;
  language?: string;
};

type SaveTranscriptionRequest = {
  participantId?: string;
  participantName?: string;
  segments?: IncomingTranscriptionSegment[];
};

function getExternalRef(roomId: string, participantId: string | undefined, segmentId?: string): string | null {
  if (!segmentId) {
    return null;
  }

  return `${roomId}:${participantId ?? "unknown"}:${segmentId}`;
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

    const body = (await request.json()) as SaveTranscriptionRequest;
    const participantId = body.participantId?.trim() || undefined;
    const senderName = normalizeDisplayName(body.participantName);
    const segments = (body.segments ?? []).filter(
      (segment): segment is IncomingTranscriptionSegment =>
        typeof segment?.text === "string" && segment.text.trim().length > 0,
    );

    if (segments.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const room = await getAccessibleRoomOrThrow(roomId, user.id);
    assertRoomNotEnded(room.status);
    const persisted = [];

    for (const segment of segments) {
      if (segment.final === false) {
        continue;
      }

      const externalRef = getExternalRef(roomId, participantId, segment.id);
      const content = segment.text!.trim();

      if (!content) {
        continue;
      }

      if (externalRef) {
        const message = await prisma.message.upsert({
          where: { externalRef },
          create: {
            roomRefId: room.id,
            type: MessageType.TRANSCRIPT,
            senderName,
            participantId: participantId ?? null,
            content,
            externalRef,
          },
          update: {
            content,
            senderName,
            participantId: participantId ?? null,
          },
        });

        persisted.push(message);
      } else {
        const message = await prisma.message.create({
          data: {
            roomRefId: room.id,
            type: MessageType.TRANSCRIPT,
            senderName,
            participantId: participantId ?? null,
            content,
          },
        });
        persisted.push(message);
      }
    }

    return NextResponse.json({
      messages: persisted.map(toChatMessage),
    });
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "Failed to persist transcription segments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
