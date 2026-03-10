import "dotenv/config";

import { MessageType, PrismaClient, RoomStatus } from "@prisma/client";
import { fileURLToPath } from "node:url";
import { RoomServiceClient } from "livekit-server-sdk";

import {
  AutoSubscribe,
  ServerOptions,
  cli,
  defineAgent,
  runWithJobContextAsync,
  stt,
  type JobContext,
} from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import {
  AudioStream,
  type Participant,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  RoomEvent,
  TrackKind,
  TrackSource,
} from "@livekit/rtc-node";
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

type SpeechState = "listening" | "speaking";

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

type ParticipantTranscriptionSession = {
  participant: TranscribedParticipant;
  roomRefId: string;
  sttOptions: deepgram.STTOptions;
  sttProvider: deepgram.STT;
  speechStream: stt.SpeechStream;
  transcriptWindow: TranscriptWindowState | null;
  audioStream: AudioStream | null;
  audioTrackSid: string | null;
  speechState: SpeechState;
  closed: boolean;
  consumeTask: Promise<void>;
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

function updateSpeechState(session: ParticipantTranscriptionSession, roomId: string, nextState: SpeechState) {
  if (session.speechState === nextState) {
    return;
  }

  const previousState = session.speechState;
  session.speechState = nextState;
  logInfo("User state changed", {
    roomId,
    participantIdentity: session.participant.identity,
    oldState: previousState,
    newState: nextState,
  });
}

function getRemoteParticipantMicrophonePublication(
  participant: RemoteParticipant,
): RemoteTrackPublication | null {
  for (const publication of participant.trackPublications.values()) {
    if (publication.source === TrackSource.SOURCE_MICROPHONE) {
      return publication;
    }
  }

  return null;
}

async function clearParticipantAudioInput(
  session: ParticipantTranscriptionSession,
  roomId: string,
  reason: string,
  flush = true,
) {
  const previousTrackSid = session.audioTrackSid;
  const currentAudioStream = session.audioStream;
  if (!previousTrackSid && !currentAudioStream) {
    return;
  }

  session.audioTrackSid = null;
  session.audioStream = null;
  updateSpeechState(session, roomId, "listening");

  if (flush && !session.closed) {
    try {
      session.speechStream.flush();
    } catch {
      // Ignore flush races during disconnect.
    }
  }

  try {
    session.speechStream.detachInputStream();
  } catch {
    // Ignore detach races during disconnect.
  }

  if (currentAudioStream) {
    await currentAudioStream.cancel(reason).catch(() => undefined);
  }

  logInfo("Detached participant microphone stream", {
    roomId,
    participantIdentity: session.participant.identity,
    trackSid: previousTrackSid,
    reason,
  });
}

async function attachParticipantAudioInput(
  session: ParticipantTranscriptionSession,
  roomId: string,
  track: RemoteAudioTrack,
  trackSid: string | null,
) {
  if (session.audioTrackSid === trackSid && session.audioStream) {
    return;
  }

  await clearParticipantAudioInput(session, roomId, "switch_track");

  const audioStream = new AudioStream(track, {
    sampleRate: session.sttOptions.sampleRate,
    numChannels: session.sttOptions.numChannels,
  });
  session.speechStream.updateInputStream(
    audioStream as unknown as Parameters<stt.SpeechStream["updateInputStream"]>[0],
  );
  session.audioStream = audioStream;
  session.audioTrackSid = trackSid;

  logInfo("Attached participant microphone stream", {
    roomId,
    participantIdentity: session.participant.identity,
    trackSid,
    sampleRate: session.sttOptions.sampleRate,
    numChannels: session.sttOptions.numChannels,
  });
}

async function syncParticipantMicrophoneInput({
  session,
  participant,
  roomId,
}: {
  session: ParticipantTranscriptionSession;
  participant: RemoteParticipant;
  roomId: string;
}) {
  if (session.closed) {
    return;
  }

  const publication = getRemoteParticipantMicrophonePublication(participant);
  if (!publication) {
    await clearParticipantAudioInput(session, roomId, "microphone_unpublished");
    return;
  }

  if (!publication.subscribed) {
    publication.setSubscribed(true);
  }

  if (publication.muted) {
    await clearParticipantAudioInput(session, roomId, "microphone_muted");
    return;
  }

  if (!publication.track || publication.kind !== TrackKind.KIND_AUDIO) {
    await clearParticipantAudioInput(session, roomId, "microphone_track_missing");
    return;
  }

  await attachParticipantAudioInput(
    session,
    roomId,
    publication.track as RemoteAudioTrack,
    publication.sid ?? null,
  );
}

function handleTranscriptUpdate({
  roomId,
  participant,
  roomRefId,
  session,
  transcript,
  isFinal,
  language,
  relayRoomServiceClient,
}: {
  roomId: string;
  participant: TranscribedParticipant;
  roomRefId: string;
  session: ParticipantTranscriptionSession;
  transcript: string;
  isFinal: boolean;
  language: string | undefined;
  relayRoomServiceClient: RoomServiceClient | null;
}) {
  const normalizedTranscript = normalizeTranscriptText(transcript);
  if (!normalizedTranscript) {
    return;
  }

  const nowMs = Date.now();
  let window = session.transcriptWindow;
  if (!window || nowMs - window.lastActivityAt > TRANSCRIPT_UTTERANCE_GAP_MS) {
    window = createTranscriptWindowState(roomId, participant.identity, nowMs);
    session.transcriptWindow = window;
    logInfo("Started transcript utterance window", {
      roomId,
      participantIdentity: participant.identity,
      externalRef: window.externalRef,
      startedAt: new Date(window.windowStartedAt).toISOString(),
    });
  }

  window.lastActivityAt = nowMs;
  if (isFinal) {
    window.committedText = mergeTranscriptText(window.committedText, normalizedTranscript);
    window.interimText = "";
  } else {
    window.interimText = normalizedTranscript;
  }

  const composedTranscript = isFinal
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
        isFinal,
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
    isFinal,
    text: transcriptForSave,
    language,
  });
}

