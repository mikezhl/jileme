import { MessageType, RoomStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  clearArchiveAnalysisState,
  getArchiveAnalysisSnapshot,
  markArchiveAnalysisFailed,
  queueArchiveAnalysisGeneration,
} from "@/features/analysis/service/analysis-control";
import { enqueueArchiveAnalysisGenerationEvent } from "@/features/analysis/service/analysis-events";
import { ensureConversationAnalysisWorker } from "@/features/analysis/runtime/worker-manager";
import { requireApiUser } from "@/lib/auth-guard";
import { isArchiveImportMessage } from "@/lib/archive-room";
import { resolveConversationLlmRuntimeForOwner } from "@/lib/llm-provider-keys";
import { buildRoomAnalysisProviderModule } from "@/lib/provider-modules";
import { prisma } from "@/lib/prisma";
import {
  fromPrismaRoomAnalysisProfile,
  normalizeRoomAnalysisProfilePreference,
  toPrismaRoomAnalysisProfile,
} from "@/lib/room-analysis-profile";
import { fromPrismaRoomTranscriptionLanguage } from "@/lib/room-transcription-language";
import { normalizeRoomId } from "@/lib/room-utils";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

type StartArchiveAnalysisRequest = {
  profile?: string;
};

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

async function loadArchiveAnalysisRoom(roomId: string) {
  return prisma.room.findUnique({
    where: { roomId },
    select: {
      id: true,
      roomId: true,
      status: true,
      analysisEnabled: true,
      analysisProfilePreference: true,
      transcriptionLanguagePreference: true,
      createdById: true,
      createdBy: {
        select: {
          username: true,
        },
      },
    },
  });
}

async function isImportedArchiveAnalysisRoom(roomRefId: string, roomId: string) {
  const archiveMessage = await prisma.message.findFirst({
    where: {
      roomRefId,
      OR: [
        {
          participantId: {
            startsWith: "archive:",
          },
        },
        {
          externalRef: {
            startsWith: `archive:${roomId}:`,
          },
        },
      ],
    },
    select: {
      participantId: true,
      externalRef: true,
    },
  });

  return Boolean(
    archiveMessage &&
      isArchiveImportMessage({
        participantId: archiveMessage.participantId,
        externalRef: archiveMessage.externalRef,
        roomId,
      }),
  );
}

