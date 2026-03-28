import { RoomStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { advanceRealtimeAnalysisCursorToLatestConversationMessage } from "@/features/analysis/service/analysis-control";
import { requireApiUser } from "@/lib/auth-guard";
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

type UpdateRoomAnalysisRequest = {
  enabled?: boolean;
  profile?: string;
};

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

    const body = (await request.json()) as UpdateRoomAnalysisRequest;
    const enabledProvided = Object.prototype.hasOwnProperty.call(body ?? {}, "enabled");
    const profileProvided = Object.prototype.hasOwnProperty.call(body ?? {}, "profile");
    if (!enabledProvided && !profileProvided) {
      return NextResponse.json({ error: "enabled or profile must be provided" }, { status: 400 });
    }
    if (enabledProvided && typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }

    const nextProfile = profileProvided
      ? normalizeRoomAnalysisProfilePreference(body.profile)
      : null;
    if (profileProvided && !nextProfile) {
      return NextResponse.json({ error: "profile must be default or humor" }, { status: 400 });
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        status: true,
        createdById: true,
        analysisEnabled: true,
        analysisProfilePreference: true,
        transcriptionLanguagePreference: true,
        createdBy: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "room not found" }, { status: 404 });
    }

    if (room.createdById !== user.id) {
      return NextResponse.json({ error: "only room creator can update analysis settings" }, { status: 403 });
    }

    if (room.status === RoomStatus.ENDED) {
      return NextResponse.json({ error: "room has ended" }, { status: 403 });
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        ...(enabledProvided ? { analysisEnabled: body.enabled } : {}),
        ...(profileProvided
          ? { analysisProfilePreference: toPrismaRoomAnalysisProfile(nextProfile)! }
          : {}),
      },
      select: {
        roomId: true,
        analysisEnabled: true,
        analysisProfilePreference: true,
        transcriptionLanguagePreference: true,
        createdById: true,
      },
    });

    if (enabledProvided && !updated.analysisEnabled) {
      await advanceRealtimeAnalysisCursorToLatestConversationMessage(room.id);
    }

    const llmRuntime = await resolveConversationLlmRuntimeForOwner(updated.createdById);
    const analysisProvider = buildRoomAnalysisProviderModule(
      llmRuntime,
      room.createdBy?.username ?? null,
      {
        profilePreference: fromPrismaRoomAnalysisProfile(updated.analysisProfilePreference),
        transcriptionLanguagePreference: fromPrismaRoomTranscriptionLanguage(
          updated.transcriptionLanguagePreference,
        ),
      },
    );

    return NextResponse.json({
      room: updated,
      providers: {
        analysis: analysisProvider,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update analysis settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
