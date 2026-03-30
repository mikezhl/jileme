import { NextResponse } from "next/server";

import { getCurrentUser, normalizeEmail, validateEmail } from "@/lib/auth";
import {
  EmailVerificationRateLimitError,
  issueEmailVerificationCode,
  type VerificationCodePurpose,
} from "@/lib/email-verification";
import {
  EmailSendRateLimitError,
  releaseEmailSendIpRateLimit,
  reserveEmailSendIpRateLimit,
} from "@/lib/email-send-rate-limit";
import { isLinuxDoConnectVirtualEmail } from "@/lib/linux-do-connect";
import { prisma } from "@/lib/prisma";

type SendEmailCodeRequest = {
  email?: string;
  purpose?: VerificationCodePurpose;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  let reservedAttemptId: string | null = null;

  try {
    const body = (await request.json()) as SendEmailCodeRequest;
    const ipReservation = await reserveEmailSendIpRateLimit(request);
    reservedAttemptId = ipReservation.attemptId;
    const purpose = body.purpose;

    if (purpose !== "register" && purpose !== "change-password") {
      await releaseEmailSendIpRateLimit(ipReservation.attemptId);
      reservedAttemptId = null;
      return NextResponse.json({ error: "invalid verification code purpose" }, { status: 400 });
    }

    if (purpose === "register") {
      const email = normalizeEmail(body.email);
      const emailError = validateEmail(email);
      if (emailError) {
        await releaseEmailSendIpRateLimit(ipReservation.attemptId);
        reservedAttemptId = null;
        return NextResponse.json({ error: emailError }, { status: 400 });
      }

      if (isLinuxDoConnectVirtualEmail(email)) {
        await releaseEmailSendIpRateLimit(ipReservation.attemptId);
        reservedAttemptId = null;
        return NextResponse.json(
          { error: "linux do connect reserved email domain is not allowed" },
          { status: 400 },
        );
      }

      const existingUser = await prisma.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });
      if (existingUser) {
        await releaseEmailSendIpRateLimit(ipReservation.attemptId);
        reservedAttemptId = null;
        return NextResponse.json({ error: "email already exists" }, { status: 409 });
      }

      try {
        const result = await issueEmailVerificationCode({
          email,
          purpose,
        });

        return NextResponse.json({
          ok: true,
          expiresAt: result.expiresAt.toISOString(),
          retryAfterSeconds: Math.max(ipReservation.retryAfterSeconds, result.resendSeconds),
          targetEmail: result.maskedEmail,
        });
      } catch (error) {
        await releaseEmailSendIpRateLimit(ipReservation.attemptId);
        reservedAttemptId = null;
        throw error;
      }
    }

    const user = await getCurrentUser();
    if (!user) {
      await releaseEmailSendIpRateLimit(ipReservation.attemptId);
      reservedAttemptId = null;
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!user.email) {
      await releaseEmailSendIpRateLimit(ipReservation.attemptId);
      reservedAttemptId = null;
      return NextResponse.json(
        { error: "current account has no email. legacy accounts must use current password to change password" },
        { status: 400 },
      );
    }

    if (isLinuxDoConnectVirtualEmail(user.email)) {
      await releaseEmailSendIpRateLimit(ipReservation.attemptId);
      reservedAttemptId = null;
      return NextResponse.json(
        { error: "linux do connect accounts can only sign in via connect login" },
        { status: 400 },
      );
    }

    try {
      const result = await issueEmailVerificationCode({
        email: user.email,
        purpose,
      });

      return NextResponse.json({
        ok: true,
        expiresAt: result.expiresAt.toISOString(),
        retryAfterSeconds: Math.max(ipReservation.retryAfterSeconds, result.resendSeconds),
        targetEmail: result.maskedEmail,
      });
    } catch (error) {
      await releaseEmailSendIpRateLimit(ipReservation.attemptId);
      reservedAttemptId = null;
      throw error;
    }
  } catch (error) {
    if (error instanceof EmailSendRateLimitError || error instanceof EmailVerificationRateLimitError) {
      return NextResponse.json(
        { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
        { status: 429 },
      );
    }

    if (reservedAttemptId) {
      await releaseEmailSendIpRateLimit(reservedAttemptId);
    }

    const message = error instanceof Error ? error.message : "Failed to send verification code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
