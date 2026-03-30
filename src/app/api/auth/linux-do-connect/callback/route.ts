import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  createSession,
  hashPassword,
  normalizeUsername,
  setSessionCookie,
  validateUsername,
} from "@/lib/auth";
import { getLinuxDoConnectConfig } from "@/lib/env";
import {
  buildLinuxDoConnectVirtualEmail,
  type LinuxDoConnectMode,
  type LinuxDoConnectTokenResponse,
  type LinuxDoConnectUserResponse,
  LINUX_DO_CONNECT_MODE_COOKIE_NAME,
  LINUX_DO_CONNECT_NEXT_COOKIE_NAME,
  LINUX_DO_CONNECT_STATE_COOKIE_NAME,
  LINUX_DO_CONNECT_TOKEN_URL,
  LINUX_DO_CONNECT_USER_URL,
  normalizeLinuxDoConnectMode,
  normalizeLinuxDoConnectNextPath,
} from "@/lib/linux-do-connect";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clearAuthCookies(response: NextResponse) {
  response.cookies.set({
    name: LINUX_DO_CONNECT_STATE_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  response.cookies.set({
    name: LINUX_DO_CONNECT_NEXT_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  response.cookies.set({
    name: LINUX_DO_CONNECT_MODE_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function buildAppRedirect(requestUrl: string, nextPath: string | null) {
  const target = new URL("/", requestUrl);
  if (nextPath) {
    target.searchParams.set("next", nextPath);
  }
  return target;
}

function buildSuccessRedirect(requestUrl: string, nextPath: string | null) {
  if (nextPath) {
    return new URL(nextPath, requestUrl);
  }

  return new URL("/", requestUrl);
}

function buildErrorRedirect(requestUrl: string, mode: LinuxDoConnectMode, nextPath: string | null, error: string) {
  const target = buildAppRedirect(requestUrl, nextPath);
  target.searchParams.set("auth", mode);
  target.searchParams.set("error", error);
  return target;
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function exchangeAccessToken(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(LINUX_DO_CONNECT_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
    cache: "no-store",
  });
  const payload = await readJsonSafely<LinuxDoConnectTokenResponse>(response);

  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description ?? payload?.error ?? "Failed to exchange Linux DO Connect token";
    throw new Error(message);
  }

  return payload.access_token;
}

async function fetchLinuxDoUser(accessToken: string) {
  const response = await fetch(LINUX_DO_CONNECT_USER_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const payload = await readJsonSafely<LinuxDoConnectUserResponse>(response);

  if (!response.ok || !payload?.id || !payload.username) {
    throw new Error("Failed to fetch Linux DO Connect user");
  }

  return payload;
}

function normalizeLinuxDoUsernameBase(username?: string | null) {
  const normalized = normalizeUsername(username);
  const sanitized = normalized
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const truncated = sanitized.slice(0, 32).replace(/_+$/g, "");

  if (truncated.length >= 3) {
    return truncated;
  }

  return "linuxdo";
}

async function resolveUniqueLinuxDoUsername(
  tx: Prisma.TransactionClient,
  preferredUsername: string,
  linuxDoUserId: string | number,
  currentUserId?: string,
) {
  const preferredError = validateUsername(preferredUsername);
  if (!preferredError) {
    const usernameOwner = await tx.user.findUnique({
      where: { username: preferredUsername },
      select: { id: true },
    });

    if (!usernameOwner || usernameOwner.id === currentUserId) {
      return preferredUsername;
    }
  }

  const normalizedId = String(linuxDoUserId).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const suffixCandidates = [
    normalizedId.slice(-4),
    normalizedId.slice(-6),
    normalizedId.slice(-8),
    normalizedId,
    crypto.randomBytes(3).toString("hex"),
    crypto.randomBytes(4).toString("hex"),
  ].filter((value, index, all): value is string => value.length > 0 && all.indexOf(value) === index);

  for (const suffix of suffixCandidates) {
    const maxStemLength = Math.max(1, 32 - suffix.length - 1);
    const stem = preferredUsername.slice(0, maxStemLength).replace(/_+$/g, "") || "u";
    const candidate = `${stem}_${suffix}`;
    const candidateError = validateUsername(candidate);
    if (candidateError) {
      continue;
    }

    const usernameOwner = await tx.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });

    if (!usernameOwner || usernameOwner.id === currentUserId) {
      return candidate;
    }
  }

  throw new Error("Failed to allocate a local username for Linux Do Connect user");
}

async function resolveLocalUser(profile: LinuxDoConnectUserResponse) {
  const preferredUsername = normalizeLinuxDoUsernameBase(profile.username);
  const virtualEmail = buildLinuxDoConnectVirtualEmail(profile.id!);

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: virtualEmail },
    });

    if (!existingUser) {
      const username = await resolveUniqueLinuxDoUsername(tx, preferredUsername, profile.id!);

      return tx.user.create({
        data: {
          email: virtualEmail,
          passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
          username,
        },
      });
    }

    const nextUsername = await resolveUniqueLinuxDoUsername(
      tx,
      preferredUsername,
      profile.id!,
      existingUser.id,
    );

    if (existingUser.username === nextUsername) {
      return existingUser;
    }

    return tx.user.update({
      where: { id: existingUser.id },
      data: { username: nextUsername },
    });
  });
}

export async function GET(request: Request) {
  const config = getLinuxDoConnectConfig();
  const cookieStore = await cookies();
  const mode = normalizeLinuxDoConnectMode(cookieStore.get(LINUX_DO_CONNECT_MODE_COOKIE_NAME)?.value);
  const nextPath = normalizeLinuxDoConnectNextPath(cookieStore.get(LINUX_DO_CONNECT_NEXT_COOKIE_NAME)?.value);
  const url = new URL(request.url);
  const responseError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (!config) {
    const response = NextResponse.redirect(
      buildErrorRedirect(request.url, mode, nextPath, "LINUX DO Connect is not configured"),
    );
    clearAuthCookies(response);
    return response;
  }

  if (responseError) {
    const response = NextResponse.redirect(buildErrorRedirect(request.url, mode, nextPath, responseError));
    clearAuthCookies(response);
    return response;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieStore.get(LINUX_DO_CONNECT_STATE_COOKIE_NAME)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(
      buildErrorRedirect(request.url, mode, nextPath, "Linux DO Connect state validation failed"),
    );
    clearAuthCookies(response);
    return response;
  }

  try {
    const accessToken = await exchangeAccessToken(
      code,
      config.redirectUri,
      config.clientId,
      config.clientSecret,
    );
    const profile = await fetchLinuxDoUser(accessToken);
    const user = await resolveLocalUser(profile);
    const { token, expiresAt } = await createSession(user.id);
    const response = NextResponse.redirect(buildSuccessRedirect(request.url, nextPath));

    clearAuthCookies(response);
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sign in with Linux DO Connect";
    const response = NextResponse.redirect(buildErrorRedirect(request.url, mode, nextPath, message));
    clearAuthCookies(response);
    return response;
  }
}
