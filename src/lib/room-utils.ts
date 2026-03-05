import { v4 as uuidv4 } from "uuid";

import { Prisma, RoomStatus } from "@prisma/client";

import { DEFAULT_DISPLAY_NAME } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export function normalizeDisplayName(name?: string | null): string {
  const normalized = name?.trim();
  return normalized && normalized.length > 0 ? normalized.slice(0, 40) : DEFAULT_DISPLAY_NAME;
}

export function normalizeRoomId(roomId?: string | null): string {
  return roomId?.trim().toLowerCase() ?? "";
}

export function generateRoomId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 10);
}

export function generateParticipantId(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);

  return `${slug || "guest"}-${uuidv4().slice(0, 8)}`;
}

export async function createOwnedRoom(userId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomId();

    try {
      const room = await prisma.room.create({
        data: {
          roomId,
          createdById: userId,
          participants: {
            create: {
              userId,
            },
          },
        },
      });
      return room;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to generate unique room id");
}

export async function findRoomByRoomId(roomId: string) {
  return prisma.room.findUnique({
    where: { roomId },
  });
}

export async function ensureRoomParticipant(roomRefId: string, userId: string) {
  return prisma.roomParticipant.upsert({
    where: {
      roomRefId_userId: {
        roomRefId,
        userId,
      },
    },
    update: {
      lastSeenAt: new Date(),
    },
    create: {
      roomRefId,
      userId,
    },
  });
}

export function isRoomEnded(status: RoomStatus) {
  return status === RoomStatus.ENDED;
}