function buildArchiveAnalysisProvider(
  room: Pick<
    NonNullable<Awaited<ReturnType<typeof loadArchiveAnalysisRoom>>>,
    "analysisProfilePreference" | "transcriptionLanguagePreference" | "createdBy"
  >,
  llmRuntime: Awaited<ReturnType<typeof resolveConversationLlmRuntimeForOwner>>,
) {
  return buildRoomAnalysisProviderModule(
    llmRuntime,
    room.createdBy?.username ?? null,
    {
      profilePreference: fromPrismaRoomAnalysisProfile(room.analysisProfilePreference),
      transcriptionLanguagePreference: fromPrismaRoomTranscriptionLanguage(
        room.transcriptionLanguagePreference,
      ),
    },
  );
}

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
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

    const body = (await request.json().catch(() => ({}))) as StartArchiveAnalysisRequest;
    const requestedProfileProvided = Object.prototype.hasOwnProperty.call(body ?? {}, "profile");
    const nextProfile = requestedProfileProvided
      ? normalizeRoomAnalysisProfilePreference(body.profile)
      : null;
    if (requestedProfileProvided && !nextProfile) {
      return NextResponse.json({ error: "profile must be default or humor" }, { status: 400 });
    }

    const room = await loadArchiveAnalysisRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "room not found" }, { status: 404 });
    }

    if (room.createdById !== user.id) {
      return NextResponse.json(
        { error: "only room creator can generate archive analysis" },
        { status: 403 },
      );
    }

    if (room.status !== RoomStatus.ENDED) {
      return NextResponse.json(
        { error: "archive analysis is only available after the room has ended" },
        { status: 403 },
      );
    }

    if (!(await isImportedArchiveAnalysisRoom(room.id, room.roomId))) {
      return NextResponse.json(
        { error: "archive analysis is only available for imported archive rooms" },
        { status: 403 },
      );
    }

    const currentArchiveAnalysis = await getArchiveAnalysisSnapshot(room.id);
    if (
      currentArchiveAnalysis.status === "QUEUED" ||
      currentArchiveAnalysis.status === "RUNNING" ||
      currentArchiveAnalysis.status === "COMPLETED"
    ) {
      const llmRuntime = await resolveConversationLlmRuntimeForOwner(room.createdById);
      const analysisProvider = buildArchiveAnalysisProvider(room, llmRuntime);

      return NextResponse.json({
        room: {
          analysisEnabled: room.analysisEnabled,
          archiveAnalysis: serializeArchiveAnalysisSnapshot(currentArchiveAnalysis),
        },
        providers: {
          analysis: analysisProvider,
        },
      });
    }

    const updatedRoom =
      requestedProfileProvided && nextProfile
        ? await prisma.room.update({
            where: { id: room.id },
            data: {
              analysisProfilePreference: toPrismaRoomAnalysisProfile(nextProfile)!,
            },
            select: {
              id: true,
              analysisEnabled: true,
              analysisProfilePreference: true,
              transcriptionLanguagePreference: true,
              createdById: true,
            },
          })
        : {
            id: room.id,
            analysisEnabled: room.analysisEnabled,
            analysisProfilePreference: room.analysisProfilePreference,
            transcriptionLanguagePreference: room.transcriptionLanguagePreference,
            createdById: room.createdById,
          };

    await queueArchiveAnalysisGeneration(updatedRoom.id);
    try {
      await enqueueArchiveAnalysisGenerationEvent(updatedRoom.id);
    } catch (error) {
      await markArchiveAnalysisFailed(
        updatedRoom.id,
        error instanceof Error ? error.message : "Failed to queue archive analysis generation",
      );
      throw error;
    }

    void ensureConversationAnalysisWorker({
      waitForReady: false,
      reason: `archive-analysis:${room.roomId}`,
    }).catch((workerError) => {
      console.warn("Failed to ensure conversation analysis worker for archive generation", {
        roomId: room.roomId,
        error: workerError instanceof Error ? workerError.message : workerError,
      });
    });

    const [archiveAnalysis, llmRuntime] = await Promise.all([
      getArchiveAnalysisSnapshot(updatedRoom.id),
      resolveConversationLlmRuntimeForOwner(updatedRoom.createdById),
    ]);
    const analysisProvider = buildArchiveAnalysisProvider(
      {
        ...room,
        analysisProfilePreference: updatedRoom.analysisProfilePreference,
        transcriptionLanguagePreference: updatedRoom.transcriptionLanguagePreference,
      },
      llmRuntime,
    );

    return NextResponse.json({
      room: {
        analysisEnabled: updatedRoom.analysisEnabled,
        archiveAnalysis: serializeArchiveAnalysisSnapshot(archiveAnalysis),
      },
      providers: {
        analysis: analysisProvider,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start archive analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

    const room = await loadArchiveAnalysisRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "room not found" }, { status: 404 });
    }

    if (room.createdById !== user.id) {
      return NextResponse.json(
        { error: "only room creator can clear archive analysis" },
        { status: 403 },
      );
    }

    if (room.status !== RoomStatus.ENDED) {
      return NextResponse.json(
        { error: "archive analysis is only available after the room has ended" },
        { status: 403 },
      );
    }

    if (!(await isImportedArchiveAnalysisRoom(room.id, room.roomId))) {
      return NextResponse.json(
        { error: "archive analysis is only available for imported archive rooms" },
        { status: 403 },
      );
    }

    const currentArchiveAnalysis = await getArchiveAnalysisSnapshot(room.id);
    if (
      currentArchiveAnalysis.status === "QUEUED" ||
      currentArchiveAnalysis.status === "RUNNING"
    ) {
      return NextResponse.json(
        { error: "archive analysis is still running" },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      prisma.message.deleteMany({
        where: {
          roomRefId: room.id,
          type: MessageType.AI_ANALYSIS,
          externalRef: {
            startsWith: `analysis:archive-realtime:${room.id}:`,
          },
        },
      }),
      prisma.message.deleteMany({
        where: {
          roomRefId: room.id,
          type: MessageType.AI_SUMMARY,
          externalRef: `analysis:summary:${room.id}`,
        },
      }),
    ]);
    await clearArchiveAnalysisState(room.id);

    const [archiveAnalysis, llmRuntime] = await Promise.all([
      getArchiveAnalysisSnapshot(room.id),
      resolveConversationLlmRuntimeForOwner(room.createdById),
    ]);

    return NextResponse.json({
      room: {
        analysisEnabled: room.analysisEnabled,
        archiveAnalysis: serializeArchiveAnalysisSnapshot(archiveAnalysis),
      },
      providers: {
        analysis: buildArchiveAnalysisProvider(room, llmRuntime),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear archive analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
