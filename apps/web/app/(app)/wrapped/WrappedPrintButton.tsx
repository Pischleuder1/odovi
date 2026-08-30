"use client";

import { Printer } from "lucide-react";

export function WrappedPrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 print:hidden"
    >
      <Printer aria-hidden size={16} />
      {label}
    </button>
  );
}
