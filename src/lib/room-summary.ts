export type RoomSummaryRecord = {
  roomId: string;
  name: string | null;
  status: string;
  isPublic: boolean;
  analysisEnabled?: boolean;
  createdById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
  messages?: Array<{
    participantId: string | null;
  }>;
  _count: {
    participants: number;
    messages: number;
  };
};

type ToRoomSummaryOptions = {
  currentUserId?: string | null;
};

function hasArchiveParticipantMessages(room: RoomSummaryRecord) {
  return room.messages?.some((message) => message.participantId?.startsWith("archive:")) ?? false;
}

export function toRoomSummary(room: RoomSummaryRecord, options: ToRoomSummaryOptions = {}) {
  return {
    roomId: room.roomId,
    roomName: room.name,
    status: room.status,
    isPublic: room.isPublic,
    isMine: Boolean(options.currentUserId && room.createdById === options.currentUserId),
    isImportedArchive:
      room.status === "ENDED" &&
      room.analysisEnabled === false &&
      hasArchiveParticipantMessages(room),
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    endedAt: room.endedAt?.toISOString() ?? null,
    participantCount: room._count.participants,
    messageCount: room._count.messages,
  };
}
