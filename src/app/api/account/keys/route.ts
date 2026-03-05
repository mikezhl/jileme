import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth-guard";
import { getUserKeyStatus, upsertUserKeys } from "@/lib/provider-keys";

type SaveKeysRequest = {
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  deepgramApiKey?: string;
  clear?: boolean;
};

export const runtime = "nodejs";

function isBlank(value?: string | null) {
  return !value || value.trim().length === 0;
}

export async function GET() {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const status = await getUserKeyStatus(user.id);
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load key settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, unauthorizedResponse } = await requireApiUser();
    if (!user) {
      return unauthorizedResponse!;
    }

    const body = (await request.json()) as SaveKeysRequest;
    const clearRequested =
      body.clear === true ||
      (isBlank(body.livekitUrl) &&
        isBlank(body.livekitApiKey) &&
        isBlank(body.livekitApiSecret) &&
        isBlank(body.deepgramApiKey));

    const status = clearRequested
      ? await upsertUserKeys(user.id, null)
      : await upsertUserKeys(user.id, {
          livekitUrl: body.livekitUrl,
          livekitApiKey: body.livekitApiKey?.trim() ?? "",
          livekitApiSecret: body.livekitApiSecret?.trim() ?? "",
          deepgramApiKey: body.deepgramApiKey?.trim() ?? "",
        });

    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save key settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
