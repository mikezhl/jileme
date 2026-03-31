import { RoomStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { normalizeRoomId } from "@/lib/room-utils";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext) {
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
        createdById: true,
        status: true,
      },
    });

    if (!room) {
      return NextResponse.json({ error: "room not found" }, { status: 404 });
    }

    if (room.createdById !== user.id) {
      return NextResponse.json({ error: "only room creator can delete this room" }, { status: 403 });
    }

    if (room.status !== RoomStatus.ENDED) {
      return NextResponse.json({ error: "room must be ended before deletion" }, { status: 409 });
    }

    await prisma.room.delete({
      where: { id: room.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete room";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
