import { RoomStatus } from "@prisma/client";

import { resolveConversationLlmRuntimeForOwner } from "@/lib/llm-provider-keys";
import { buildRoomProviderModules } from "@/lib/provider-modules";
import { fromPrismaRoomAnalysisProfile } from "@/lib/room-analysis-profile";
import { getRoomVoiceRuntimePreferences } from "@/lib/room-voice-preferences";
import { resolveRoomVoiceRuntimeForOwner } from "@/features/transcription/core/runtime";
import { isArchiveImportMessage } from "@/lib/archive-room";
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
  const [owner, voiceRuntime, llmRuntime, archiveMessage] = await Promise.all([
    room.createdById
      ? prisma.user.findUnique({
          where: { id: room.createdById },
          select: { username: true },
        })
      : Promise.resolve(null),
    resolveRoomVoiceRuntimeForOwner(
      room.createdById,
      getRoomVoiceRuntimePreferences(room),
    ),
    resolveConversationLlmRuntimeForOwner(room.createdById),
    prisma.message.findFirst({
      where: {
        roomRefId: room.id,
        OR: [
          {
            participantId: {
              startsWith: "archive:",
            },
          },
          {
            externalRef: {
              startsWith: `archive:${room.roomId}:`,
            },
          },
        ],
      },
      select: {
        participantId: true,
        externalRef: true,
      },
    }),
  ]);
  const isCreator = room.createdById === userId;
  const roomVoicePreferences = getRoomVoiceRuntimePreferences(room);
  const providers = buildRoomProviderModules(voiceRuntime, llmRuntime, owner?.username ?? null, {
    profilePreference: fromPrismaRoomAnalysisProfile(room.analysisProfilePreference),
    transcriptionLanguagePreference: roomVoicePreferences.transcriptionLanguagePreference,
  });
  const isArchiveImport = Boolean(
    archiveMessage &&
      isArchiveImportMessage({
        participantId: archiveMessage.participantId,
        externalRef: archiveMessage.externalRef,
        roomId: room.roomId,
      }),
  );

  return {
    room,
    isCreator,
    isArchiveImport,
    isEnded: room.status === RoomStatus.ENDED,
    voiceRuntime,
    llmRuntime,
    ownerUsername: owner?.username ?? null,
    providers,
  };
}
