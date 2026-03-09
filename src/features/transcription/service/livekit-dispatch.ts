import { AgentDispatchClient, RoomServiceClient, TwirpError } from "livekit-server-sdk";

import { requireEnv } from "@/lib/env";

const DEFAULT_TRANSCRIBER_AGENT_NAME = "deepgram-transcriber";

export type TranscriberDispatchResult = {
  enabled: boolean;
  roomEnsured: boolean;
  agentName: string | null;
  existingDispatchCount: number;
  alreadyDispatched: boolean;
  createdDispatchId: string | null;
};

export type LivekitDispatchCredentials = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
};

export function isTranscriberEnabled() {
  return process.env.LIVEKIT_TRANSCRIBER_ENABLED?.trim().toLowerCase() !== "false";
}

function getTranscriberAgentName() {
  const configured = process.env.LIVEKIT_TRANSCRIBER_AGENT_NAME?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_TRANSCRIBER_AGENT_NAME;
}

function isTwirpCode(error: unknown, code: string) {
  return (
    error instanceof TwirpError &&
    typeof error.code === "string" &&
    error.code.toLowerCase() === code.toLowerCase()
  );
}

async function ensureLiveKitRoomExists(roomId: string, credentials: LivekitDispatchCredentials) {
  const roomClient = new RoomServiceClient(
    credentials.livekitUrl,
    credentials.livekitApiKey,
    credentials.livekitApiSecret,
  );

  try {
    await roomClient.createRoom({
      name: roomId,
    });
  } catch (error) {
    if (isTwirpCode(error, "already_exists")) {
      return;
    }
    throw error;
  }
}

function logDispatch(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.info(`[transcriber-dispatch] ${message}`, payload);
    return;
  }
  console.info(`[transcriber-dispatch] ${message}`);
}

export async function ensureTranscriberDispatch(
  roomId: string,
  credentials?: LivekitDispatchCredentials,
): Promise<TranscriberDispatchResult> {
  if (!isTranscriberEnabled()) {
    logDispatch("Transcriber disabled by env", { roomId });
    return {
      enabled: false,
      roomEnsured: false,
      agentName: null,
      existingDispatchCount: 0,
      alreadyDispatched: false,
      createdDispatchId: null,
    };
  }

  const resolvedCredentials: LivekitDispatchCredentials = credentials ?? {
    livekitUrl: requireEnv("LIVEKIT_URL"),
    livekitApiKey: requireEnv("LIVEKIT_API_KEY"),
    livekitApiSecret: requireEnv("LIVEKIT_API_SECRET"),
  };
  const agentName = getTranscriberAgentName();

  logDispatch("Ensuring room exists before dispatch", { roomId, agentName });
  await ensureLiveKitRoomExists(roomId, resolvedCredentials);

  const dispatchClient = new AgentDispatchClient(
    resolvedCredentials.livekitUrl,
    resolvedCredentials.livekitApiKey,
    resolvedCredentials.livekitApiSecret,
  );
  const existingDispatches = await dispatchClient.listDispatch(roomId);
  logDispatch("Fetched existing dispatches", {
    roomId,
    agentName,
    existingDispatchCount: existingDispatches.length,
    dispatchAgentNames: existingDispatches.map((dispatch) => dispatch.agentName ?? "(empty)"),
  });
  const alreadyDispatched = existingDispatches.some((dispatch) => dispatch.agentName === agentName);

  if (!alreadyDispatched) {
    try {
      const createdDispatch = await dispatchClient.createDispatch(roomId, agentName, {
        metadata: JSON.stringify({
          provider: "deepgram",
          source: "jileme",
          roomId,
        }),
      });
      logDispatch("Created transcriber dispatch", {
        roomId,
        agentName,
        dispatchId: createdDispatch.id,
      });
      return {
        enabled: true,
        roomEnsured: true,
        agentName,
        existingDispatchCount: existingDispatches.length,
        alreadyDispatched: false,
        createdDispatchId: createdDispatch.id ?? null,
      };
    } catch (error) {
      if (isTwirpCode(error, "already_exists")) {
        logDispatch("Dispatch already exists (race)", { roomId, agentName });
        return {
          enabled: true,
          roomEnsured: true,
          agentName,
          existingDispatchCount: existingDispatches.length,
          alreadyDispatched: true,
          createdDispatchId: null,
        };
      }
      throw error;
    }
  }

  logDispatch("Dispatch already present", { roomId, agentName });
  return {
    enabled: true,
    roomEnsured: true,
    agentName,
    existingDispatchCount: existingDispatches.length,
    alreadyDispatched: true,
    createdDispatchId: null,
  };
}
