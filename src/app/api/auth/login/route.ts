import { NextResponse } from "next/server";

import {
  createSession,
  normalizeEmail,
  normalizeUsername,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { isLinuxDoConnectVirtualEmail } from "@/lib/linux-do-connect";
import { prisma } from "@/lib/prisma";

type LoginRequest = {
  identifier?: string;
  username?: string;
  password?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequest;
    const identifier = body.identifier?.trim() ?? body.username?.trim() ?? "";
    const isEmailLogin = identifier.includes("@");
    const username = isEmailLogin ? "" : normalizeUsername(identifier);
    const email = isEmailLogin ? normalizeEmail(identifier) : "";
    const password = body.password?.trim() ?? "";

    if ((!username && !email) || !password) {
      return NextResponse.json({ error: "identifier and password are required" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: isEmailLogin ? { email } : { username },
    });

    if (!user) {
      return NextResponse.json({ error: "invalid username/email or password" }, { status: 401 });
    }

    if (isLinuxDoConnectVirtualEmail(user.email)) {
      return NextResponse.json({ error: "invalid username/email or password" }, { status: 401 });
    }

    const matched = await verifyPassword(password, user.passwordHash);
    if (!matched) {
      return NextResponse.json({ error: "invalid username/email or password" }, { status: 401 });
    }

    const { token, expiresAt } = await createSession(user.id);
    const response = NextResponse.json({
      user: {
        email: user.email,
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
