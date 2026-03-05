import { RoomStatus } from "@prisma/client";

import { resolveProviderCredentialsForOwner } from "@/lib/provider-keys";
import { prisma } from "@/lib/prisma";

export class RoomAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function findAccessibleRoom(roomId: string, userId: string) {
  return prisma.room.findFirst({
    where: {
      roomId,
      OR: [
        { createdById: userId },
        {
          participants: {
            some: { userId },
          },
        },
      ],
    },
  });
}

export async function getAccessibleRoomOrThrow(roomId: string, userId: string) {
  const room = await findAccessibleRoom(roomId, userId);
  if (!room) {
    throw new RoomAccessError(404, "room not found or not accessible");
  }
  return room;
}

export function assertRoomNotEnded(status: RoomStatus) {
  if (status === RoomStatus.ENDED) {
    throw new RoomAccessError(403, "room has ended and is read-only");
  }
}

export async function buildRoomRuntimeInfo(roomId: string, userId: string) {
  const room = await getAccessibleRoomOrThrow(roomId, userId);
  const credentials = await resolveProviderCredentialsForOwner(room.createdById);
  const isCreator = room.createdById === userId;

  return {
    room,
    isCreator,
    isEnded: room.status === RoomStatus.ENDED,
    credentials,
  };
}
