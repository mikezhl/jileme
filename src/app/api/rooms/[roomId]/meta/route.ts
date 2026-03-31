import { NextResponse } from "next/server";

import { getArchiveAnalysisSnapshot } from "@/features/analysis/service/analysis-control";
import { requireApiUser } from "@/lib/auth-guard";
import { isRoomSpeakerSwitchEnabled } from "@/lib/env";
import { getRoomParticipationSnapshot } from "@/lib/room-members";
import { getRoomOwnerPresence, touchRoomParticipantHeartbeat } from "@/lib/room-presence";
import { RoomAccessError, buildRoomRuntimeInfo } from "@/lib/rooms";
import { normalizeRoomId } from "@/lib/room-utils";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export const runtime = "nodejs";

function serializeArchiveAnalysisSnapshot(
  snapshot: Awaited<ReturnType<typeof getArchiveAnalysisSnapshot>>,
) {
  return {
    status: snapshot.status.toLowerCase(),
    stage: snapshot.stage.toLowerCase(),
    plannedCount: snapshot.plannedCount,
    completedCount: snapshot.completedCount,
    error: snapshot.error,
    requestedAt: snapshot.requestedAt?.toISOString() ?? null,
    startedAt: snapshot.startedAt?.toISOString() ?? null,
    completedAt: snapshot.completedAt?.toISOString() ?? null,
  };
}

export async function GET(_request: Request, context: RouteContext) {
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

    const runtimeInfo = await buildRoomRuntimeInfo(roomId, user.id);
    await touchRoomParticipantHeartbeat(runtimeInfo.room.id, user.id);
    const [participation, ownerPresence, archiveAnalysis] = await Promise.all([
      getRoomParticipationSnapshot(
        runtimeInfo.room.id,
        runtimeInfo.room.createdById,
        user.id,
      ),
      getRoomOwnerPresence(
        runtimeInfo.room.id,
        runtimeInfo.room.createdById,
      ),
      getArchiveAnalysisSnapshot(runtimeInfo.room.id),
    ]);

    return NextResponse.json({
      room: {
        roomId: runtimeInfo.room.roomId,
        roomName: runtimeInfo.room.name,
        sourceUrl: runtimeInfo.room.sourceUrl,
        status: runtimeInfo.room.status,
        isPublic: runtimeInfo.room.isPublic,
        analysisEnabled: runtimeInfo.room.analysisEnabled,
        isArchiveImport: runtimeInfo.isArchiveImport,
        endedAt: runtimeInfo.room.endedAt?.toISOString() ?? null,
        isCreator: runtimeInfo.isCreator,
        ownerPresence: {
          active:
            runtimeInfo.isCreator || runtimeInfo.room.createdById === user.id
              ? true
              : ownerPresence.active,
          lastSeenAt: ownerPresence.lastSeenAt?.toISOString() ?? null,
          timeoutMs: ownerPresence.timeoutMs,
        },
        currentUserCanParticipate: participation.canParticipate,
        members: participation.members.map((member) => ({
          userId: member.userId,
          username: member.username,
          joinedAt: member.joinedAt.toISOString(),
          lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
          isOwner: member.isOwner,
          isOnline: member.isOnline,
          debateSlot: member.debateSlot,
          canParticipate: member.canParticipate,
        })),
        archiveAnalysis: serializeArchiveAnalysisSnapshot(archiveAnalysis),
      },
      providers: runtimeInfo.providers,
      features: {
        speakerSwitchEnabled: isRoomSpeakerSwitchEnabled(),
      },
    });
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch room metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
