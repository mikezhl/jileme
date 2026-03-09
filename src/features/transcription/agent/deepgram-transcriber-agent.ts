import "dotenv/config";

import { MessageType, PrismaClient, RoomStatus } from "@prisma/client";
import { fileURLToPath } from "node:url";
import { RoomServiceClient } from "livekit-server-sdk";

import {
  AutoSubscribe,
  ServerOptions,
  cli,
  defineAgent,
  type JobContext,
  voice,
} from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import { enqueueRealtimeAnalysisEvent } from "@/features/analysis/service/analysis-events";
import {
  formatCompactAnalysisError,
  getAnalysisSchemaFixHint,
  isAnalysisSchemaMissingError,
} from "@/features/analysis/service/analysis-errors";
import { createRoomServiceClient, publishChatMessageViaLivekit } from "@/lib/livekit-chat-relay";
import { toChatMessage } from "@/lib/messages";
import { resolveProviderCredentialsForOwner } from "@/lib/provider-keys";

const prisma = new PrismaClient();
const DEFAULT_AGENT_NAME = "deepgram-transcriber";
const AGENT_PARTICIPANT_KIND = 4;
const TRANSCRIPT_UTTERANCE_GAP_MS = parseNumberEnv(process.env.TRANSCRIPT_UTTERANCE_GAP_MS, 2000);

type TranscribedParticipant = {
  identity: string;
  name?: string;
  kind?: number;
};

type TranscriptWindowState = {
  externalRef: string;
  windowStartedAt: number;
  lastActivityAt: number;
  committedText: string;
  interimText: string;
  lastPersistedText: string;
  persistChain: Promise<void>;
};

function logInfo(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.info(`[transcriber] ${message}`, payload);
    return;
  }

  console.info(`[transcriber] ${message}`);
}

function logWarn(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.warn(`[transcriber] ${message}`, payload);
    return;
  }

  console.warn(`[transcriber] ${message}`);
}

function logError(message: string, error: unknown, payload?: Record<string, unknown>) {
  console.error(`[transcriber] ${message}`, {
    ...(payload ?? {}),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
  });
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function getConfiguredAgentName() {
  const configured = process.env.LIVEKIT_TRANSCRIBER_AGENT_NAME?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_AGENT_NAME;
}

function createRelayRoomServiceClient(): RoomServiceClient | null {
  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const livekitApiKey = process.env.LIVEKIT_API_KEY?.trim();
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    logWarn("Realtime transcript relay disabled: missing LiveKit credentials in worker env", {
      hasLiveKitUrl: Boolean(livekitUrl),
      hasLiveKitApiKey: Boolean(livekitApiKey),
      hasLiveKitApiSecret: Boolean(livekitApiSecret),
    });
    return null;
  }

  return createRoomServiceClient({
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
  });
}

function buildDeepgramOptions(deepgramApiKey: string): deepgram.STTOptions {
  if (!deepgramApiKey.trim()) {
    throw new Error("Deepgram API key is missing for this room");
  }

  return {
    apiKey: deepgramApiKey.trim(),
    model: (process.env.DEEPGRAM_MODEL ?? "nova-2") as deepgram.STTOptions["model"],
    language: process.env.DEEPGRAM_LANGUAGE ?? "zh",
    interimResults: parseBooleanEnv(process.env.DEEPGRAM_INTERIM_RESULTS, true),
    punctuate: parseBooleanEnv(process.env.DEEPGRAM_PUNCTUATE, true),
    smartFormat: parseBooleanEnv(process.env.DEEPGRAM_SMART_FORMAT, true),
    endpointing: parseNumberEnv(process.env.DEEPGRAM_ENDPOINTING, 25),
    profanityFilter: parseBooleanEnv(process.env.DEEPGRAM_PROFANITY_FILTER, false),
    fillerWords: parseBooleanEnv(process.env.DEEPGRAM_FILLER_WORDS, false),
    numerals: parseBooleanEnv(process.env.DEEPGRAM_NUMERALS, false),
    detectLanguage: parseBooleanEnv(process.env.DEEPGRAM_DETECT_LANGUAGE, false),
    noDelay: parseBooleanEnv(process.env.DEEPGRAM_NO_DELAY, true),
    diarize: parseBooleanEnv(process.env.DEEPGRAM_DIARIZE, false),
    dictation: parseBooleanEnv(process.env.DEEPGRAM_DICTATION, false),
    sampleRate: parseNumberEnv(process.env.DEEPGRAM_SAMPLE_RATE, 16000),
    numChannels: parseNumberEnv(process.env.DEEPGRAM_NUM_CHANNELS, 1),
    keywords: [],
    keyterm: [],
    mipOptOut: parseBooleanEnv(process.env.DEEPGRAM_MIP_OPT_OUT, false),
  };
}

