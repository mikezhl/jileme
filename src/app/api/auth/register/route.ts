import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  createSession,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  setSessionCookie,
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  consumeEmailVerificationCode,
  normalizeVerificationCode,
  validateVerificationCode,
} from "@/lib/email-verification";

type RegisterRequest = {
  email?: string;
  username?: string;
  verificationCode?: string;
  password?: string;
};

function getUniqueField(error: Prisma.PrismaClientKnownRequestError) {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.find((value): value is string => typeof value === "string") ?? null;
  }
  if (typeof target === "string") {
    return target;
  }
  return null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterRequest;
    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username);
    const verificationCode = normalizeVerificationCode(body.verificationCode);
    const password = body.password?.trim() ?? "";

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    const verificationCodeError = validateVerificationCode(verificationCode);
    if (verificationCodeError) {
      return NextResponse.json({ error: verificationCodeError }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (tx) => {
      const verification = await consumeEmailVerificationCode(tx, {
        code: verificationCode,
        email,
        purpose: "register",
      });

      if (!verification.ok) {
        return { user: null, verification };
      }

      const user = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
        },
      });

      return { user, verification };
    });

    if (!result.user) {
      const message =
        result.verification.reason === "attempts_exhausted"
          ? "verification code failed too many times, please request a new code"
          : "invalid or expired verification code";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { token, expiresAt } = await createSession(result.user.id);
    const response = NextResponse.json({
      user: {
        email: result.user.email,
        id: result.user.id,
        username: result.user.username,
      },
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = getUniqueField(error);
      return NextResponse.json(
        { error: target === "email" ? "email already exists" : "username already exists" },
        { status: 409 },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to register";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
