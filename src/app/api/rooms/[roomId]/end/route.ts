import { RoomStatus } from "@prisma/client";
import { RoomServiceClient, TwirpError } from "livekit-server-sdk";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { resolveProviderCredentialsForOwner } from "@/lib/provider-keys";
import { prisma } from "@/lib/prisma";
import { normalizeRoomId } from "@/lib/room-utils";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export const runtime = "nodejs";

function isTwirpCode(error: unknown, code: string) {
  return (
    error instanceof TwirpError &&
    typeof error.code === "string" &&
    error.code.toLowerCase() === code.toLowerCase()
  );
}

async function disconnectActiveVoiceRoom(roomId: string, ownerUserId: string | null) {
  const credentials = await resolveProviderCredentialsForOwner(ownerUserId);
  if (!credentials.livekitUrl || !credentials.livekitApiKey || !credentials.livekitApiSecret) {
    console.warn("Skip LiveKit room disconnect due to missing credentials", {
      roomId,
      ownerUserId,
    });
    return;
  }

  const roomService = new RoomServiceClient(
    credentials.livekitUrl,
    credentials.livekitApiKey,
    credentials.livekitApiSecret,
  );

  try {
    await roomService.deleteRoom(roomId);
    console.info("LiveKit room deleted after end conversation", { roomId });
  } catch (error) {
    if (isTwirpCode(error, "not_found")) {
      return;
    }
    throw error;
  }
}

export async function POST(_request: Request, context: RouteContext) {
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

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        status: true,
        createdById: true,
        endedAt: true,
      },
    });

    if (!room) {
      return NextResponse.json({ error: "room not found" }, { status: 404 });
    }

    if (room.createdById !== user.id) {
      return NextResponse.json({ error: "only room creator can end this room" }, { status: 403 });
    }

    if (room.status === RoomStatus.ENDED) {
      return NextResponse.json({
        room: {
          roomId: room.roomId,
          status: room.status,
          endedAt: room.endedAt?.toISOString() ?? new Date().toISOString(),
        },
      });
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        status: RoomStatus.ENDED,
        endedAt: new Date(),
      },
      select: {
        roomId: true,
        status: true,
        endedAt: true,
        createdById: true,
      },
    });

    try {
      await disconnectActiveVoiceRoom(updated.roomId, updated.createdById);
    } catch (disconnectError) {
      console.error("Failed to disconnect active LiveKit room on room end", {
        roomId: updated.roomId,
        error: disconnectError instanceof Error ? disconnectError.message : disconnectError,
      });
    }

    return NextResponse.json({
      room: {
        roomId: updated.roomId,
        status: updated.status,
        endedAt: updated.endedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to end room";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