function normalizeSenderName(participant: TranscribedParticipant) {
  const name = participant.name?.trim();
  if (name && name.length > 0) {
    return name.slice(0, 40);
  }

  const identity = participant.identity.trim();
  if (identity.length > 0) {
    return identity.slice(0, 40);
  }

  return "Voice User";
}

function normalizeTranscriptText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function shouldInsertSpace(left: string, right: string) {
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
}

function mergeTranscriptText(base: string, incoming: string) {
  const current = normalizeTranscriptText(base);
  const next = normalizeTranscriptText(incoming);

  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  if (next.startsWith(current)) {
    return next;
  }
  if (current.endsWith(next)) {
    return current;
  }
  return shouldInsertSpace(current, next) ? `${current} ${next}` : `${current}${next}`;
}

function createTranscriptWindowExternalRef(roomId: string, participantId: string, windowStartedAt: number) {
  return `${roomId}:${participantId}:utterance:${windowStartedAt}`;
}

function createTranscriptWindowState(
  roomId: string,
  participantId: string,
  nowMs: number,
): TranscriptWindowState {
  return {
    externalRef: createTranscriptWindowExternalRef(roomId, participantId, nowMs),
    windowStartedAt: nowMs,
    lastActivityAt: nowMs,
    committedText: "",
    interimText: "",
    lastPersistedText: "",
    persistChain: Promise.resolve(),
  };
}

async function resolveActiveRoomRefId(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: {
      id: true,
      status: true,
    },
  });
  if (!room) {
    logWarn("Skip transcript persistence for missing room", { roomId });
    return null;
  }
  if (room.status === RoomStatus.ENDED) {
    logInfo("Skip transcript persistence for ended room", { roomId });
    return null;
  }
  return room.id;
}

async function upsertTranscriptMessage({
  roomRefId,
  participant,
  transcript,
  externalRef,
  windowStartedAt,
}: {
  roomRefId: string;
  participant: TranscribedParticipant;
  transcript: string;
  externalRef: string;
  windowStartedAt: number;
}) {
  const content = normalizeTranscriptText(transcript);
  if (!content) {
    return null;
  }

  const message = await prisma.message.upsert({
    where: {
      externalRef,
    },
    update: {
      senderName: normalizeSenderName(participant),
      participantId: participant.identity,
      content,
    },
    create: {
      roomRefId,
      type: MessageType.TRANSCRIPT,
      externalRef,
      senderName: normalizeSenderName(participant),
      participantId: participant.identity,
      content,
      createdAt: new Date(windowStartedAt),
    },
  });

  return message;
}

