import { MessageType, RoomStatus } from "@prisma/client";

import {
  invokeArchiveAnalysisPlanner,
  invokeRealtimeConversationAnalysis,
} from "@/features/analysis/llm/core";
import {
  isMockRealtimeAnalysisDebugPayload,
  normalizeRealtimeAnalysisContent,
} from "@/features/analysis/llm/realtime-analysis";
import { resolveRoomVoiceRuntimeForOwner } from "@/features/transcription/core/runtime";
import { getArchiveMessageSide, isArchiveImportMessage } from "@/lib/archive-room";
import { resolveConversationLlmRuntimeForOwner } from "@/lib/llm-provider-keys";
import { createRoomServiceClient, publishChatMessageViaLivekit } from "@/lib/livekit-chat-relay";
import { toChatMessage } from "@/lib/messages";
import { fromPrismaRoomAnalysisProfile } from "@/lib/room-analysis-profile";
import { getRoomNameFromAnalysisPayload } from "@/lib/room-name";
import { prisma } from "@/lib/prisma";
import { fromPrismaRoomTranscriptionLanguage } from "@/lib/room-transcription-language";
import { getRoomVoiceRuntimePreferences } from "@/lib/room-voice-preferences";
import { recordLlmUsageForOwner } from "@/lib/usage-stats";

import { type AnalysisExecutionResult, executeFinalSummaryForRoomRef } from "./analysis-service";
import {
  markArchiveAnalysisCompleted,
  markArchiveAnalysisFailed,
  markArchiveAnalysisFinalSummary,
  markArchiveAnalysisPlanReady,
  markArchiveAnalysisPlanning,
  markArchiveAnalysisRealtimeProgress,
} from "./analysis-control";

const REALTIME_ANALYSIS_SENDER = "AI Analyst";
const DEFAULT_HISTORY_TURN_LIMIT = 18;
const MAX_ARCHIVE_ANALYSIS_BURST_TURNS = 4;
const ARCHIVE_ANALYSIS_EXTERNAL_REF_PREFIX = "analysis:archive-realtime";

type ArchiveConversationMessage = {
  id: string;
  senderName: string;
  senderUserId: string | null;
  participantId: string | null;
  content: string;
  createdAt: Date;
  externalRef: string | null;
};

type ArchivePlanningTurn = {
  index: number;
  speakerLabel: string;
  speakerName: string;
  side: "A" | "B" | "other" | "unknown";
  text: string;
  latestMessageId: string;
  latestMessageAt: Date;
};

function parsePositiveNumber(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getHistoryTurnLimit() {
  return parsePositiveNumber(process.env.ANALYZER_HISTORY_TURN_LIMIT, DEFAULT_HISTORY_TURN_LIMIT);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shouldInsertSpace(left: string, right: string) {
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
}

function mergeText(left: string, right: string) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (right.startsWith(left)) {
    return right;
  }
  if (left.endsWith(right)) {
    return left;
  }
  return shouldInsertSpace(left, right) ? `${left} ${right}` : `${left}${right}`;
}

function isRelayRoomMissingError(error: unknown) {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("requested room does not exist");
  }

  return typeof error === "string" && error.toLowerCase().includes("requested room does not exist");
}

async function relayAiMessage(
  roomId: string,
  roomPreferences: {
    createdById: string | null;
    voiceSourcePreference: Parameters<typeof getRoomVoiceRuntimePreferences>[0]["voiceSourcePreference"];
    transcriptionProviderPreference: Parameters<typeof getRoomVoiceRuntimePreferences>[0]["transcriptionProviderPreference"];
    transcriptionLanguagePreference: Parameters<typeof getRoomVoiceRuntimePreferences>[0]["transcriptionLanguagePreference"];
  },
  message: ReturnType<typeof toChatMessage>,
) {
  const voiceRuntime = await resolveRoomVoiceRuntimeForOwner(
    roomPreferences.createdById,
    getRoomVoiceRuntimePreferences(roomPreferences),
  );
  const credentials = voiceRuntime.livekit;
  if (!credentials.livekitUrl || !credentials.livekitApiKey || !credentials.livekitApiSecret) {
    return;
  }

  const roomServiceClient = createRoomServiceClient({
    livekitUrl: credentials.livekitUrl,
    livekitApiKey: credentials.livekitApiKey,
    livekitApiSecret: credentials.livekitApiSecret,
  });

  await publishChatMessageViaLivekit(roomServiceClient, roomId, message);
}

