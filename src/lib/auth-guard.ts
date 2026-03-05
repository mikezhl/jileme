import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      unauthorizedResponse: NextResponse.json({ error: "authentication required" }, { status: 401 }),
    };
  }

  return {
    user,
    unauthorizedResponse: null,
  };
}
