import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { normalizeRoomId } from "@/lib/room-utils";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

type UpdateRoomPublicRequest = {
  isPublic?: boolean;
};

export const runtime = "nodejs";

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

    const body = (await request.json()) as UpdateRoomPublicRequest;
    if (typeof body?.isPublic !== "boolean") {
      return NextResponse.json({ error: "isPublic must be a boolean" }, { status: 400 });
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        id: true,
        createdById: true,
      },
    });

    if (!room) {
      return NextResponse.json({ error: "room not found" }, { status: 404 });
    }

    if (room.createdById !== user.id) {
      return NextResponse.json({ error: "only room creator can update visibility" }, { status: 403 });
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        isPublic: body.isPublic,
      },
      select: {
        roomId: true,
        isPublic: true,
      },
    });

    return NextResponse.json({
      room: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update room visibility";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
