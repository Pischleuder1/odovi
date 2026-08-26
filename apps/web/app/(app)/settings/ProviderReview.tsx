"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ProviderMode } from "@odovi/core";
import type { ProviderReviewItem } from "../../../lib/locationProviders/policy";
import {
  updateLocationProviderDecision,
  type ProviderDecisionActionState,
} from "../../../lib/actions/locationProviders";

const INITIAL_STATE: ProviderDecisionActionState = { ok: false };

function ProviderCapabilityForm({ item }: { item: ProviderReviewItem }) {
  const t = useTranslations("settings.providerReview");
  const [mode, setMode] = useState<ProviderMode>(item.decision?.mode ?? "disabled");
  const [state, action, pending] = useActionState(
    updateLocationProviderDecision,
    INITIAL_STATE,
  );

  return (
    <article className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            {t(`capabilities.${item.capability}.name`)}
          </h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {t(`capabilities.${item.capability}.experience`)}
          </p>
        </div>
        <span
          data-testid={item.status === "disabled" ? "provider-disabled" : undefined}
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            item.status === "active"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          }`}
        >
          {item.status === "active"
            ? t("status.active")
            : item.requiresReview
              ? t("status.reviewRequired")
              : t("status.disabled")}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">{t("fields.purpose")}</dt>
          <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
            {t(`capabilities.${item.capability}.purpose`)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t("fields.transmittedData")}</dt>
          <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
            {t(`capabilities.${item.capability}.data`)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t("fields.publicProvider")}</dt>
          <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
            {item.publicProvider.name} ·{" "}
            <a
              className="underline underline-offset-2"
              href={item.publicProvider.contactUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("fields.contactPath")}
            </a>
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t("fields.operatingLimits")}</dt>
          <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
            {t(`capabilities.${item.capability}.limits`)}
          </dd>
        </div>
      </dl>

      {item.issues.length > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("invalidStoredConfiguration")}: {item.issues.join("; ")}
        </p>
      )}

      <form action={action} className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <input type="hidden" name="capability" value={item.capability} />
        <label className="block text-sm font-medium" htmlFor={`${item.capability}-mode`}>
          {t("fields.mode")}
        </label>
        <select
          id={`${item.capability}-mode`}
          name="mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as ProviderMode)}
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="disabled">{t("modes.disabled")}</option>
          <option value="public">{t("modes.public", { provider: item.publicProvider.name })}</option>
          <option value="custom">{t("modes.custom")}</option>
        </select>

        {mode === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium">{t("fields.providerName")}</span>
              <input
                name="providerName"
                defaultValue={item.decision?.mode === "custom" ? item.decision.provider : ""}
                required
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">{t("fields.endpoint")}</span>
              <input
                name="endpoint"
                type="url"
                defaultValue={item.decision?.endpoint ?? ""}
                required
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">{t("fields.contactUrl")}</span>
              <input
                name="customContactUrl"
                type="url"
                defaultValue={item.decision?.customContactUrl ?? ""}
                required
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">{t("fields.credentialHeader")}</span>
              <input
                name="credentialHeader"
                defaultValue={item.decision?.credentialHeader ?? ""}
                placeholder="Authorization"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
              <span className="mt-1 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                {t("credentialHint", { variable: item.credentialEnvironment })}
              </span>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-medium">{t("fields.customLimits")}</span>
              <textarea
                name="customOperatingLimits"
                defaultValue={item.decision?.customOperatingLimits ?? ""}
                required
                rows={3}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? t("saving") : t("saveDecision")}
          </button>
          {state.ok && <span className="text-sm text-emerald-700 dark:text-emerald-300">{t("saved")}</span>}
          {state.error && <span className="text-sm text-red-700 dark:text-red-300">{state.error}</span>}
        </div>
      </form>

      {item.decision && (
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {t("decisionEvidence", {
            version: item.decision.disclosureVersion,
            time: item.decision.decidedAt.replace("T", " ").replace(".000Z", " UTC"),
            actor: item.decision.decidedBy,
          })}
        </p>
      )}
    </article>
  );
}

export function ProviderReview({ items }: { items: ProviderReviewItem[] }) {
  const t = useTranslations("settings.providerReview");
  return (
    <section id="provider-review" className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t("title")}</h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{t("description")}</p>
      <div className="mt-4 grid gap-4">{items.map((item) => <ProviderCapabilityForm key={item.capability} item={item} />)}</div>
    </section>
  );
}
