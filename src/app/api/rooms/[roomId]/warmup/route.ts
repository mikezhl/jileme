import { RoomStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { isTranscriberEnabled } from "@/features/transcription/service/livekit-dispatch";
import { ensureTranscriberWorker } from "@/features/transcription/runtime/worker-manager";
import { requireApiUser } from "@/lib/auth-guard";
import { getUserProviderKeysMode } from "@/lib/env";
import { resolveProviderCredentialsForOwner } from "@/lib/provider-keys";
import { RoomAccessError, getAccessibleRoomOrThrow } from "@/lib/rooms";
import { normalizeRoomId } from "@/lib/room-utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
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

    const room = await getAccessibleRoomOrThrow(roomId, user.id);
    if (room.status === RoomStatus.ENDED) {
      return NextResponse.json({ ok: true, skipped: "room-ended" });
    }

    if (!isTranscriberEnabled()) {
      return NextResponse.json({ ok: true, skipped: "transcriber-disabled" });
    }

    const credentials = await resolveProviderCredentialsForOwner(room.createdById);
    if (!credentials.livekitUrl || !credentials.livekitApiKey || !credentials.livekitApiSecret) {
      const mode = getUserProviderKeysMode();
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

    if (!credentials.deepgramApiKey) {
      const mode = getUserProviderKeysMode();
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

    const worker = await ensureTranscriberWorker(
      {
        livekitUrl: credentials.livekitUrl,
        livekitApiKey: credentials.livekitApiKey,
        livekitApiSecret: credentials.livekitApiSecret,
      },
      {
        waitForReady: false,
        reason: `warmup:${room.roomId}`,
      },
    );

    return NextResponse.json({
      ok: true,
      worker,
    });
  } catch (error) {
    if (error instanceof RoomAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to warm up transcriber worker";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
