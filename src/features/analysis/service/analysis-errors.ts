type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmptyLine(input: string) {
  const lines = input.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return input.trim();
}

function getErrorCode(error: unknown) {
  const record = asRecord(error);
  const code = record ? asString(record.code) : null;
  return code ?? null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

function getErrorMetaTable(error: unknown) {
  const record = asRecord(error);
  if (!record) {
    return null;
  }

  const meta = asRecord(record.meta);
  if (!meta) {
    return null;
  }

  return asString(meta.table);
}

export function getAnalysisMissingTable(error: unknown): string | null {
  const code = getErrorCode(error);
  if (code !== "P2021") {
    return null;
  }

  const table = getErrorMetaTable(error);
  if (table && (table.includes("RoomAnalysisEvent") || table.includes("RoomAnalysisState"))) {
    return table;
  }

  const message = getErrorMessage(error);
  if (message.includes("RoomAnalysisEvent")) {
    return "RoomAnalysisEvent";
  }
  if (message.includes("RoomAnalysisState")) {
    return "RoomAnalysisState";
  }
  return null;
}

export function isAnalysisSchemaMissingError(error: unknown) {
  return getAnalysisMissingTable(error) !== null;
}

export function formatCompactAnalysisError(error: unknown) {
  const code = getErrorCode(error);
  const message = firstNonEmptyLine(getErrorMessage(error));

  return code ? `${code}: ${message}` : message;
}

export function getAnalysisSchemaFixHint() {
  return "Missing analysis tables. Run `pnpm prisma db push --accept-data-loss` to sync schema directly.";
}
