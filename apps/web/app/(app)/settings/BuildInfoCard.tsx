import React from "react";
import type { BuildInfo } from "@odovi/core";
import { CopyBuildIdentity } from "./CopyBuildIdentity";

export const SUPPORT_URL = "https://github.com/jsc2304/odovi/issues";
export const SECURITY_URL =
  "https://github.com/jsc2304/odovi/security/advisories/new";

export interface BuildInfoLabels {
  title: string;
  version: string;
  build: string;
  copy: string;
  copied: string;
  supportTitle: string;
  supportDescription: string;
  supportLink: string;
  securityTitle: string;
  securityDescription: string;
  securityLink: string;
}

export function BuildInfoCard({
  buildInfo,
  labels,
}: {
  buildInfo: BuildInfo;
  labels: BuildInfoLabels;
}) {
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {labels.title}
      </h2>

      <dl
        data-testid="release-identity"
        className="mt-3 grid gap-2 text-sm sm:grid-cols-2"
      >
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-400">
            {labels.version}
          </dt>
          <dd className="font-mono font-medium tabular-nums">
            {buildInfo.version}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-400">
            {labels.build}
          </dt>
          <dd className="font-mono font-medium tabular-nums">
            {buildInfo.commit}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <CopyBuildIdentity
          identity={buildInfo.identity}
          copyLabel={labels.copy}
          copiedLabel={labels.copied}
        />
      </div>

      <div className="mt-5 grid gap-4 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800 sm:grid-cols-2">
        <div>
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            {labels.supportTitle}
          </h3>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            {labels.supportDescription}
          </p>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-9 items-center text-violet-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:text-violet-300"
          >
            {labels.supportLink}
          </a>
        </div>
        <div>
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            {labels.securityTitle}
          </h3>
          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
            {labels.securityDescription}
          </p>
          <a
            href={SECURITY_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-9 items-center text-violet-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:text-violet-300"
          >
            {labels.securityLink}
          </a>
        </div>
      </div>
    </section>
  );
}