async function loadRoomConversationMessages(roomRefId: string) {
  return prisma.message.findMany({
    where: {
      roomRefId,
      type: {
        in: [MessageType.TEXT, MessageType.TRANSCRIPT],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      senderName: true,
      senderUserId: true,
      participantId: true,
      content: true,
      createdAt: true,
      externalRef: true,
    },
  });
}

function createOtherSpeakerLabel(index: number) {
  const alphabetIndex = index + 2;
  if (alphabetIndex < 26) {
    return String.fromCharCode(65 + alphabetIndex);
  }

  return `P${index + 1}`;
}

function compactArchivePlanningTurns(
  messages: ArchiveConversationMessage[],
): {
  speakerMap: Record<string, string>;
  turns: ArchivePlanningTurn[];
} {
  const turns: ArchivePlanningTurn[] = [];
  const speakerMap: Record<string, string> = {
    A: "正方",
    B: "反方",
  };
  const otherLabelByKey = new Map<string, string>();

  for (const message of messages) {
    const text = normalizeWhitespace(message.content);
    if (!text) {
      continue;
    }

    const archiveSide = getArchiveMessageSide(message.participantId);
    let speakerLabel = "C";
    let side: ArchivePlanningTurn["side"] = "unknown";

    if (archiveSide === "A" || archiveSide === "B") {
      speakerLabel = archiveSide;
      side = archiveSide;
      speakerMap[speakerLabel] = message.senderName || speakerMap[speakerLabel] || speakerLabel;
    } else {
      side = archiveSide === "other" ? "other" : "unknown";
      const otherKey =
        message.participantId?.trim().toLowerCase() ||
        message.senderName.trim().toLowerCase() ||
        `unknown:${otherLabelByKey.size + 1}`;
      const existingLabel = otherLabelByKey.get(otherKey);
      speakerLabel = existingLabel ?? createOtherSpeakerLabel(otherLabelByKey.size);
      if (!existingLabel) {
        otherLabelByKey.set(otherKey, speakerLabel);
      }
      if (!speakerMap[speakerLabel]) {
        speakerMap[speakerLabel] = message.senderName || speakerLabel;
      }
    }

    const previous = turns.at(-1);
    if (previous && previous.speakerLabel === speakerLabel) {
      previous.text = mergeText(previous.text, text);
      previous.latestMessageId = message.id;
      previous.latestMessageAt = message.createdAt;
      continue;
    }

    turns.push({
      index: turns.length + 1,
      speakerLabel,
      speakerName: message.senderName,
      side,
      text,
      latestMessageId: message.id,
      latestMessageAt: message.createdAt,
    });
  }

  return {
    speakerMap,
    turns,
  };
}

function turnsToConversationText(turns: ArchivePlanningTurn[]) {
  return turns.map((turn) => `${turn.speakerLabel}: ${turn.text}`).join("\n");
}

function getRealtimeActiveSpeakerLabels(turns: ArchivePlanningTurn[]) {
  return [...new Set(turns.map((turn) => turn.side).filter((side) => side === "A" || side === "B"))];
}

function hasDebateProgress(turns: ArchivePlanningTurn[]) {
  return turns.some((turn) => turn.side === "A" || turn.side === "B");
}

function buildFallbackCheckpointIndexes(turns: ArchivePlanningTurn[]) {
  const checkpoints: number[] = [];
  let debateTurnCount = 0;
  let lastDebateTurnIndex = 0;

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index]!;
    const isDebateTurn = turn.side === "A" || turn.side === "B";
    if (isDebateTurn) {
      debateTurnCount += 1;
      lastDebateTurnIndex = turn.index;
    }

    const nextTurn = turns[index + 1];
    const nextIsDebateTurn =
      nextTurn && (nextTurn.side === "A" || nextTurn.side === "B");

    if (
      debateTurnCount > 0 &&
      (!nextTurn || !nextIsDebateTurn || debateTurnCount >= MAX_ARCHIVE_ANALYSIS_BURST_TURNS)
    ) {
      checkpoints.push(lastDebateTurnIndex);
      debateTurnCount = 0;
      lastDebateTurnIndex = 0;
    }
  }

  return [...new Set(checkpoints.filter((value) => value > 0))];
}

