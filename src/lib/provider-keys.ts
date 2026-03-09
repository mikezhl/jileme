import crypto from "node:crypto";

import { UserProviderKeys } from "@prisma/client";

import { getUserProviderKeysMode, optionalEnv, requireEnv } from "./env";
import { prisma } from "./prisma";

const ENCRYPTION_ALGO = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

export type KeySource = "user" | "system" | "unavailable";

export type UserKeyPayload = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  deepgramApiKey: string;
};

export type UserKeyStatus = {
  configured: boolean;
  livekitUrlMask: string | null;
  livekitApiKeyMask: string | null;
  livekitApiSecretMask: string | null;
  deepgramApiKeyMask: string | null;
};

export type ResolvedProviderCredentials = {
  livekitUrl: string | null;
  livekitApiKey: string | null;
  livekitApiSecret: string | null;
  deepgramApiKey: string | null;
  livekitSource: KeySource;
  deepgramSource: KeySource;
  livekitApiKeyMask: string | null;
  deepgramApiKeyMask: string | null;
};

type NormalizedUserKeys = {
  livekitUrl: string | null;
  livekitApiKey: string | null;
  livekitApiSecret: string | null;
  deepgramApiKey: string | null;
};

type CompleteUserKeys = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  deepgramApiKey: string;
};

