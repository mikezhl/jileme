import crypto from "node:crypto";

import { requireEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const EMAIL_SEND_RATE_LIMIT_SECONDS = 60;

export class EmailSendRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`please wait ${retryAfterSeconds} seconds before requesting another email`);
    this.name = "EmailSendRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const directIpHeaders = [
    "x-real-ip",
    "cf-connecting-ip",
    "fly-client-ip",
    "x-vercel-forwarded-for",
  ];

  for (const header of directIpHeaders) {
    const value = request.headers.get(header)?.trim();
    if (value) {
      return value;
    }
  }

  return "unknown";
}

function hashIp(ip: string) {
  const secret = requireEnv("APP_ENCRYPTION_SECRET");
  return crypto.createHmac("sha256", secret).update(ip).digest("hex");
}

export async function reserveEmailSendIpRateLimit(request: Request) {
  const ipHash = hashIp(getRequestIp(request));

  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ipHash}))`;

    const now = new Date();
    const latestAttempt = await tx.emailVerificationSendAttempt.findFirst({
      where: {
        createdAt: {
          gt: new Date(now.getTime() - EMAIL_SEND_RATE_LIMIT_SECONDS * 1000),
        },
        ipHash,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    });

    if (latestAttempt) {
      const retryAfterSeconds = Math.ceil(
        (latestAttempt.createdAt.getTime() + EMAIL_SEND_RATE_LIMIT_SECONDS * 1000 - now.getTime()) / 1000,
      );
      throw new EmailSendRateLimitError(Math.max(1, retryAfterSeconds));
    }

    return tx.emailVerificationSendAttempt.create({
      data: {
        ipHash,
      },
    });
  });

  return {
    attemptId: attempt.id,
    retryAfterSeconds: EMAIL_SEND_RATE_LIMIT_SECONDS,
  };
}

export async function releaseEmailSendIpRateLimit(attemptId: string) {
  await prisma.emailVerificationSendAttempt.deleteMany({
    where: {
      id: attemptId,
    },
  });
}
