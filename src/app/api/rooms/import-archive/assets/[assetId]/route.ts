import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ASSET_MAP = {
  "news-value-test-txt": {
    absolutePath: path.join(process.cwd(), "data", "新闻价值与人伦道德谁更重要", "test.txt"),
    contentType: "text/plain; charset=utf-8",
    fileName: "news-value-test.txt",
  },
  "news-value-record-json": {
    absolutePath: path.join(process.cwd(), "data", "新闻价值与人伦道德谁更重要", "record.json"),
    contentType: "application/json; charset=utf-8",
    fileName: "news-value-record.json",
  },
  "debate-txt-normalization-spec": {
    absolutePath: path.join(process.cwd(), "docs", "debate-txt-normalization-spec.md"),
    contentType: "text/markdown; charset=utf-8",
    fileName: "debate-txt-normalization-spec.md",
  },
  "public-archive-room-import-spec": {
    absolutePath: path.join(process.cwd(), "docs", "public-archive-room-import-spec.md"),
    contentType: "text/markdown; charset=utf-8",
    fileName: "public-archive-room-import-spec.md",
  },
} as const;

type AssetId = keyof typeof ASSET_MAP;

function isAssetId(value: string): value is AssetId {
  return Object.prototype.hasOwnProperty.call(ASSET_MAP, value);
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      assetId: string;
    }>;
  },
) {
  const { assetId } = await context.params;
  if (!isAssetId(assetId)) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }

  const asset = ASSET_MAP[assetId];
  try {
    const file = await fs.readFile(asset.absolutePath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Disposition": `inline; filename="${asset.fileName}"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
}
