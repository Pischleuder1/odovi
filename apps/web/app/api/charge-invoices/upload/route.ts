import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORT_DIR = "/data/invoice-import";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

type UploadResult = {
  originalName: string;
  storedName: string;
  size: number;
  type: "pdf" | "zip";
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "no_files" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ ok: false, error: "too_many_files", maxFiles: MAX_FILES }, { status: 400 });
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ ok: false, error: "total_too_large", maxTotalBytes: MAX_TOTAL_BYTES }, { status: 413 });
    }

    await mkdir(IMPORT_DIR, { recursive: true });
    const uploaded: UploadResult[] = [];

    for (const file of files) {
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { ok: false, error: "file_too_large", file: file.name, maxFileBytes: MAX_FILE_BYTES },
          { status: 413 },
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const detected = detectType(bytes);
      if (detected == null) {
        return NextResponse.json({ ok: false, error: "unsupported_file", file: file.name }, { status: 415 });
      }

      const extension = detected === "pdf" ? ".pdf" : ".zip";
      const safeBase = safeFilename(path.parse(file.name).name).slice(0, 90) || "tesla-invoice";
      const storedName = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeBase}_${randomUUID().slice(0, 8)}${extension}`;
      const target = path.join(IMPORT_DIR, storedName);

      await writeFile(target, bytes, { flag: "wx", mode: 0o640 });
      uploaded.push({ originalName: file.name, storedName, size: file.size, type: detected });
    }

    return NextResponse.json({
      ok: true,
      uploaded,
      message: "queued",
    });
  } catch (error) {
    console.error("[invoice-upload] upload failed", error);
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
}

function detectType(bytes: Buffer): "pdf" | "zip" | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return "pdf";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  ) {
    return "zip";
  }
  return null;
}

function safeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/_+/g, "_");
}
