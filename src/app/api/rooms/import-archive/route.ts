import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import {
  importArchiveRoomFromDebateRecord,
  parseDebateRecordJson,
} from "@/lib/archive-room-import";

export const runtime = "nodejs";

const MAX_RECORD_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const formData = await request.formData();
    const recordFile = formData.get("record");
    const sourceUrl = formData.get("sourceUrl");
    if (!(recordFile instanceof File)) {
      return NextResponse.json({ error: "record file is required" }, { status: 400 });
    }
    if (typeof sourceUrl !== "string" || sourceUrl.trim().length === 0) {
      return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
    }

    if (recordFile.size <= 0) {
      return NextResponse.json({ error: "record file is empty" }, { status: 400 });
    }

    if (recordFile.size > MAX_RECORD_FILE_BYTES) {
      return NextResponse.json(
        { error: `record file must be <= ${MAX_RECORD_FILE_BYTES} bytes` },
        { status: 413 },
      );
    }

    const record = parseDebateRecordJson(await recordFile.text());
    const room = await importArchiveRoomFromDebateRecord({
      record,
      createdByUserId: user.id,
      sourceUrl,
    });

    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import archive room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
