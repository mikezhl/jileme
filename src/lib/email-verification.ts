import crypto from "node:crypto";

import { EmailVerificationPurpose, type Prisma } from "@prisma/client";

import { getAuthEmailCodeResendSeconds, getAuthEmailCodeTtlMinutes, requireEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sendSmtpEmail } from "@/lib/smtp";

export type VerificationCodePurpose = "register" | "change-password";
export const EMAIL_VERIFICATION_MAX_FAILED_ATTEMPTS = 3;

export type ConsumeEmailVerificationCodeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "attempts_exhausted" | "invalid" | "invalid_or_expired";
    };

const PURPOSE_MAP: Record<VerificationCodePurpose, EmailVerificationPurpose> = {
  register: EmailVerificationPurpose.REGISTER,
  "change-password": EmailVerificationPurpose.CHANGE_PASSWORD,
};

function toPrismaPurpose(purpose: VerificationCodePurpose) {
  return PURPOSE_MAP[purpose];
}

export class EmailVerificationRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`please wait ${retryAfterSeconds} seconds before requesting another code`);
    this.name = "EmailVerificationRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function acquireEmailVerificationLock(tx: Prisma.TransactionClient, email: string, purpose: VerificationCodePurpose) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}), hashtext(${purpose}))`;
}

function hashVerificationCode(email: string, purpose: VerificationCodePurpose, code: string) {
  const secret = requireEnv("APP_ENCRYPTION_SECRET");
  return crypto.createHmac("sha256", secret).update(`${email}:${purpose}:${code}`).digest("hex");
}

function buildCodeEmailContent(code: string, ttlMinutes: number) {
  const subject = "Logicly Chat";
  const text = [`Your verification code is ${code}.`, `It expires in ${ttlMinutes} minutes.`].join("\n");
  const html = [
    '<div style="font-family:Arial,\'Helvetica Neue\',sans-serif;color:#202123;line-height:1.6">',
    '<p style="margin:0 0 16px;color:#6e6e80">Your verification code</p>',
    `<p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
    `<p style="margin:0;color:#6e6e80">Expires in ${ttlMinutes} minutes.</p>`,
    '</div>',
  ].join("");

  return { html, subject, text };
}

export function normalizeVerificationCode(input?: string | null) {
  return input?.trim() ?? "";
}

export function validateVerificationCode(code: string) {
  if (!/^\d{4}$/.test(code)) {
    return "verification code must be 4 digits";
  }
  return null;
}

export function maskEmail(email: string) {
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) {
    return email;
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= 2) {
    return `${local[0] ?? ""}*${domain}`;
  }

  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}${domain}`;
}

export async function issueEmailVerificationCode({
  email,
  purpose,
}: {
  email: string;
  purpose: VerificationCodePurpose;
}) {
  const resendSeconds = getAuthEmailCodeResendSeconds();
  const ttlMinutes = getAuthEmailCodeTtlMinutes();
  let code = "";
  let createdCodeId = "";
  let expiresAt = new Date(0);

  await prisma.$transaction(async (tx) => {
    // Serialize issuance per email+purpose so resend checks and code rotation stay consistent under concurrency.
    await acquireEmailVerificationLock(tx, email, purpose);
    const now = new Date();

    const latestCode = await tx.emailVerificationCode.findFirst({
      where: {
        consumedAt: null,
        email,
        expiresAt: {
          gt: now,
        },
        purpose: toPrismaPurpose(purpose),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    });

    if (latestCode) {
      const nextAvailableAt = latestCode.createdAt.getTime() + resendSeconds * 1000;
      if (nextAvailableAt > now.getTime()) {
        const remainingSeconds = Math.ceil((nextAvailableAt - now.getTime()) / 1000);
        throw new EmailVerificationRateLimitError(remainingSeconds);
      }
    }

    code = crypto.randomInt(1_000, 10_000).toString();
    expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    await tx.emailVerificationCode.deleteMany({
      where: {
        email,
        purpose: toPrismaPurpose(purpose),
      },
    });
    const createdCode = await tx.emailVerificationCode.create({
      data: {
        codeHash: hashVerificationCode(email, purpose, code),
        email,
        expiresAt,
        purpose: toPrismaPurpose(purpose),
      },
    });
    createdCodeId = createdCode.id;
  });

  try {
    await sendSmtpEmail({
      ...buildCodeEmailContent(code, ttlMinutes),
      to: email,
    });
  } catch (error) {
    if (createdCodeId) {
      await prisma.emailVerificationCode.deleteMany({
        where: {
          id: createdCodeId,
          consumedAt: null,
        },
      });
    }
    throw error;
  }

  return {
    expiresAt,
    maskedEmail: maskEmail(email),
    resendSeconds,
  };
}

export async function consumeEmailVerificationCode(
  tx: Prisma.TransactionClient,
  {
    code,
    email,
    purpose,
  }: {
    code: string;
    email: string;
    purpose: VerificationCodePurpose;
  },
): Promise<ConsumeEmailVerificationCodeResult> {
  const now = new Date();
  await acquireEmailVerificationLock(tx, email, purpose);

  const currentCode = await tx.emailVerificationCode.findFirst({
    where: {
      consumedAt: null,
      email,
      purpose: toPrismaPurpose(purpose),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      codeHash: true,
      expiresAt: true,
      failedAttempts: true,
      id: true,
    },
  });

  if (!currentCode || currentCode.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  const providedCodeHash = hashVerificationCode(email, purpose, code);
  if (currentCode.codeHash !== providedCodeHash) {
    const failedAttempts = currentCode.failedAttempts + 1;
    await tx.emailVerificationCode.update({
      where: {
        id: currentCode.id,
      },
      data: {
        failedAttempts,
        ...(failedAttempts >= EMAIL_VERIFICATION_MAX_FAILED_ATTEMPTS ? { consumedAt: now } : {}),
      },
    });

    return {
      ok: false,
      reason: failedAttempts >= EMAIL_VERIFICATION_MAX_FAILED_ATTEMPTS ? "attempts_exhausted" : "invalid",
    };
  }

  await tx.emailVerificationCode.update({
    where: {
      id: currentCode.id,
    },
    data: {
      consumedAt: now,
    },
  });

  return { ok: true };
}