async function consumeParticipantSpeechStream({
  session,
  roomId,
  relayRoomServiceClient,
}: {
  session: ParticipantTranscriptionSession;
  roomId: string;
  relayRoomServiceClient: RoomServiceClient | null;
}) {
  try {
    for await (const event of session.speechStream) {
      if (session.closed) {
        break;
      }

      switch (event.type) {
        case stt.SpeechEventType.START_OF_SPEECH: {
          updateSpeechState(session, roomId, "speaking");
          break;
        }
        case stt.SpeechEventType.END_OF_SPEECH: {
          updateSpeechState(session, roomId, "listening");
          break;
        }
        case stt.SpeechEventType.INTERIM_TRANSCRIPT:
        case stt.SpeechEventType.FINAL_TRANSCRIPT: {
          const alternative = event.alternatives?.[0];
          if (!alternative?.text) {
            break;
          }

          handleTranscriptUpdate({
            roomId,
            participant: session.participant,
            roomRefId: session.roomRefId,
            session,
            transcript: alternative.text,
            isFinal: event.type === stt.SpeechEventType.FINAL_TRANSCRIPT,
            language: alternative.language,
            relayRoomServiceClient,
          });
          break;
        }
        default: {
          break;
        }
      }
    }
  } catch (error) {
    if (!session.closed) {
      logError("Participant speech stream failed", error, {
        roomId,
        participantIdentity: session.participant.identity,
      });
    }
  }
}

async function closeParticipantSession({
  session,
  sessionRegistry,
  roomId,
  reason,
}: {
  session: ParticipantTranscriptionSession;
  sessionRegistry: Map<string, ParticipantTranscriptionSession>;
  roomId: string;
  reason: string;
}) {
  if (session.closed) {
    return;
  }

  session.closed = true;
  sessionRegistry.delete(session.participant.identity);

  await clearParticipantAudioInput(session, roomId, reason, false);

  try {
    session.speechStream.close();
  } catch {
    // Ignore close races during shutdown.
  }

  await session.consumeTask.catch(() => undefined);
  await session.transcriptWindow?.persistChain.catch(() => undefined);
  session.transcriptWindow = null;

  await session.sttProvider.close().catch((error) => {
    logWarn("Failed to close Deepgram provider", {
      roomId,
      participantIdentity: session.participant.identity,
      error: error instanceof Error ? error.message : error,
    });
  });

  logInfo("Participant transcription session closed", {
    roomId,
    participantIdentity: session.participant.identity,
    reason,
  });
}