function getEncryptionKey() {
  const secret = requireEnv("APP_ENCRYPTION_SECRET");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptValue(plaintext: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptValue(payload: string) {
  const [ivRaw, tagRaw, ciphertextRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Invalid encrypted value format");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const ciphertext = Buffer.from(ciphertextRaw, "base64");

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

function decryptOptional(payload?: string | null) {
  if (!payload) {
    return null;
  }
  return decryptValue(payload);
}

function normalizeSecret(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function maskSecret(value?: string | null) {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return `${value[0] ?? "*"}**${value.at(-1) ?? "*"}`;
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function normalizeUserKeys(payload: {
  livekitUrl?: string | null;
  livekitApiKey?: string | null;
  livekitApiSecret?: string | null;
  deepgramApiKey?: string | null;
}): NormalizedUserKeys {
  return {
    livekitUrl: normalizeSecret(payload.livekitUrl),
    livekitApiKey: normalizeSecret(payload.livekitApiKey),
    livekitApiSecret: normalizeSecret(payload.livekitApiSecret),
    deepgramApiKey: normalizeSecret(payload.deepgramApiKey),
  };
}

function hasAnyUserKeyValue(keys: NormalizedUserKeys) {
  return Boolean(
    keys.livekitUrl || keys.livekitApiKey || keys.livekitApiSecret || keys.deepgramApiKey,
  );
}

function hasCompleteUserKeySet(keys: NormalizedUserKeys): keys is CompleteUserKeys {
  return Boolean(
    keys.livekitUrl && keys.livekitApiKey && keys.livekitApiSecret && keys.deepgramApiKey,
  );
}

function toUserKeyStatus(record: UserProviderKeys | null): UserKeyStatus {
  if (!record) {
    return {
      configured: false,
      livekitUrlMask: null,
      livekitApiKeyMask: null,
      livekitApiSecretMask: null,
      deepgramApiKeyMask: null,
    };
  }

  const normalizedKeys = normalizeUserKeys({
    livekitUrl: decryptOptional(record.livekitUrlEncrypted),
    livekitApiKey: decryptOptional(record.livekitApiKeyEncrypted),
    livekitApiSecret: decryptOptional(record.livekitApiSecretEncrypted),
    deepgramApiKey: decryptOptional(record.deepgramApiKeyEncrypted),
  });

  return {
    configured: hasCompleteUserKeySet(normalizedKeys),
    livekitUrlMask: maskSecret(normalizedKeys.livekitUrl),
    livekitApiKeyMask: maskSecret(normalizedKeys.livekitApiKey),
    livekitApiSecretMask: maskSecret(normalizedKeys.livekitApiSecret),
    deepgramApiKeyMask: maskSecret(normalizedKeys.deepgramApiKey),
  };
}

export async function getUserKeyStatus(userId: string): Promise<UserKeyStatus> {
  const record = await prisma.userProviderKeys.findUnique({
    where: { userId },
  });
  return toUserKeyStatus(record);
}

export async function upsertUserKeys(userId: string, payload: UserKeyPayload | null) {
  if (!payload) {
    await prisma.userProviderKeys.deleteMany({
      where: { userId },
    });
    return getUserKeyStatus(userId);
  }

  const normalizedKeys = normalizeUserKeys(payload);
  if (!hasCompleteUserKeySet(normalizedKeys)) {
    throw new Error(
      "livekitUrl, livekitApiKey, livekitApiSecret and deepgramApiKey are required",
    );
  }

  await prisma.userProviderKeys.upsert({
    where: { userId },
    create: {
      userId,
      livekitUrlEncrypted: encryptValue(normalizedKeys.livekitUrl),
      livekitApiKeyEncrypted: encryptValue(normalizedKeys.livekitApiKey),
      livekitApiSecretEncrypted: encryptValue(normalizedKeys.livekitApiSecret),
      deepgramApiKeyEncrypted: encryptValue(normalizedKeys.deepgramApiKey),
    },
    update: {
      livekitUrlEncrypted: encryptValue(normalizedKeys.livekitUrl),
      livekitApiKeyEncrypted: encryptValue(normalizedKeys.livekitApiKey),
      livekitApiSecretEncrypted: encryptValue(normalizedKeys.livekitApiSecret),
      deepgramApiKeyEncrypted: encryptValue(normalizedKeys.deepgramApiKey),
    },
  });

  return getUserKeyStatus(userId);
}

export async function resolveProviderCredentialsForOwner(
  ownerUserId: string | null | undefined,
): Promise<ResolvedProviderCredentials> {
  const mode = getUserProviderKeysMode();

  const canUseSystemKeys = mode !== "full";
  const canUseUserKeys = mode !== "false";

  const defaultLivekitUrl = canUseSystemKeys ? requireEnv("LIVEKIT_URL") : null;
  const defaultLivekitApiKey = canUseSystemKeys ? requireEnv("LIVEKIT_API_KEY") : null;
  const defaultLivekitApiSecret = canUseSystemKeys ? requireEnv("LIVEKIT_API_SECRET") : null;
  const defaultDeepgramApiKey = canUseSystemKeys ? optionalEnv("DEEPGRAM_API_KEY") : null;

  let livekitUrl = defaultLivekitUrl;
  let livekitApiKey = defaultLivekitApiKey;
  let livekitApiSecret = defaultLivekitApiSecret;
  let deepgramApiKey = defaultDeepgramApiKey;
  let livekitSource: KeySource = canUseSystemKeys ? "system" : "unavailable";
  let deepgramSource: KeySource = defaultDeepgramApiKey ? "system" : "unavailable";
  const setCredentialsUnavailable = () => {
    livekitUrl = null;
    livekitApiKey = null;
    livekitApiSecret = null;
    deepgramApiKey = null;
    livekitSource = "unavailable";
    deepgramSource = "unavailable";
  };

  if (canUseUserKeys && ownerUserId) {
    const record = await prisma.userProviderKeys.findUnique({
      where: { userId: ownerUserId },
    });

    if (record) {
      try {
        const userKeys = normalizeUserKeys({
          livekitUrl: decryptOptional(record.livekitUrlEncrypted),
          livekitApiKey: decryptOptional(record.livekitApiKeyEncrypted),
          livekitApiSecret: decryptOptional(record.livekitApiSecretEncrypted),
          deepgramApiKey: decryptOptional(record.deepgramApiKeyEncrypted),
        });

        if (hasCompleteUserKeySet(userKeys)) {
          livekitUrl = userKeys.livekitUrl;
          livekitApiKey = userKeys.livekitApiKey;
          livekitApiSecret = userKeys.livekitApiSecret;
          deepgramApiKey = userKeys.deepgramApiKey;
          livekitSource = "user";
          deepgramSource = "user";
        } else if (hasAnyUserKeyValue(userKeys)) {
          console.warn("Ignoring incomplete user provider keys", {
            ownerUserId,
            mode,
            hasLivekitUrl: Boolean(userKeys.livekitUrl),
            hasLivekitApiKey: Boolean(userKeys.livekitApiKey),
            hasLivekitApiSecret: Boolean(userKeys.livekitApiSecret),
            hasDeepgramApiKey: Boolean(userKeys.deepgramApiKey),
          });
          if (!canUseSystemKeys) {
            setCredentialsUnavailable();
          }
        } else if (!canUseSystemKeys) {
          setCredentialsUnavailable();
        }
      } catch (error) {
        console.error("Failed to decrypt user provider keys", {
          ownerUserId,
          mode,
          error: error instanceof Error ? error.message : error,
        });

        if (!canUseSystemKeys) {
          setCredentialsUnavailable();
        }
      }
    } else if (!canUseSystemKeys) {
      setCredentialsUnavailable();
    }
  }

  return {
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    deepgramApiKey,
    livekitSource,
    deepgramSource,
    livekitApiKeyMask: livekitSource === "user" ? maskSecret(livekitApiKey) : null,
    deepgramApiKeyMask: deepgramSource === "user" ? maskSecret(deepgramApiKey) : null,
  };
}
