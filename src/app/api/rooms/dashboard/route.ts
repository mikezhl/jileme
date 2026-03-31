import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { toRoomSummary } from "@/lib/room-summary";
import { getUserUsageSummary } from "@/lib/usage-stats";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const [createdRooms, joinedMemberships, usage] = await Promise.all([
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
          messages: {
            where: {
              participantId: {
                startsWith: "archive:",
              },
            },
            orderBy: {
              createdAt: "asc",
            },
            select: {
              participantId: true,
            },
            take: 1,
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
              messages: {
                where: {
                  participantId: {
                    startsWith: "archive:",
                  },
                },
                orderBy: {
                  createdAt: "asc",
                },
                select: {
                  participantId: true,
                },
                take: 1,
              },
            },
          },
        },
        orderBy: {
          lastSeenAt: "desc",
        },
      }),
      getUserUsageSummary(user.id),
    ]);

    return NextResponse.json({
      createdRooms: createdRooms.map((room) => toRoomSummary(room, { currentUserId: user.id })),
      joinedRooms: joinedMemberships.map((membership) => ({
        ...toRoomSummary(membership.room, { currentUserId: user.id }),
        joinedAt: membership.joinedAt.toISOString(),
      })),
      usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard rooms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
