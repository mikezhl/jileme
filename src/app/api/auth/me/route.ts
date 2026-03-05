import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get current user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
