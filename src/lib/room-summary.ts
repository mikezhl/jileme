export type RoomSummaryRecord = {
  roomId: string;
  name: string | null;
  status: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
  _count: {
    participants: number;
    messages: number;
  };
};

export function toRoomSummary(room: RoomSummaryRecord) {
  return {
    roomId: room.roomId,
    roomName: room.name,
    status: room.status,
    isPublic: room.isPublic,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    endedAt: room.endedAt?.toISOString() ?? null,
    participantCount: room._count.participants,
    messageCount: room._count.messages,
  };
}
