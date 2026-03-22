import { redirect } from "next/navigation";

import PublicRoomReadonlyPage from "@/components/public-room-page/public-room-readonly-page";
import RoomPageClient from "@/components/room-page/room-page";
import { getCurrentUser } from "@/lib/auth";
import { toChatMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { findAccessibleRoom } from "@/lib/rooms";
import { ensureRoomParticipant, findRoomByRoomId, normalizeRoomId } from "@/lib/room-utils";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const user = await getCurrentUser();
  const { roomId: rawRoomId } = await params;
  const roomId = normalizeRoomId(rawRoomId);

  if (!roomId) {
    redirect("/");
  }

  if (!user) {
    const publicRoom = await prisma.room.findFirst({
      where: {
        roomId,
        isPublic: true,
      },
      include: {
        createdBy: {
          select: {
            username: true,
          },
        },
        _count: {
          select: {
            participants: true,
            messages: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (publicRoom) {
      return (
        <PublicRoomReadonlyPage
          room={{
            roomId: publicRoom.roomId,
            roomName: publicRoom.name,
            status: publicRoom.status,
            updatedAt: publicRoom.updatedAt.toISOString(),
            endedAt: publicRoom.endedAt?.toISOString() ?? null,
            messageCount: publicRoom._count.messages,
            participantCount: publicRoom._count.participants,
            ownerUsername: publicRoom.createdBy?.username ?? null,
          }}
          messages={publicRoom.messages.map(toChatMessage)}
        />
      );
    }

    const nextPath = `/${encodeURIComponent(roomId)}`;
    const room = await findRoomByRoomId(roomId);
    if (room) {
      redirect(`/?auth=login&next=${encodeURIComponent(nextPath)}`);
    }
    redirect("/");
  }

  let room = await findAccessibleRoom(roomId, user.id);
  if (!room) {
    const publicRoom = await findRoomByRoomId(roomId);
    if (!publicRoom?.isPublic) {
      redirect("/");
    }

    await ensureRoomParticipant(publicRoom.id, user.id);
    room = publicRoom;
  }

  return (
    <RoomPageClient
      roomId={room.roomId}
      initialRoomName={room.name}
      userId={user.id}
      username={user.username}
    />
  );
}
