import "dotenv/config";

import { AnalysisEventType } from "@prisma/client";
import { fileURLToPath } from "node:url";

import {
  markAnalysisEventProcessed,
  markAnalysisEventsProcessed,
  pullPendingAnalysisEvents,
  type PendingAnalysisEvent,
} from "@/features/analysis/service/analysis-events";
import {
  formatCompactAnalysisError,
  getAnalysisMissingTable,
  getAnalysisSchemaFixHint,
  isAnalysisSchemaMissingError,
} from "@/features/analysis/service/analysis-errors";
import {
  executeFinalSummaryForRoomRef,
  executeRealtimeAnalysisForRoomRef,
} from "@/features/analysis/service/analysis-service";
import { prisma } from "@/lib/prisma";

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_REALTIME_DEBOUNCE_MS = 10000;
const DEFAULT_EVENT_BATCH_SIZE = 200;
const DEFAULT_SCHEMA_RETRY_MS = 60 * 1000;

const realtimeTimers = new Map<string, NodeJS.Timeout>();
const realtimeInFlight = new Set<string>();

let isPolling = false;
let pollTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let schemaRetryUntil = 0;

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

function getPollIntervalMs() {
  return parsePositiveNumber(process.env.ANALYZER_QUEUE_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
}

function getRealtimeDebounceMs() {
  return parsePositiveNumber(process.env.ANALYZER_REALTIME_DEBOUNCE_MS, DEFAULT_REALTIME_DEBOUNCE_MS);
}

function getEventBatchSize() {
  return parsePositiveNumber(process.env.ANALYZER_EVENT_BATCH_SIZE, DEFAULT_EVENT_BATCH_SIZE);
}

function getSchemaRetryMs() {
  return parsePositiveNumber(process.env.ANALYZER_SCHEMA_RETRY_MS, DEFAULT_SCHEMA_RETRY_MS);
}

function logInfo(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.info(`[conversation-analysis-worker] ${message}`, payload);
    return;
  }

  console.info(`[conversation-analysis-worker] ${message}`);
}

function logWarn(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.warn(`[conversation-analysis-worker] ${message}`, payload);
    return;
  }

  console.warn(`[conversation-analysis-worker] ${message}`);
}

function logError(message: string, error: unknown, payload?: Record<string, unknown>) {
  console.error(`[conversation-analysis-worker] ${message}`, {
    ...(payload ?? {}),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
  });
}

async function runRealtimeAnalysis(roomRefId: string) {
  if (realtimeInFlight.has(roomRefId)) {
    return;
  }

  realtimeInFlight.add(roomRefId);

  try {
    const result = await executeRealtimeAnalysisForRoomRef(roomRefId);
    if (result.executed) {
      logInfo("Realtime analysis executed", {
        roomRefId,
        messageId: result.messageId,
      });
    } else {
      logInfo("Realtime analysis skipped", {
        roomRefId,
        reason: result.reason,
      });
    }
  } catch (error) {
    logError("Realtime analysis failed", error, { roomRefId });
  } finally {
    realtimeInFlight.delete(roomRefId);
  }
}

function scheduleRealtimeAnalysis(roomRefId: string) {
  const existingTimer = realtimeTimers.get(roomRefId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    realtimeTimers.delete(roomRefId);
    void runRealtimeAnalysis(roomRefId);
  }, getRealtimeDebounceMs());

  realtimeTimers.set(roomRefId, timer);
}

async function handleFinalSummaryEvent(event: PendingAnalysisEvent) {
  try {
    const result = await executeFinalSummaryForRoomRef(event.roomRefId);
    await markAnalysisEventProcessed(event.id);

    if (result.executed) {
      logInfo("Final summary executed", {
        roomRefId: event.roomRefId,
        messageId: result.messageId,
      });
    } else {
      logInfo("Final summary skipped", {
        roomRefId: event.roomRefId,
        reason: result.reason,
      });
    }
  } catch (error) {
    logError("Final summary processing failed", error, {
      roomRefId: event.roomRefId,
      eventId: event.id,
    });
  }
}

async function pollOnce() {
  if (isPolling || isShuttingDown) {
    return;
  }

  if (Date.now() < schemaRetryUntil) {
    return;
  }

  isPolling = true;

  try {
    const events = await pullPendingAnalysisEvents(getEventBatchSize());
    schemaRetryUntil = 0;

    if (events.length === 0) {
      return;
    }

    const realtimeEventIds: string[] = [];
    const finalSummaryEvents: PendingAnalysisEvent[] = [];

    for (const event of events) {
      if (event.eventType === AnalysisEventType.REALTIME_TRIGGER) {
        scheduleRealtimeAnalysis(event.roomRefId);
        realtimeEventIds.push(event.id);
        continue;
      }

      if (event.eventType === AnalysisEventType.FINAL_SUMMARY_TRIGGER) {
        finalSummaryEvents.push(event);
      }
    }

    logInfo("Pending analysis events accepted", {
      eventCount: events.length,
      realtimeEvents: realtimeEventIds.length,
      finalSummaryEvents: finalSummaryEvents.length,
      roomCount: new Set(events.map((event) => event.roomRefId)).size,
    });

    await markAnalysisEventsProcessed(realtimeEventIds);

    for (const finalSummaryEvent of finalSummaryEvents) {
      await handleFinalSummaryEvent(finalSummaryEvent);
    }
  } catch (error) {
    if (isAnalysisSchemaMissingError(error)) {
      const retryMs = getSchemaRetryMs();
      const missingTable = getAnalysisMissingTable(error) ?? "analysis-schema";
      schemaRetryUntil = Date.now() + retryMs;

      logWarn("Polling paused due to missing analysis schema", {
        missingTable,
        retryInMs: retryMs,
        hint: getAnalysisSchemaFixHint(),
        error: formatCompactAnalysisError(error),
      });
      return;
    }

    logError("Polling cycle failed", error);
  } finally {
    isPolling = false;
  }
}

function startPolling() {
  if (pollTimer) {
    return;
  }

  const pollIntervalMs = getPollIntervalMs();
  pollTimer = setInterval(() => {
    void pollOnce();
  }, pollIntervalMs);

  void pollOnce();

  logInfo("Worker polling started", {
    pollIntervalMs,
    debounceMs: getRealtimeDebounceMs(),
    eventBatchSize: getEventBatchSize(),
    schemaRetryMs: getSchemaRetryMs(),
  });
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  for (const timer of realtimeTimers.values()) {
    clearTimeout(timer);
  }
  realtimeTimers.clear();

  await prisma.$disconnect();
  logInfo("Worker shutdown complete");
}

async function runWorker() {
  startPolling();
  logInfo("ready");

  const onSignal = (signal: NodeJS.Signals) => {
    logInfo("Received shutdown signal", { signal });
    void shutdown().finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runWorker().catch((error) => {
    logError("Worker process crashed", error);
    process.exit(1);
  });
}
