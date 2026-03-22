import { RoomStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  getPreferredTranscriptionProviderForRoomVoiceSource,
  isTranscriptionProviderAvailableForRoomVoiceSource,
  resolveRoomVoiceRuntimeForOwner,
} from "@/features/transcription/core/runtime";
import { requireApiUser } from "@/lib/auth-guard";
import { buildRoomVoiceProviderModule } from "@/lib/provider-modules";
import { prisma } from "@/lib/prisma";
import {
  getRoomVoiceRuntimePreferences,
  normalizeRoomTranscriptionProviderPreference,
  parseRoomVoiceSourcePreference,
  toPrismaRoomTranscriptionProvider,
  toPrismaRoomVoiceSource,
} from "@/lib/room-voice-preferences";
import { normalizeRoomId } from "@/lib/room-utils";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

type UpdateRoomVoiceSettingsRequest = {
  source?: string;
  transcriptionProvider?: string;
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

    const body = (await request.json()) as UpdateRoomVoiceSettingsRequest;
    const requestedSourceProvided = Object.prototype.hasOwnProperty.call(body ?? {}, "source");
    const requestedProviderProvided = Object.prototype.hasOwnProperty.call(
      body ?? {},
      "transcriptionProvider",
    );
    if (!requestedSourceProvided && !requestedProviderProvided) {
      return NextResponse.json(
        { error: "source or transcriptionProvider must be provided" },
        { status: 400 },
      );
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        status: true,
        createdById: true,
        voiceSourcePreference: true,
        transcriptionProviderPreference: true,
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
      return NextResponse.json(
        { error: "only room creator can update voice settings" },
        { status: 403 },
      );
    }

    if (room.status === RoomStatus.ENDED) {
      return NextResponse.json({ error: "room has ended" }, { status: 403 });
    }

    const currentPreferences = getRoomVoiceRuntimePreferences(room);

    const requestedSource = requestedSourceProvided
      ? parseRoomVoiceSourcePreference(body.source)
      : currentPreferences.sourcePreference;
    if (requestedSourceProvided && !requestedSource) {
      return NextResponse.json({ error: "source must be user or system" }, { status: 400 });
    }

    let nextSourcePreference = requestedSource ?? null;
    let nextTranscriptionProviderPreference = currentPreferences.transcriptionProviderPreference;

    let nextRuntime = await resolveRoomVoiceRuntimeForOwner(room.createdById, {
      sourcePreference: nextSourcePreference,
      transcriptionProviderPreference: nextTranscriptionProviderPreference,
    });

    if (requestedSource) {
      nextRuntime = await resolveRoomVoiceRuntimeForOwner(room.createdById, {
        sourcePreference: requestedSource,
        transcriptionProviderPreference: currentPreferences.transcriptionProviderPreference,
      });
      const sourceOption = nextRuntime.selection.sourceOptions.find(
        (item) => item.value === requestedSource,
      );
      if (!sourceOption) {
        return NextResponse.json(
          { error: "requested source is not allowed in the current key mode" },
          { status: 400 },
        );
      }
      if (!sourceOption.available) {
        return NextResponse.json(
          { error: "requested source is not fully configured for voice transcription" },
          { status: 400 },
        );
      }

      if (
        currentPreferences.transcriptionProviderPreference &&
        !(await isTranscriptionProviderAvailableForRoomVoiceSource(
          room.createdById,
          requestedSource,
          currentPreferences.transcriptionProviderPreference,
        ))
      ) {
        nextTranscriptionProviderPreference =
          await getPreferredTranscriptionProviderForRoomVoiceSource(
            room.createdById,
            requestedSource,
          );
      }
    }

    const providerSource = nextSourcePreference ?? nextRuntime.selection.selectedSource;
    if (requestedProviderProvided) {
      const requestedProvider = normalizeRoomTranscriptionProviderPreference(
        body.transcriptionProvider,
      );
      if (!requestedProvider) {
        return NextResponse.json(
          { error: "transcriptionProvider must be deepgram or dashscope" },
          { status: 400 },
        );
      }

      if (!providerSource) {
        return NextResponse.json(
          { error: "voice source must be selected before changing transcription channel" },
          { status: 400 },
        );
      }

      const providerAvailable = await isTranscriptionProviderAvailableForRoomVoiceSource(
        room.createdById,
        providerSource,
        requestedProvider,
      );
      if (!providerAvailable) {
        return NextResponse.json(
          { error: "requested transcription channel is not configured for the selected source" },
          { status: 400 },
        );
      }

      if (!nextSourcePreference) {
        nextSourcePreference = providerSource;
      }
      nextTranscriptionProviderPreference = requestedProvider;
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        voiceSourcePreference: nextSourcePreference
          ? toPrismaRoomVoiceSource(nextSourcePreference)
          : null,
        transcriptionProviderPreference: toPrismaRoomTranscriptionProvider(
          nextTranscriptionProviderPreference,
        ),
      },
      select: {
        createdById: true,
        voiceSourcePreference: true,
        transcriptionProviderPreference: true,
      },
    });

    const voiceRuntime = await resolveRoomVoiceRuntimeForOwner(
      updated.createdById,
      getRoomVoiceRuntimePreferences(updated),
    );

    return NextResponse.json({
      providers: {
        voice: buildRoomVoiceProviderModule(
          voiceRuntime,
          room.createdBy?.username ?? null,
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update voice settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
