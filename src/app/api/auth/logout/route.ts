import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { clearSessionCookie, invalidateSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (rawToken) {
      await invalidateSessionToken(rawToken);
    }

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to logout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