async function startParticipantSession({
  ctx,
  participant,
  roomId,
  deepgramApiKey,
  relayRoomServiceClient,
  sessionRegistry,
  transcriptWindowRegistry,
}: {
  ctx: JobContext;
  participant: TranscribedParticipant;
  roomId: string;
  deepgramApiKey: string | null;
  relayRoomServiceClient: RoomServiceClient | null;
  sessionRegistry: Map<string, voice.AgentSession>;
  transcriptWindowRegistry: Map<string, TranscriptWindowState>;
}) {
  if (participant.kind === AGENT_PARTICIPANT_KIND) {
    logInfo("Skip agent participant", {
      roomId,
      participantIdentity: participant.identity,
      participantKind: participant.kind,
    });
    return;
  }

  if (sessionRegistry.has(participant.identity)) {
    logInfo("Participant session already exists", {
      roomId,
      participantIdentity: participant.identity,
    });
    return;
  }

  if (!deepgramApiKey?.trim()) {
    throw new Error("Deepgram API key is missing for this room");
  }
  const roomRefId = await resolveActiveRoomRefId(roomId);
  if (!roomRefId) {
    return;
  }

  const sttOptions = buildDeepgramOptions(deepgramApiKey);
  const session = new voice.AgentSession({
    turnDetection: "stt",
    stt: new deepgram.STT(sttOptions),
  });

  logInfo("Starting participant transcription session", {
    roomId,
    participantIdentity: participant.identity,
    deepgramModel: sttOptions.model,
    deepgramLanguage: sttOptions.language,
    endpointing: sttOptions.endpointing,
    interimResults: sttOptions.interimResults,
  });

  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
    const transcript = normalizeTranscriptText(event.transcript);
    if (!transcript) {
      return;
    }

    const nowMs = Date.now();
    let window = transcriptWindowRegistry.get(participant.identity);
    if (!window || nowMs - window.lastActivityAt > TRANSCRIPT_UTTERANCE_GAP_MS) {
      window = createTranscriptWindowState(roomId, participant.identity, nowMs);
      transcriptWindowRegistry.set(participant.identity, window);
      logInfo("Started transcript utterance window", {
        roomId,
        participantIdentity: participant.identity,
        externalRef: window.externalRef,
        startedAt: new Date(window.windowStartedAt).toISOString(),
      });
    }
    window.lastActivityAt = nowMs;

    if (event.isFinal) {
      window.committedText = mergeTranscriptText(window.committedText, transcript);
      window.interimText = "";
    } else {
      window.interimText = transcript;
    }

    const composedTranscript = event.isFinal
      ? window.committedText
      : mergeTranscriptText(window.committedText, window.interimText);
    if (!composedTranscript || composedTranscript === window.lastPersistedText) {
      return;
    }

    window.lastPersistedText = composedTranscript;

    const externalRef = window.externalRef;
    const windowStartedAt = window.windowStartedAt;
    const transcriptForSave = composedTranscript;
    window.persistChain = window.persistChain
      .catch(() => undefined)
      .then(async () => {
        const persistedMessage = await upsertTranscriptMessage({
          roomRefId,
          participant,
          transcript: transcriptForSave,
          externalRef,
          windowStartedAt,
        });
        if (!persistedMessage) {
          return;
        }

        try {
          await enqueueRealtimeAnalysisEvent(roomRefId, persistedMessage.id);
        } catch (enqueueError) {
          if (isAnalysisSchemaMissingError(enqueueError)) {
            logWarn("Analysis queue unavailable while enqueuing transcript event", {
              roomId,
              participantIdentity: participant.identity,
              messageId: persistedMessage.id,
              hint: getAnalysisSchemaFixHint(),
              error: formatCompactAnalysisError(enqueueError),
            });
          } else {
            logWarn("Failed to enqueue transcript analysis event", {
              roomId,
              participantIdentity: participant.identity,
              messageId: persistedMessage.id,
              error: formatCompactAnalysisError(enqueueError),
            });
          }
        }

        const chatMessage = toChatMessage(persistedMessage);
        if (relayRoomServiceClient) {
          void publishChatMessageViaLivekit(relayRoomServiceClient, roomId, chatMessage).catch(
            (relayError) => {
              logWarn("Failed to relay transcript through LiveKit data channel", {
                roomId,
                participantIdentity: participant.identity,
                messageId: chatMessage.id,
                error: relayError instanceof Error ? relayError.message : relayError,
              });
            },
          );
        }

        logInfo("Transcript upserted", {
          roomId,
          participantIdentity: participant.identity,
          messageId: chatMessage.id,
          externalRef,
          isFinal: event.isFinal,
          text: transcriptForSave,
        });
      })
      .catch((error) => {
        logError("Failed to upsert transcript", error, {
          roomId,
          participantIdentity: participant.identity,
          externalRef,
        });
      });

    logInfo("Transcript update", {
      roomId,
      participantIdentity: participant.identity,
      isFinal: event.isFinal,
      text: transcriptForSave,
      language: event.language,
    });
  });

  session.on(voice.AgentSessionEventTypes.Error, (event) => {
    logError("Agent session error", event.error, {
      roomId,
      participantIdentity: participant.identity,
    });
  });

  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    logInfo("User state changed", {
      roomId,
      participantIdentity: participant.identity,
      oldState: event.oldState,
      newState: event.newState,
    });
  });

  session.on(voice.AgentSessionEventTypes.MetricsCollected, (event) => {
    const metrics = event.metrics;
    logInfo("Metrics collected", {
      roomId,
      participantIdentity: participant.identity,
      metricsType: metrics.type,
      metricsLabel: "label" in metrics ? metrics.label : null,
      requestId: "requestId" in metrics ? metrics.requestId : null,
    });
  });

  session.on(voice.AgentSessionEventTypes.Close, (event) => {
    sessionRegistry.delete(participant.identity);
    transcriptWindowRegistry.delete(participant.identity);
    logInfo("Participant transcription session closed", {
      roomId,
      participantIdentity: participant.identity,
      reason: event.reason,
    });
  });

  await session.start({
    agent: new voice.Agent({
      instructions:
        "You are a transcription-only agent. Listen to participant audio and emit transcripts.",
    }),
    room: ctx.room,
    inputOptions: {
      participantIdentity: participant.identity,
      audioEnabled: true,
      textEnabled: false,
      videoEnabled: false,
    },
    outputOptions: {
      audioEnabled: false,
      transcriptionEnabled: false,
    },
    record: false,
  });

  sessionRegistry.set(participant.identity, session);
  logInfo("Participant transcription session started", {
    roomId,
    participantIdentity: participant.identity,
    deepgramModel: sttOptions.model,
    deepgramLanguage: sttOptions.language,
  });
}

