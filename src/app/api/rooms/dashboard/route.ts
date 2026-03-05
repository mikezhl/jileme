import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toRoomSummary(room: {
  roomId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
  _count: {
    participants: number;
    messages: number;
  };
}) {
  return {
    roomId: room.roomId,
    status: room.status,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    endedAt: room.endedAt?.toISOString() ?? null,
    participantCount: room._count.participants,
    messageCount: room._count.messages,
  };
}

export async function GET() {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const [createdRooms, joinedMemberships] = await Promise.all([
      prisma.room.findMany({
        where: {
          createdById: user.id,
        },
        include: {
          _count: {
            select: {
              participants: true,
              messages: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.roomParticipant.findMany({
        where: {
          userId: user.id,
          room: {
            createdById: {
              not: user.id,
            },
          },
        },
        include: {
          room: {
            include: {
              _count: {
                select: {
                  participants: true,
                  messages: true,
                },
              },
            },
          },
        },
        orderBy: {
          lastSeenAt: "desc",
        },
      }),
    ]);

    return NextResponse.json({
      createdRooms: createdRooms.map(toRoomSummary),
      joinedRooms: joinedMemberships.map((membership) => ({
        ...toRoomSummary(membership.room),
        joinedAt: membership.joinedAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard rooms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
