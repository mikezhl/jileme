import {
  ArchiveAnalysisStage,
  ArchiveAnalysisStatus,
  MessageType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MAX_ARCHIVE_ANALYSIS_ERROR_LENGTH = 500;

export type ArchiveAnalysisSnapshot = {
  status: ArchiveAnalysisStatus;
  stage: ArchiveAnalysisStage;
  plannedCount: number;
  completedCount: number;
  error: string | null;
  requestedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export function buildDefaultArchiveAnalysisSnapshot(): ArchiveAnalysisSnapshot {
  return {
    status: ArchiveAnalysisStatus.IDLE,
    stage: ArchiveAnalysisStage.IDLE,
    plannedCount: 0,
    completedCount: 0,
    error: null,
    requestedAt: null,
    startedAt: null,
    completedAt: null,
  };
}

type ArchiveAnalysisStateWrite = {
  status: ArchiveAnalysisStatus;
  stage: ArchiveAnalysisStage;
  plannedCount?: number;
  completedCount?: number;
  error?: string | null;
  requestedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

function normalizeArchiveAnalysisError(error: string | null | undefined) {
  const normalized = error?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_ARCHIVE_ANALYSIS_ERROR_LENGTH);
}

function buildArchiveAnalysisStateCreateData(
  roomRefId: string,
  write: ArchiveAnalysisStateWrite,
) {
  return {
    roomRefId,
    archiveAnalysisStatus: write.status,
    archiveAnalysisStage: write.stage,
    archiveAnalysisPlannedCount: write.plannedCount ?? 0,
    archiveAnalysisCompletedCount: write.completedCount ?? 0,
    archiveAnalysisError: write.error ?? null,
    archiveAnalysisRequestedAt: write.requestedAt ?? null,
    archiveAnalysisStartedAt: write.startedAt ?? null,
    archiveAnalysisCompletedAt: write.completedAt ?? null,
  };
}

function buildArchiveAnalysisStateUpdateData(write: ArchiveAnalysisStateWrite) {
  return {
    archiveAnalysisStatus: write.status,
    archiveAnalysisStage: write.stage,
    ...(write.plannedCount === undefined
      ? {}
      : { archiveAnalysisPlannedCount: write.plannedCount }),
    ...(write.completedCount === undefined
      ? {}
      : { archiveAnalysisCompletedCount: write.completedCount }),
    ...(write.error === undefined ? {} : { archiveAnalysisError: write.error }),
    ...(write.requestedAt === undefined
      ? {}
      : { archiveAnalysisRequestedAt: write.requestedAt }),
    ...(write.startedAt === undefined
      ? {}
      : { archiveAnalysisStartedAt: write.startedAt }),
    ...(write.completedAt === undefined
      ? {}
      : { archiveAnalysisCompletedAt: write.completedAt }),
  };
}

async function upsertArchiveAnalysisState(
  roomRefId: string,
  options: {
    create: ArchiveAnalysisStateWrite;
    update: ArchiveAnalysisStateWrite;
  },
) {
  await prisma.roomAnalysisState.upsert({
    where: { roomRefId },
    create: buildArchiveAnalysisStateCreateData(roomRefId, options.create),
    update: buildArchiveAnalysisStateUpdateData(options.update),
  });
}

export async function getArchiveAnalysisSnapshot(
  roomRefId: string,
): Promise<ArchiveAnalysisSnapshot> {
  const state = await prisma.roomAnalysisState.findUnique({
    where: { roomRefId },
    select: {
      archiveAnalysisStatus: true,
      archiveAnalysisStage: true,
      archiveAnalysisPlannedCount: true,
      archiveAnalysisCompletedCount: true,
      archiveAnalysisError: true,
      archiveAnalysisRequestedAt: true,
      archiveAnalysisStartedAt: true,
      archiveAnalysisCompletedAt: true,
    },
  });

  if (!state) {
    return buildDefaultArchiveAnalysisSnapshot();
  }

  return {
    status: state.archiveAnalysisStatus,
    stage: state.archiveAnalysisStage,
    plannedCount: state.archiveAnalysisPlannedCount,
    completedCount: state.archiveAnalysisCompletedCount,
    error: state.archiveAnalysisError,
    requestedAt: state.archiveAnalysisRequestedAt,
    startedAt: state.archiveAnalysisStartedAt,
    completedAt: state.archiveAnalysisCompletedAt,
  };
}

export async function queueArchiveAnalysisGeneration(roomRefId: string) {
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.QUEUED,
      stage: ArchiveAnalysisStage.IDLE,
      plannedCount: 0,
      completedCount: 0,
      error: null,
      requestedAt: now,
      startedAt: null,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.QUEUED,
      stage: ArchiveAnalysisStage.IDLE,
      plannedCount: 0,
      completedCount: 0,
      error: null,
      requestedAt: now,
      startedAt: null,
      completedAt: null,
    },
  });
}

