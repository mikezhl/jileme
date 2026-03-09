import { ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type WorkerState = "starting" | "ready" | "failed";

type WorkerRecord = {
  instanceId: string;
  process: ChildProcess;
  state: WorkerState;
  startedAt: number;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: unknown) => void;
  startupTimeout: NodeJS.Timeout;
};

type EnsureWorkerOptions = {
  waitForReady?: boolean;
  reason?: string;
};

const DEFAULT_STARTUP_TIMEOUT_MS = 30 * 1000;

const READY_LOG_TOKEN = "[conversation-analysis-worker] ready";

declare global {
  var conversationAnalysisWorkerRecord: WorkerRecord | undefined;
}

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

function getStartupTimeoutMs() {
  return parsePositiveNumber(process.env.ANALYZER_WORKER_STARTUP_TIMEOUT_MS, DEFAULT_STARTUP_TIMEOUT_MS);
}

function attachLineReader(stream: NodeJS.ReadableStream, onLine: (line: string) => void) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        onLine(line);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });
}

function getSpawnCommandAndArgs() {
  const localTsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  if (fs.existsSync(localTsxCli)) {
    return {
      command: process.execPath,
      args: [localTsxCli, "src/features/analysis/worker/conversation-analysis-worker.ts"],
    };
  }

  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, "exec", "tsx", "src/features/analysis/worker/conversation-analysis-worker.ts"],
    };
  }

  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["exec", "tsx", "src/features/analysis/worker/conversation-analysis-worker.ts"],
  };
}

let isLogInitialized = false;

function writeWorkerLog(message: string, data?: unknown) {
  const logDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, "analysis-worker.log");

  if (!isLogInitialized) {
    fs.writeFileSync(logFile, "");
    isLogInitialized = true;
  }

  const timestamp = new Date().toISOString();
  const dataPart = data ? ` ${JSON.stringify(data)}` : "";
  fs.appendFileSync(logFile, `[${timestamp}] ${message}${dataPart}\n`);
}

function stopWorker(record: WorkerRecord, reason: string) {
  writeWorkerLog("[analysis-worker] stopping", { instanceId: record.instanceId, reason });

  try {
    record.process.kill();
  } catch {
    // Ignore kill errors.
  }
}

function spawnWorker(reason: string | undefined) {
  const startupTimeoutMs = getStartupTimeoutMs();

  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: unknown) => void) | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const { command, args } = getSpawnCommandAndArgs();
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const record: WorkerRecord = {
    instanceId: crypto.randomUUID(),
    process: child,
    state: "starting",
    startedAt: Date.now(),
    readyPromise,
    resolveReady: () => {
      if (record.state === "ready") {
        return;
      }

      record.state = "ready";
      resolveReady?.();
      resolveReady = null;
      rejectReady = null;
      writeWorkerLog("[analysis-worker] ready", { instanceId: record.instanceId });
    },
    rejectReady: (error: unknown) => {
      if (record.state === "ready") {
        return;
      }

      record.state = "failed";
      rejectReady?.(error);
      resolveReady = null;
      rejectReady = null;
      writeWorkerLog("[analysis-worker] failed", {
        instanceId: record.instanceId,
        error: error instanceof Error ? error.message : error,
      });
    },
    startupTimeout: setTimeout(() => {
      if (record.state === "ready") {
        return;
      }

      record.rejectReady(new Error(`Analysis worker startup timeout after ${startupTimeoutMs}ms`));
      stopWorker(record, "startup-timeout");
    }, startupTimeoutMs),
  };

  const handleLine = (line: string, stream: "stdout" | "stderr") => {
    writeWorkerLog(`[analysis-worker][${stream}] ${line}`);

    if (line.includes(READY_LOG_TOKEN)) {
      clearTimeout(record.startupTimeout);
      record.resolveReady();
    }
  };

  if (child.stdout) {
    attachLineReader(child.stdout, (line) => handleLine(line, "stdout"));
  }

  if (child.stderr) {
    attachLineReader(child.stderr, (line) => handleLine(line, "stderr"));
  }

  child.on("error", (error) => {
    clearTimeout(record.startupTimeout);
    record.rejectReady(error);
    stopWorker(record, "spawn-error");
  });

  child.on("exit", (code, signal) => {
    clearTimeout(record.startupTimeout);

    if (record.state !== "ready") {
      record.rejectReady(
        new Error(`Analysis worker exited before ready (code=${code ?? "null"}, signal=${signal ?? "null"})`),
      );
    }

    if (global.conversationAnalysisWorkerRecord?.instanceId === record.instanceId) {
      global.conversationAnalysisWorkerRecord = undefined;
    }

    writeWorkerLog("[analysis-worker] exited", {
      instanceId: record.instanceId,
      code,
      signal,
      reason,
    });
  });

  writeWorkerLog("[analysis-worker] starting", { reason: reason ?? "unspecified" });

  return record;
}

export async function ensureConversationAnalysisWorker(options?: EnsureWorkerOptions) {
  let record = global.conversationAnalysisWorkerRecord;

  if (!record || record.state === "failed") {
    if (record) {
      stopWorker(record, "restart-after-failure");
    }

    record = spawnWorker(options?.reason);
    global.conversationAnalysisWorkerRecord = record;
  }

  if (options?.waitForReady !== false) {
    await record.readyPromise;
  }

  return {
    instanceId: record.instanceId,
    state: record.state,
    startedAt: new Date(record.startedAt).toISOString(),
  };
}
