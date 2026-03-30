import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser, normalizeUsername, validateUsername } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ChangeUsernameRequest = {
  username?: string;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ChangeUsernameRequest;
    const username = normalizeUsername(body.username);
    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    const updatedUser =
      username === user.username
        ? user
        : await prisma.user.update({
            where: { id: user.id },
            data: { username },
          });

    return NextResponse.json({
      user: {
        email: updatedUser.email,
        id: updatedUser.id,
        username: updatedUser.username,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "username already exists" }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Failed to change username";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
