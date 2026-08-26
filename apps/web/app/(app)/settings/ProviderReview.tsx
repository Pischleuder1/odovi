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
  const initialMode = item.decision?.mode ?? "disabled";
  const [enabled, setEnabled] = useState(initialMode !== "disabled");
  const [providerMode, setProviderMode] = useState<Exclude<ProviderMode, "disabled">>(
    initialMode === "custom" ? "custom" : "public",
  );
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
        <input
          type="hidden"
          name="mode"
          value={enabled ? providerMode : "disabled"}
        />

        <label
          className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950"
          htmlFor={`${item.capability}-enabled`}
        >
          <input
            id={`${item.capability}-enabled`}
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
          />
          <span>
            <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {t("activation.enable")}
            </span>
            <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-400">
              {enabled ? t("activation.enabledHint") : t("activation.disabledHint")}
            </span>
          </span>
        </label>

        {enabled && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">{t("activation.chooseProvider")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label
                className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                  providerMode === "public"
                    ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                <input
                  type="radio"
                  name={`${item.capability}-provider-choice`}
                  value="public"
                  checked={providerMode === "public"}
                  onChange={() => setProviderMode("public")}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {t("activation.publicProvider", { provider: item.publicProvider.name })}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-400">
                    {t("activation.publicHint")}
                  </span>
                </span>
              </label>
              <label
                className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                  providerMode === "custom"
                    ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                <input
                  type="radio"
                  name={`${item.capability}-provider-choice`}
                  value="custom"
                  checked={providerMode === "custom"}
                  onChange={() => setProviderMode("custom")}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {t("activation.customProvider")}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-400">
                    {t("activation.customHint")}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {enabled && providerMode === "custom" && (
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
            className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
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
