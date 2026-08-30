"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileArchive, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "../../../../components/ui/Button";

type Labels = {
  title: string;
  hint: string;
  drop: string;
  choose: string;
  supported: string;
  upload: string;
  uploading: string;
  success: string;
  queued: string;
  invalid: string;
  tooLarge: string;
  failed: string;
  selected: string;
  clear: string;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 20;

export function InvoiceUpload({ labels }: { labels: Labels }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted = Array.from(incoming)
      .filter((file) => /\.(pdf|zip)$/i.test(file.name))
      .filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES);
    setFiles((current) => {
      const merged = [...current];
      for (const file of accepted) {
        if (!merged.some((entry) => entry.name === file.name && entry.size === file.size && entry.lastModified === file.lastModified)) {
          merged.push(file);
        }
      }
      return merged.slice(0, MAX_FILES);
    });
    setResult(null);
  }, []);

  async function uploadFiles() {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/charge-invoices/upload", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; uploaded?: unknown[]; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "upload_failed");
      const count = Array.isArray(payload.uploaded) ? payload.uploaded.length : files.length;
      setResult({ kind: "success", text: `${labels.success} ${count}. ${labels.queued}` });
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
      // The worker normally runs once per sync interval. Refresh again so a quick import becomes visible.
      window.setTimeout(() => router.refresh(), 5_000);
      window.setTimeout(() => router.refresh(), 20_000);
      window.setTimeout(() => router.refresh(), 60_000);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "upload_failed";
      const text = reason === "unsupported_file" ? labels.invalid : reason === "file_too_large" ? labels.tooLarge : labels.failed;
      setResult({ kind: "error", text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-100 p-2 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <Upload aria-hidden size={20} />
        </div>
        <div>
          <h2 className="font-medium">{labels.title}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{labels.hint}</p>
        </div>
      </div>

      <div
        className={`mt-4 rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging
            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
            : "border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950/40"
        }`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <div className="mx-auto flex w-fit items-center gap-2 text-neutral-400">
          <FileText aria-hidden size={24} />
          <FileArchive aria-hidden size={24} />
        </div>
        <p className="mt-3 text-sm font-medium">{labels.drop}</p>
        <p className="mt-1 text-xs text-neutral-500">{labels.supported}</p>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".pdf,.zip,application/pdf,application/zip"
          multiple
          onChange={(event) => event.target.files && addFiles(event.target.files)}
        />
        <button type="button" className={buttonClasses("secondary", "sm", "mt-4")} onClick={() => inputRef.current?.click()}>
          {labels.choose}
        </button>
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-neutral-500">{labels.selected}: {files.length}</p>
            <button type="button" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100" onClick={() => setFiles([])}>
              {labels.clear}
            </button>
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-lg border border-neutral-200 p-2 text-xs dark:border-neutral-800">
            {files.map((file) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3">
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-neutral-400">{formatBytes(file.size)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className={buttonClasses("primary", "md")} disabled={busy} onClick={uploadFiles}>
              {busy ? <Loader2 aria-hidden size={17} className="animate-spin" /> : <Upload aria-hidden size={17} />}
              {busy ? labels.uploading : labels.upload}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${result.kind === "success" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
          {result.kind === "success" ? <CheckCircle2 aria-hidden size={18} className="mt-0.5 shrink-0" /> : <XCircle aria-hidden size={18} className="mt-0.5 shrink-0" />}
          <span>{result.text}</span>
        </div>
      )}
    </section>
  );
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
