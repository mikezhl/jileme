import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  createSession,
  hashPassword,
  normalizeUsername,
  setSessionCookie,
  validatePassword,
  validateUsername,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RegisterRequest = {
  username?: string;
  password?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterRequest;
    const username = normalizeUsername(body.username);
    const password = body.password?.trim() ?? "";

    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
      },
    });

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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "username already exists" }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Failed to register";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