async function resolveRoomDeepgramApiKey(roomId: string): Promise<string | null> {
  const room = await prisma.room.findUnique({
    where: { roomId },
    select: {
      createdById: true,
    },
  });

  if (!room) {
    return null;
  }

  const credentials = await resolveProviderCredentialsForOwner(room.createdById);
  return credentials.deepgramApiKey;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const roomId = ctx.job.room?.name ?? "";
    if (!roomId) {
      throw new Error("Room name is required for transcriber agent");
    }

    logInfo("Job started", {
      roomId,
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    });

    const sessions = new Map<string, voice.AgentSession>();
    const transcriptWindows = new Map<string, TranscriptWindowState>();
    const roomDeepgramApiKey = await resolveRoomDeepgramApiKey(roomId);
    const relayRoomServiceClient = createRelayRoomServiceClient();

    ctx.addParticipantEntrypoint(async (jobCtx, participant) => {
      logInfo("Participant detected", {
        roomId,
        participantIdentity: participant.identity,
        participantName: participant.name,
        participantKind: participant.kind,
      });

      try {
        await startParticipantSession({
          ctx: jobCtx,
          participant,
          roomId,
          deepgramApiKey: roomDeepgramApiKey,
          relayRoomServiceClient,
          sessionRegistry: sessions,
          transcriptWindowRegistry: transcriptWindows,
        });
      } catch (error) {
        logError("Failed to start participant transcription session", error, {
          roomId,
          participantIdentity: participant.identity,
        });
      }
    });

    // Use SUBSCRIBE_ALL so tracks published after participant join are also subscribed.
    // In current agents runtime, AUDIO_ONLY only subscribes existing tracks at connect time.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    logInfo("Connected to room", { roomId, autoSubscribe: "SUBSCRIBE_ALL" });

    ctx.addShutdownCallback(async () => {
      logInfo("Shutdown callback started", { roomId, activeSessions: sessions.size });
      await Promise.allSettled(
        [...sessions.values()].map(async (session) => {
          await session.close();
        }),
      );
      transcriptWindows.clear();
      await prisma.$disconnect();
      logInfo("Shutdown callback completed", { roomId });
    });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const configuredAgentName = getConfiguredAgentName();

  logInfo("Launching transcriber worker", {
    agentName: configuredAgentName,
    hasLiveKitUrl: Boolean(process.env.LIVEKIT_URL?.trim()),
    hasLiveKitApiKey: Boolean(process.env.LIVEKIT_API_KEY?.trim()),
    hasLiveKitApiSecret: Boolean(process.env.LIVEKIT_API_SECRET?.trim()),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
  });

  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: configuredAgentName,
    }),
  );
}
