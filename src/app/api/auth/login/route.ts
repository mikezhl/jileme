import { NextResponse } from "next/server";

import {
  createSession,
  normalizeUsername,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LoginRequest = {
  username?: string;
  password?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequest;
    const username = normalizeUsername(body.username);
    const password = body.password?.trim() ?? "";

    if (!username || !password) {
      return NextResponse.json({ error: "username and password are required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
    }

    const matched = await verifyPassword(password, user.passwordHash);
    if (!matched) {
      return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
    }

    const { token, expiresAt } = await createSession(user.id);
    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
      },
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to login";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