async function startParticipantSession({
  ctx,
  participant,
  roomId,
  deepgramApiKey,
  relayRoomServiceClient,
  sessionRegistry,
}: {
  ctx: JobContext;
  participant: TranscribedParticipant;
  roomId: string;
  deepgramApiKey: string | null;
  relayRoomServiceClient: RoomServiceClient | null;
  sessionRegistry: Map<string, ParticipantTranscriptionSession>;
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
  const sttProvider = new deepgram.STT(sttOptions);
  const speechStream = sttProvider.stream();
  const session: ParticipantTranscriptionSession = {
    participant,
    roomRefId,
    sttOptions,
    sttProvider,
    speechStream,
    transcriptWindow: null,
    audioStream: null,
    audioTrackSid: null,
    speechState: "listening",
    closed: false,
    consumeTask: Promise.resolve(),
  };

  sttProvider.on("error", (event) => {
    logError("Transcription stream error", event.error, {
      roomId,
      participantIdentity: participant.identity,
      recoverable: event.recoverable,
    });
  });

  sttProvider.on("metrics_collected", (metrics) => {
    logInfo("Metrics collected", {
      roomId,
      participantIdentity: participant.identity,
      metricsType: metrics.type,
      metricsLabel: "label" in metrics ? metrics.label : null,
      requestId: "requestId" in metrics ? metrics.requestId : null,
    });
  });

  session.consumeTask = consumeParticipantSpeechStream({
    session,
    roomId,
    relayRoomServiceClient,
  });
  sessionRegistry.set(participant.identity, session);

  logInfo("Participant transcription session started", {
    roomId,
    participantIdentity: participant.identity,
    deepgramModel: sttOptions.model,
    deepgramLanguage: sttOptions.language,
    endpointing: sttOptions.endpointing,
    interimResults: sttOptions.interimResults,
  });

  const remoteParticipant = ctx.room.remoteParticipants.get(participant.identity);
  if (remoteParticipant) {
    await syncParticipantMicrophoneInput({
      session,
      participant: remoteParticipant,
      roomId,
    });
  }
}

async function ensureParticipantSession({
  ctx,
  participant,
  roomId,
  deepgramApiKey,
  relayRoomServiceClient,
  sessionRegistry,
  startingSessionRegistry,
}: {
  ctx: JobContext;
  participant: TranscribedParticipant;
  roomId: string;
  deepgramApiKey: string | null;
  relayRoomServiceClient: RoomServiceClient | null;
  sessionRegistry: Map<string, ParticipantTranscriptionSession>;
  startingSessionRegistry: Set<string>;
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
    return;
  }

  if (startingSessionRegistry.has(participant.identity)) {
    logInfo("Participant session start already in progress", {
      roomId,
      participantIdentity: participant.identity,
    });
    return;
  }

  startingSessionRegistry.add(participant.identity);
  try {
    await runWithJobContextAsync(ctx, async () => {
      await startParticipantSession({
        ctx,
        participant,
        roomId,
        deepgramApiKey,
        relayRoomServiceClient,
        sessionRegistry,
      });
    });
  } finally {
    startingSessionRegistry.delete(participant.identity);
  }
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

    const sessions = new Map<string, ParticipantTranscriptionSession>();
    const startingSessions = new Set<string>();
    const roomDeepgramApiKey = await resolveRoomDeepgramApiKey(roomId);
    const relayRoomServiceClient = createRelayRoomServiceClient();

    const ensureAndSyncParticipant = async (participant: RemoteParticipant) => {
      await ensureParticipantSession({
        ctx,
        participant,
        roomId,
        deepgramApiKey: roomDeepgramApiKey,
        relayRoomServiceClient,
        sessionRegistry: sessions,
        startingSessionRegistry: startingSessions,
      });

      const session = sessions.get(participant.identity);
      if (!session) {
        return;
      }

      await syncParticipantMicrophoneInput({
        session,
        participant,
        roomId,
      });
    };

    const syncParticipantByIdentity = async (identity: string) => {
      const participant = ctx.room.remoteParticipants.get(identity);
      if (!participant) {
        return;
      }

      await ensureAndSyncParticipant(participant);
    };

    const closeSessionByIdentity = async (identity: string, reason: string) => {
      const session = sessions.get(identity);
      if (!session) {
        return;
      }

      await closeParticipantSession({
        session,
        sessionRegistry: sessions,
        roomId,
        reason,
      });
    };

    ctx.addParticipantEntrypoint((jobCtx, participant) => {
      logInfo("Participant detected", {
        roomId,
        participantIdentity: participant.identity,
        participantName: participant.name,
        participantKind: participant.kind,
      });

      void runWithJobContextAsync(jobCtx, async () => {
        await ensureAndSyncParticipant(participant);
      }).catch((error) => {
        logError("Failed to start participant transcription session", error, {
          roomId,
          participantIdentity: participant.identity,
        });
      });

      return Promise.resolve();
    });

    // Use SUBSCRIBE_ALL so tracks published after participant join are also subscribed.
    // We maintain our own per-track audio streams and need microphone tracks as soon as they appear.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    logInfo("Connected to room", { roomId, autoSubscribe: "SUBSCRIBE_ALL" });

    ctx.room.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
      if (publication.source !== TrackSource.SOURCE_MICROPHONE) {
        return;
      }

      void ensureAndSyncParticipant(participant).catch((error) => {
        logError("Failed to attach participant microphone stream", error, {
          roomId,
          participantIdentity: participant.identity,
          trackSid: publication.sid,
        });
      });
    });

    ctx.room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (publication.source !== TrackSource.SOURCE_MICROPHONE) {
        return;
      }

      void ensureAndSyncParticipant(participant).catch((error) => {
        logError("Failed to react to microphone publication", error, {
          roomId,
          participantIdentity: participant.identity,
          trackSid: publication.sid,
        });
      });
    });

    ctx.room.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      if (publication.source !== TrackSource.SOURCE_MICROPHONE) {
        return;
      }

      const session = sessions.get(participant.identity);
      if (!session) {
        return;
      }

      void clearParticipantAudioInput(session, roomId, "microphone_unsubscribed").catch((error) => {
        logError("Failed to detach unsubscribed microphone stream", error, {
          roomId,
          participantIdentity: participant.identity,
          trackSid: publication.sid,
        });
      });
    });

    ctx.room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
      if (publication.source !== TrackSource.SOURCE_MICROPHONE) {
        return;
      }

      const session = sessions.get(participant.identity);
      if (!session) {
        return;
      }

      void syncParticipantMicrophoneInput({
        session,
        participant,
        roomId,
      }).catch((error) => {
        logError("Failed to handle microphone unpublish", error, {
          roomId,
          participantIdentity: participant.identity,
          trackSid: publication.sid,
        });
      });
    });

    const handleParticipantTrackStateChange = (participant: Participant) => {
      if (participant.kind === AGENT_PARTICIPANT_KIND) {
        return;
      }

      void syncParticipantByIdentity(participant.identity).catch((error) => {
        logError("Failed to sync participant microphone state", error, {
          roomId,
          participantIdentity: participant.identity,
        });
      });
    };

    ctx.room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (publication.source === TrackSource.SOURCE_MICROPHONE) {
        handleParticipantTrackStateChange(participant);
      }
    });

    ctx.room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (publication.source === TrackSource.SOURCE_MICROPHONE) {
        handleParticipantTrackStateChange(participant);
      }
    });

    ctx.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      void closeSessionByIdentity(participant.identity, "participant_disconnected").catch((error) => {
        logError("Failed to close participant transcription session", error, {
          roomId,
          participantIdentity: participant.identity,
        });
      });
    });

    await Promise.allSettled(
      [...ctx.room.remoteParticipants.values()].map(async (participant) => {
        logInfo("Existing participant detected", {
          roomId,
          participantIdentity: participant.identity,
          participantName: participant.name,
          participantKind: participant.kind,
        });
        await ensureAndSyncParticipant(participant);
      }),
    );

    ctx.addShutdownCallback(async () => {
      logInfo("Shutdown callback started", { roomId, activeSessions: sessions.size });
      await Promise.allSettled(
        [...sessions.values()].map(async (session) => {
          await closeParticipantSession({
            session,
            sessionRegistry: sessions,
            roomId,
            reason: "worker_shutdown",
          });
        }),
      );
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
      numIdleProcesses: parseNumberEnv(process.env.TRANSCRIBER_WORKER_IDLE_PROCESSES, 1),
    }),
  );
}
