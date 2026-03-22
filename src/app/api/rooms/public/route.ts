import { NextResponse } from "next/server";

import { getPublicRoomsPage } from "@/lib/public-rooms";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page");
    const payload = await getPublicRoomsPage(page);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch public rooms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
