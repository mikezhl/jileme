import { RoomStatus } from "@prisma/client";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { optionalEnv } from "@/lib/env";
import { ensureTranscriberDispatch, isTranscriberEnabled } from "@/lib/livekit-transcriber-dispatch";
import { resolveProviderCredentialsForOwner } from "@/lib/provider-keys";
import { prisma } from "@/lib/prisma";
import { RoomAccessError, getAccessibleRoomOrThrow } from "@/lib/rooms";
import { normalizeRoomId } from "@/lib/room-utils";
import { ensureTranscriberWorker } from "@/lib/transcriber-worker-manager";

export const runtime = "nodejs";

type TokenRequest = {
  roomId?: string;
};

export async function POST(request: Request) {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const body = (await request.json()) as TokenRequest;
    const roomId = normalizeRoomId(body?.roomId);

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const room = await getAccessibleRoomOrThrow(roomId, user.id);
    if (room.status === RoomStatus.ENDED) {
      return NextResponse.json({ error: "room has ended and voice is unavailable" }, { status: 403 });
    }

    const credentials = await resolveProviderCredentialsForOwner(room.createdById);
    if (!credentials.livekitUrl || !credentials.livekitApiKey || !credentials.livekitApiSecret) {
      const mode = optionalEnv("USER_PROVIDER_KEYS_MODE") ?? "true";
      return NextResponse.json(
        {
          error:
            mode === "full"
              ? "USER_PROVIDER_KEYS_MODE=full requires room creator to configure LiveKit URL/API key/secret"
              : "LiveKit credentials are unavailable",
        },
        { status: 400 },
      );
    }

    const transcriberEnabled = isTranscriberEnabled();
    if (transcriberEnabled && !credentials.deepgramApiKey) {
      const mode = optionalEnv("USER_PROVIDER_KEYS_MODE") ?? "true";
      return NextResponse.json(
        {
          error:
            mode === "full"
              ? "USER_PROVIDER_KEYS_MODE=full requires room creator to configure Deepgram API key"
              : "Deepgram API key is unavailable for transcription",
        },
        { status: 400 },
      );
    }

    if (transcriberEnabled) {
      await ensureTranscriberWorker(
        {
          livekitUrl: credentials.livekitUrl,
          livekitApiKey: credentials.livekitApiKey,
          livekitApiSecret: credentials.livekitApiSecret,
        },
        {
          waitForReady: true,
          reason: `join-voice:${roomId}`,
        },
      );
    }

    await prisma.roomParticipant.upsert({
      where: {
        roomRefId_userId: {
          roomRefId: room.id,
          userId: user.id,
        },
      },
      update: {
        lastSeenAt: new Date(),
      },
      create: {
        roomRefId: room.id,
        userId: user.id,
      },
    });

    if (transcriberEnabled) {
      try {
        const dispatchResult = await ensureTranscriberDispatch(roomId, {
          livekitUrl: credentials.livekitUrl,
          livekitApiKey: credentials.livekitApiKey,
          livekitApiSecret: credentials.livekitApiSecret,
        });
        console.info("Token route transcriber dispatch result:", {
          roomId,
          dispatchResult,
        });
      } catch (dispatchError) {
        console.error("Token route failed to dispatch transcriber agent:", {
          roomId,
          error: dispatchError instanceof Error ? dispatchError.message : dispatchError,
        });
      }
    }

    const identity = `user-${user.id}`;
    const accessToken = new AccessToken(credentials.livekitApiKey, credentials.livekitApiSecret, {
      identity,
      name: user.username,
      ttl: "4h",
    });

    accessToken.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await accessToken.toJwt();

    return NextResponse.json({
      token,
      livekitUrl: credentials.livekitUrl,
      identity,
      displayName: user.username,
      transcriberEnabled,
      keyMasks: {
        livekit: credentials.livekitApiKeyMask,
        deepgram: credentials.deepgramApiKeyMask,
      },
      keySources: {
        livekit: credentials.livekitSource,
        deepgram: credentials.deepgramSource,
      },
    });
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to create token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
