"use client";

import React, { useState } from "react";

export function CopyBuildIdentity({
  identity,
  copyLabel,
  copiedLabel,
}: {
  identity: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyIdentity() {
    await navigator.clipboard.writeText(identity);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <button
      type="button"
      onClick={() => void copyIdentity()}
      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}