export async function clearArchiveAnalysisState(roomRefId: string) {
  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.IDLE,
      stage: ArchiveAnalysisStage.IDLE,
      plannedCount: 0,
      completedCount: 0,
      error: null,
      requestedAt: null,
      startedAt: null,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.IDLE,
      stage: ArchiveAnalysisStage.IDLE,
      plannedCount: 0,
      completedCount: 0,
      error: null,
      requestedAt: null,
      startedAt: null,
      completedAt: null,
    },
  });
}

export async function markArchiveAnalysisPlanning(roomRefId: string) {
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.PLANNING,
      plannedCount: 0,
      completedCount: 0,
      error: null,
      requestedAt: now,
      startedAt: now,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.PLANNING,
      error: null,
      startedAt: now,
      completedAt: null,
    },
  });
}

export async function markArchiveAnalysisPlanReady(
  roomRefId: string,
  plannedCount: number,
) {
  const normalizedPlannedCount = Math.max(0, plannedCount);
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.REALTIME,
      plannedCount: normalizedPlannedCount,
      completedCount: 0,
      error: null,
      requestedAt: now,
      startedAt: now,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.REALTIME,
      plannedCount: normalizedPlannedCount,
      completedCount: 0,
      error: null,
      completedAt: null,
    },
  });
}

export async function markArchiveAnalysisRealtimeProgress(
  roomRefId: string,
  completedCount: number,
) {
  const normalizedCompletedCount = Math.max(0, completedCount);
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.REALTIME,
      plannedCount: normalizedCompletedCount,
      completedCount: normalizedCompletedCount,
      error: null,
      requestedAt: now,
      startedAt: now,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.REALTIME,
      completedCount: normalizedCompletedCount,
      error: null,
      completedAt: null,
    },
  });
}

export async function markArchiveAnalysisFinalSummary(roomRefId: string) {
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.FINAL_SUMMARY,
      error: null,
      requestedAt: now,
      startedAt: now,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.RUNNING,
      stage: ArchiveAnalysisStage.FINAL_SUMMARY,
      error: null,
      completedAt: null,
    },
  });
}

export async function markArchiveAnalysisCompleted(roomRefId: string) {
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.COMPLETED,
      stage: ArchiveAnalysisStage.COMPLETED,
      error: null,
      requestedAt: now,
      startedAt: now,
      completedAt: now,
    },
    update: {
      status: ArchiveAnalysisStatus.COMPLETED,
      stage: ArchiveAnalysisStage.COMPLETED,
      error: null,
      completedAt: now,
    },
  });
}

export async function markArchiveAnalysisFailed(
  roomRefId: string,
  error: string | null | undefined,
) {
  const now = new Date();

  await upsertArchiveAnalysisState(roomRefId, {
    create: {
      status: ArchiveAnalysisStatus.FAILED,
      stage: ArchiveAnalysisStage.FAILED,
      error: normalizeArchiveAnalysisError(error),
      requestedAt: now,
      startedAt: now,
      completedAt: null,
    },
    update: {
      status: ArchiveAnalysisStatus.FAILED,
      stage: ArchiveAnalysisStage.FAILED,
      error: normalizeArchiveAnalysisError(error),
      completedAt: null,
    },
  });
}

type RealtimeCursorMessage = {
  id: string;
  createdAt: Date;
};

async function upsertRealtimeAnalysisCursor(
  roomRefId: string,
  message: RealtimeCursorMessage | null,
) {
  if (!message) {
    return false;
  }

  await prisma.roomAnalysisState.upsert({
    where: {
      roomRefId,
    },
    create: {
      roomRefId,
      lastRealtimeMessageId: message.id,
      lastRealtimeMessageAt: message.createdAt,
    },
    update: {
      lastRealtimeMessageId: message.id,
      lastRealtimeMessageAt: message.createdAt,
    },
  });

  return true;
}

export async function isRealtimeAnalysisEnabledForRoom(roomRefId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomRefId },
    select: {
      analysisEnabled: true,
    },
  });

  return room?.analysisEnabled ?? false;
}

export async function advanceRealtimeAnalysisCursorToMessage(
  roomRefId: string,
  messageId: string,
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      roomRefId: true,
      type: true,
      createdAt: true,
    },
  });

  if (
    !message ||
    message.roomRefId !== roomRefId ||
    (message.type !== MessageType.TEXT && message.type !== MessageType.TRANSCRIPT)
  ) {
    return false;
  }

  return upsertRealtimeAnalysisCursor(roomRefId, {
    id: message.id,
    createdAt: message.createdAt,
  });
}

export async function advanceRealtimeAnalysisCursorToLatestConversationMessage(roomRefId: string) {
  const latestMessage = await prisma.message.findFirst({
    where: {
      roomRefId,
      type: {
        in: [MessageType.TEXT, MessageType.TRANSCRIPT],
      },
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    select: {
      id: true,
      createdAt: true,
    },
  });

  return upsertRealtimeAnalysisCursor(roomRefId, latestMessage);
}
