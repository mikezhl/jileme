import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getLinuxDoConnectConfig } from "@/lib/env";
import {
  buildLinuxDoConnectAuthorizationUrl,
  LINUX_DO_CONNECT_COOKIE_MAX_AGE_SECONDS,
  LINUX_DO_CONNECT_MODE_COOKIE_NAME,
  LINUX_DO_CONNECT_NEXT_COOKIE_NAME,
  LINUX_DO_CONNECT_STATE_COOKIE_NAME,
  normalizeLinuxDoConnectMode,
  normalizeLinuxDoConnectNextPath,
} from "@/lib/linux-do-connect";

export const runtime = "nodejs";

function setAuthCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LINUX_DO_CONNECT_COOKIE_MAX_AGE_SECONDS,
  });
}

function buildErrorRedirect(requestUrl: string, mode: "login" | "register", nextPath: string | null, error: string) {
  const target = new URL("/", requestUrl);
  target.searchParams.set("auth", mode);
  target.searchParams.set("error", error);
  if (nextPath) {
    target.searchParams.set("next", nextPath);
  }
  return target;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = normalizeLinuxDoConnectMode(url.searchParams.get("mode"));
  const nextPath = normalizeLinuxDoConnectNextPath(url.searchParams.get("next"));
  const config = getLinuxDoConnectConfig();

  if (!config) {
    return NextResponse.redirect(
      buildErrorRedirect(request.url, mode, nextPath, "LINUX DO Connect is not configured"),
    );
  }

  const state = crypto.randomBytes(24).toString("hex");
  const authorizeUrl = buildLinuxDoConnectAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  });
  const response = NextResponse.redirect(authorizeUrl);

  setAuthCookie(response, LINUX_DO_CONNECT_STATE_COOKIE_NAME, state);
  setAuthCookie(response, LINUX_DO_CONNECT_MODE_COOKIE_NAME, mode);
  if (nextPath) {
    setAuthCookie(response, LINUX_DO_CONNECT_NEXT_COOKIE_NAME, nextPath);
  } else {
    response.cookies.delete(LINUX_DO_CONNECT_NEXT_COOKIE_NAME);
  }

  return response;
}
