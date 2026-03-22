import { redirect } from "next/navigation";

import RoomPageClient from "@/components/room-page/room-page";
import { getCurrentUser } from "@/lib/auth";
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

  if (!user) {
    const nextPath = `/${encodeURIComponent(roomId || rawRoomId)}`;
    redirect(`/?auth=login&next=${encodeURIComponent(nextPath)}`);
  }

  if (!roomId) {
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