function normalizeCheckpointIndexes(payload: unknown, turns: ArchivePlanningTurn[]) {
  const fallback = buildFallbackCheckpointIndexes(turns);
  if (!payload || typeof payload !== "object" || !("endTurnIndexes" in payload)) {
    return fallback;
  }

  const rawIndexes = (payload as { endTurnIndexes?: unknown }).endTurnIndexes;
  if (!Array.isArray(rawIndexes)) {
    return fallback;
  }

  const normalized = [...new Set(
    rawIndexes
      .map((value) => {
        if (typeof value === "number") {
          return Math.trunc(value);
        }
        if (typeof value === "string" && value.trim()) {
          return Number.parseInt(value, 10);
        }
        return Number.NaN;
      })
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= turns.length),
  )].sort((left, right) => left - right);

  const accepted: number[] = [];
  let previousEndIndex = 0;

  for (const endIndex of normalized) {
    const segment = turns.slice(previousEndIndex, endIndex);
    if (!hasDebateProgress(segment)) {
      continue;
    }

    accepted.push(endIndex);
    previousEndIndex = endIndex;
  }

  const remaining = turns.slice(previousEndIndex);
  if (hasDebateProgress(remaining)) {
    const fallbackFinalIndex = buildFallbackCheckpointIndexes(remaining).at(-1);
    const finalIndex = fallbackFinalIndex ?? turns.at(-1)?.index;
    if (finalIndex && accepted.at(-1) !== finalIndex) {
      accepted.push(finalIndex);
    }
  }

  return accepted.length > 0 ? accepted : fallback;
}

async function clearExistingArchiveAnalysisMessages(roomRefId: string) {
  await prisma.message.deleteMany({
    where: {
      roomRefId,
      type: MessageType.AI_ANALYSIS,
      externalRef: {
        startsWith: `${ARCHIVE_ANALYSIS_EXTERNAL_REF_PREFIX}:${roomRefId}:`,
      },
    },
  });
}

