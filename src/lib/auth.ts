import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { optionalEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "jileme_session";
const DEFAULT_SESSION_TTL_HOURS = 24 * 7;

function getSessionTtlHours() {
  const raw = optionalEnv("SESSION_TTL_HOURS");
  if (!raw) {
    return DEFAULT_SESSION_TTL_HOURS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 24 * 365) {
    return DEFAULT_SESSION_TTL_HOURS;
  }

  return parsed;
}

function getSessionExpiry() {
  return new Date(Date.now() + getSessionTtlHours() * 60 * 60 * 1000);
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function normalizeUsername(input?: string | null) {
  return input?.trim().toLowerCase() ?? "";
}

export function validateUsername(username: string) {
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    return "username must be 3-32 chars and contain only lowercase letters, numbers, or underscore";
  }
  return null;
}

export function validatePassword(password: string) {
  if (password.length < 6 || password.length > 72) {
    return "password must be between 6 and 72 characters";
  }
  return null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiry();

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    expires: expiresAt,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function invalidateSessionToken(rawToken: string) {
  await prisma.session.deleteMany({
    where: {
      tokenHash: hashSessionToken(rawToken),
    },
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(rawToken),
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({
      where: { id: session.id },
    });
    return null;
  }

  return session.user;
}
