"use client";

import { useTranslations } from "next-intl";

/** Localized recovery surface for required-service failures in protected routes. */
export default function ApplicationError({ reset }: { reset: () => void }) {
  const t = useTranslations("ui.recovery");

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950 dark:text-neutral-50">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          {t("description")}
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-neutral-700 dark:text-neutral-200">
          <li>{t("database")}</li>
          <li>{t("migrations")}</li>
          <li>{t("logs")}</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-950"
          >
            {t("retry")}
          </button>
          <a
            href="/api/ready"
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
          >
            {t("status")}
          </a>
        </div>
      </section>
    </main>
  );
}