async function isImportedArchiveRoom(roomRefId: string, roomId: string) {
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

export async function executeArchiveAnalysisGenerationForRoomRef(
  roomRefId: string,
): Promise<AnalysisExecutionResult> {
  const room = await prisma.room.findUnique({
    where: { id: roomRefId },
    select: {
      id: true,
      roomId: true,
      name: true,
      status: true,
      createdById: true,
      analysisProfilePreference: true,
      voiceSourcePreference: true,
      transcriptionProviderPreference: true,
      transcriptionLanguagePreference: true,
    },
  });

  if (!room) {
    return { executed: false, reason: "room-missing" };
  }

  if (room.status !== RoomStatus.ENDED) {
    return { executed: false, reason: "room-not-ended" };
  }

  if (!(await isImportedArchiveRoom(roomRefId, room.roomId))) {
    return { executed: false, reason: "not-archive-room" };
  }

  const conversationMessages = await loadRoomConversationMessages(roomRefId);
  if (conversationMessages.length === 0) {
    return { executed: false, reason: "no-conversation" };
  }

  try {
    await markArchiveAnalysisPlanning(roomRefId);
    await clearExistingArchiveAnalysisMessages(roomRefId);

    const { speakerMap, turns } = compactArchivePlanningTurns(conversationMessages);
    if (turns.length === 0) {
      await markArchiveAnalysisFailed(roomRefId, "No valid archive turns remained after compaction.");
      return { executed: false, reason: "empty-conversation" };
    }

    const llmRuntime = await resolveConversationLlmRuntimeForOwner(room.createdById);
    if (!llmRuntime.configured) {
      const reason = llmRuntime.error ? "llm-runtime-blocked" : "llm-runtime-unavailable";
      await markArchiveAnalysisFailed(roomRefId, llmRuntime.error ?? "Archive analysis LLM is unavailable.");
      return {
        executed: false,
        reason,
      };
    }

    const promptOptions = {
      profilePreference: fromPrismaRoomAnalysisProfile(room.analysisProfilePreference),
      transcriptionLanguagePreference: fromPrismaRoomTranscriptionLanguage(
        room.transcriptionLanguagePreference,
      ),
    };
    const planningResult = await invokeArchiveAnalysisPlanner(
      {
        roomId: room.roomId,
        speakerMap,
        turns: turns.map((turn) => ({
          index: turn.index,
          speakerLabel: turn.speakerLabel,
          speakerName: turn.speakerName,
          side: turn.side,
          text: turn.text,
          latestMessageId: turn.latestMessageId,
        })),
      },
      room.createdById,
      llmRuntime,
      promptOptions,
    );
    await recordLlmUsageForOwner({
      ownerUserId: room.createdById,
      source: planningResult.source,
      totalTokens: planningResult.usage?.totalTokens,
    });

    const checkpointIndexes = normalizeCheckpointIndexes(planningResult.content, turns);
    if (checkpointIndexes.length === 0) {
      await markArchiveAnalysisFailed(roomRefId, "Failed to plan archive analysis checkpoints.");
      return { executed: false, reason: "planning-empty" };
    }

    await markArchiveAnalysisPlanReady(roomRefId, checkpointIndexes.length);

    let currentRoomName = room.name;
    let lastPersistedMessageId: string | undefined;
    let previousEndIndex = 0;

    for (let index = 0; index < checkpointIndexes.length; index += 1) {
      const endIndex = checkpointIndexes[index]!;
      const historyTurns = turns.slice(0, previousEndIndex);
      const currentTurns = turns.slice(previousEndIndex, endIndex);
      previousEndIndex = endIndex;

      if (currentTurns.length === 0 || !hasDebateProgress(currentTurns)) {
        await markArchiveAnalysisRealtimeProgress(roomRefId, index + 1);
        continue;
      }

      const latestCurrentTurn = currentTurns.at(-1)!;
      const trimmedHistoryTurns = historyTurns.slice(
        Math.max(0, historyTurns.length - getHistoryTurnLimit()),
      );
      const realtimeResult = await invokeRealtimeConversationAnalysis(
        {
          roomId: room.roomId,
          speakerMap,
          historyConversation: turnsToConversationText(trimmedHistoryTurns),
          currentRoundConversation: turnsToConversationText(currentTurns),
        },
        room.createdById,
        llmRuntime,
        promptOptions,
      );
      await recordLlmUsageForOwner({
        ownerUserId: room.createdById,
        source: realtimeResult.source,
        totalTokens: realtimeResult.usage?.totalTokens,
      });

      const normalizedRealtimeContent = isMockRealtimeAnalysisDebugPayload(realtimeResult.content)
        ? realtimeResult.content
        : normalizeRealtimeAnalysisContent(realtimeResult.content, {
            activeSpeakerLabels: getRealtimeActiveSpeakerLabels(currentTurns),
          });
      const roomName = getRoomNameFromAnalysisPayload(normalizedRealtimeContent);
      const externalRef = `${ARCHIVE_ANALYSIS_EXTERNAL_REF_PREFIX}:${roomRefId}:${latestCurrentTurn.latestMessageId}`;
      const analysisMessageCreatedAt = new Date(latestCurrentTurn.latestMessageAt.getTime() + 1);
      const content = JSON.stringify(normalizedRealtimeContent, null, 2);

      const persisted = await prisma.message.upsert({
        where: {
          externalRef,
        },
        update: {
          senderName: REALTIME_ANALYSIS_SENDER,
          participantId: null,
          type: MessageType.AI_ANALYSIS,
          content,
          createdAt: analysisMessageCreatedAt,
        },
        create: {
          roomRefId,
          type: MessageType.AI_ANALYSIS,
          senderName: REALTIME_ANALYSIS_SENDER,
          participantId: null,
          content,
          externalRef,
          createdAt: analysisMessageCreatedAt,
        },
      });

      if (roomName && roomName !== currentRoomName) {
        await prisma.room.update({
          where: {
            id: room.id,
          },
          data: {
            name: roomName,
          },
        });
        currentRoomName = roomName;
      }

      try {
        await relayAiMessage(room.roomId, room, toChatMessage(persisted));
      } catch (error) {
        if (isRelayRoomMissingError(error)) {
          console.info("Skipped archive AI analysis relay because LiveKit room is not active", {
            roomId: room.roomId,
            roomRefId,
            messageId: persisted.id,
          });
        } else {
          console.warn("Failed to relay archive AI analysis message", {
            roomId: room.roomId,
            roomRefId,
            messageId: persisted.id,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      lastPersistedMessageId = persisted.id;
      await markArchiveAnalysisRealtimeProgress(roomRefId, index + 1);
    }

    await markArchiveAnalysisFinalSummary(roomRefId);
    const summaryResult = await executeFinalSummaryForRoomRef(roomRefId);
    if (!summaryResult.executed) {
      throw new Error(summaryResult.reason ?? "Archive final summary generation failed");
    }

    await markArchiveAnalysisCompleted(roomRefId);

    return {
      executed: true,
      messageId: summaryResult.messageId ?? lastPersistedMessageId,
    };
  } catch (error) {
    await markArchiveAnalysisFailed(
      roomRefId,
      error instanceof Error ? error.message : "Archive analysis generation failed",
    );
    throw error;
  }
}
