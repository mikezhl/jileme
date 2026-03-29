import { NextResponse } from "next/server";

import {
  getCurrentUser,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ChangePasswordRequest = {
  currentPassword?: string;
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
    const newPassword = body.newPassword?.trim() ?? "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "current password and new password are required" }, { status: 400 });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const matched = await verifyPassword(currentPassword, user.passwordHash);
    if (!matched) {
      return NextResponse.json({ error: "current password is incorrect" }, { status: 401 });
    }

    const nextPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextPasswordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change password";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
