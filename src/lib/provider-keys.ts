import crypto from "node:crypto";

import { UserProviderKeys } from "@prisma/client";

import { getUserProviderKeysMode, optionalEnv, requireEnv } from "./env";
import { prisma } from "./prisma";

const ENCRYPTION_ALGO = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

export type KeySource = "user" | "system" | "unavailable";

export type UserKeyPayload = {
  livekitUrl?: string;
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

  const livekitUrl = decryptOptional(record.livekitUrlEncrypted);
  const livekitApiKey = decryptOptional(record.livekitApiKeyEncrypted);
  const livekitApiSecret = decryptOptional(record.livekitApiSecretEncrypted);
  const deepgramApiKey = decryptOptional(record.deepgramApiKeyEncrypted);

  return {
    configured: Boolean(livekitApiKey && livekitApiSecret && deepgramApiKey),
    livekitUrlMask: maskSecret(livekitUrl),
    livekitApiKeyMask: maskSecret(livekitApiKey),
    livekitApiSecretMask: maskSecret(livekitApiSecret),
    deepgramApiKeyMask: maskSecret(deepgramApiKey),
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

  const livekitUrl = normalizeSecret(payload.livekitUrl);
  const livekitApiKey = normalizeSecret(payload.livekitApiKey);
  const livekitApiSecret = normalizeSecret(payload.livekitApiSecret);
  const deepgramApiKey = normalizeSecret(payload.deepgramApiKey);
  const mode = getUserProviderKeysMode();

  if (!livekitApiKey || !livekitApiSecret || !deepgramApiKey) {
    throw new Error("livekitApiKey, livekitApiSecret and deepgramApiKey are required");
  }

  if (mode === "full" && !livekitUrl) {
    throw new Error("livekitUrl is required when USER_PROVIDER_KEYS_MODE=full");
  }

  await prisma.userProviderKeys.upsert({
    where: { userId },
    create: {
      userId,
      livekitUrlEncrypted: livekitUrl ? encryptValue(livekitUrl) : null,
      livekitApiKeyEncrypted: encryptValue(livekitApiKey),
      livekitApiSecretEncrypted: encryptValue(livekitApiSecret),
      deepgramApiKeyEncrypted: encryptValue(deepgramApiKey),
    },
    update: {
      livekitUrlEncrypted: livekitUrl ? encryptValue(livekitUrl) : null,
      livekitApiKeyEncrypted: encryptValue(livekitApiKey),
      livekitApiSecretEncrypted: encryptValue(livekitApiSecret),
      deepgramApiKeyEncrypted: encryptValue(deepgramApiKey),
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

  if (canUseUserKeys && ownerUserId) {
    const record = await prisma.userProviderKeys.findUnique({
      where: { userId: ownerUserId },
    });

    if (record) {
      try {
        const userLivekitUrl = normalizeSecret(decryptOptional(record.livekitUrlEncrypted));
        const userLivekitApiKey = normalizeSecret(decryptOptional(record.livekitApiKeyEncrypted));
        const userLivekitApiSecret = normalizeSecret(
          decryptOptional(record.livekitApiSecretEncrypted),
        );
        const userDeepgramApiKey = normalizeSecret(decryptOptional(record.deepgramApiKeyEncrypted));

        if (userLivekitUrl && userLivekitApiKey && userLivekitApiSecret) {
          livekitUrl = userLivekitUrl;
          livekitApiKey = userLivekitApiKey;
          livekitApiSecret = userLivekitApiSecret;
          livekitSource = "user";
        } else if (!canUseSystemKeys) {
          livekitUrl = null;
          livekitApiKey = null;
          livekitApiSecret = null;
          livekitSource = "unavailable";
        }

        if (userDeepgramApiKey) {
          deepgramApiKey = userDeepgramApiKey;
          deepgramSource = "user";
        } else if (!canUseSystemKeys) {
          deepgramApiKey = null;
          deepgramSource = "unavailable";
        }
      } catch (error) {
        console.error("Failed to decrypt user provider keys", {
          ownerUserId,
          mode,
          error: error instanceof Error ? error.message : error,
        });

        if (!canUseSystemKeys) {
          livekitUrl = null;
          livekitApiKey = null;
          livekitApiSecret = null;
          deepgramApiKey = null;
          livekitSource = "unavailable";
          deepgramSource = "unavailable";
        }
      }
    } else if (!canUseSystemKeys) {
      livekitUrl = null;
      livekitApiKey = null;
      livekitApiSecret = null;
      deepgramApiKey = null;
      livekitSource = "unavailable";
      deepgramSource = "unavailable";
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
