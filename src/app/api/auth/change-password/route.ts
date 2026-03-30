import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  getCurrentUser,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";
import {
  consumeEmailVerificationCode,
  normalizeVerificationCode,
  validateVerificationCode,
} from "@/lib/email-verification";
import { isLinuxDoConnectVirtualEmail } from "@/lib/linux-do-connect";
import { prisma } from "@/lib/prisma";

type ChangePasswordRequest = {
  currentPassword?: string;
  verificationCode?: string;
  newPassword?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ChangePasswordRequest;
    const currentPassword = body.currentPassword?.trim() ?? "";
    const verificationCode = normalizeVerificationCode(body.verificationCode);
    const newPassword = body.newPassword?.trim() ?? "";
    const canResetByEmail = Boolean(user.email) && !isLinuxDoConnectVirtualEmail(user.email);

    if (isLinuxDoConnectVirtualEmail(user.email)) {
      return NextResponse.json(
        { error: "linux do connect accounts can only sign in via connect login" },
        { status: 400 },
      );
    }

    if (!newPassword) {
      return NextResponse.json({ error: "new password is required" }, { status: 400 });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    if (!canResetByEmail) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "current password is required for legacy accounts without email" },
          { status: 400 },
        );
      }

      const matched = await verifyPassword(currentPassword, user.passwordHash);
      if (!matched) {
        return NextResponse.json({ error: "current password is incorrect" }, { status: 401 });
      }

      const nextPasswordHash = await hashPassword(newPassword);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: nextPasswordHash },
        });
        await tx.session.deleteMany({
          where: { userId: user.id },
        });
      });

      const response = NextResponse.json({ ok: true });
      clearSessionCookie(response);
      return response;
    }

    const verificationCodeError = validateVerificationCode(verificationCode);
    if (verificationCodeError) {
      return NextResponse.json({ error: verificationCodeError }, { status: 400 });
    }

    const nextPasswordHash = await hashPassword(newPassword);
    const result = await prisma.$transaction(async (tx) => {
      const verification = await consumeEmailVerificationCode(tx, {
        code: verificationCode,
        email: user.email!,
        purpose: "change-password",
      });

      if (!verification.ok) {
        return verification;
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: nextPasswordHash },
      });
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      const message =
        result.reason === "attempts_exhausted"
          ? "verification code failed too many times, please request a new code"
          : "invalid or expired verification code";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change password";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
