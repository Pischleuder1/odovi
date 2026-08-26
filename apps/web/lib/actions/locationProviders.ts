"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  LOCATION_CAPABILITIES,
  LOCATION_PROVIDER_DISCLOSURE_VERSION,
  LocationProviderPolicy,
  PUBLIC_LOCATION_PROVIDERS,
  createDisabledProviderDecision,
  createPublicProviderDecision,
  type LocationCapability,
  type ProviderDecision,
  type ProviderMode,
} from "@odovi/core";
import { locationProviderDecisions } from "@odovi/db";
import { validateSession } from "../auth/session";
import { db } from "../db";

export interface ProviderDecisionActionState {
  ok: boolean;
  error?: string;
}

const decisionSchema = z.object({
  capability: z.enum(LOCATION_CAPABILITIES),
  mode: z.enum(["disabled", "public", "custom"]),
  providerName: z.string().trim().max(120).optional(),
  endpoint: z.string().trim().max(2048).optional(),
  credentialHeader: z.string().trim().max(120).optional(),
  customContactUrl: z.string().trim().max(2048).optional(),
  customOperatingLimits: z.string().trim().max(1000).optional(),
});

function candidateDecision(input: z.infer<typeof decisionSchema>): ProviderDecision {
  const base = {
    decisionId: Number.MAX_SAFE_INTEGER,
    decidedAt: new Date(),
  };
  if (input.mode === "disabled") {
    return { ...createDisabledProviderDecision(input.capability), ...base };
  }
  if (input.mode === "public") {
    return { ...createPublicProviderDecision(input.capability), ...base };
  }
  return {
    ...base,
    capability: input.capability,
    mode: "custom",
    provider: input.providerName ?? "",
    endpoint: input.endpoint ?? "",
    credentialHeader: input.credentialHeader || null,
    customContactUrl: input.customContactUrl ?? "",
    customOperatingLimits: input.customOperatingLimits ?? "",
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
  };
}

export async function updateLocationProviderDecision(
  _previous: ProviderDecisionActionState,
  formData: FormData,
): Promise<ProviderDecisionActionState> {
  const user = await validateSession();
  const t = await getTranslations("settings.providerReview");
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };

  const parsed = decisionSchema.safeParse({
    capability: formData.get("capability"),
    mode: formData.get("mode"),
    providerName: formData.get("providerName") ?? undefined,
    endpoint: formData.get("endpoint") ?? undefined,
    credentialHeader: formData.get("credentialHeader") ?? undefined,
    customContactUrl: formData.get("customContactUrl") ?? undefined,
    customOperatingLimits: formData.get("customOperatingLimits") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: t("errors.invalidInput") };
  }

  const candidate = candidateDecision(parsed.data);
  const resolution = new LocationProviderPolicy([candidate], process.env).resolve(
    parsed.data.capability,
  );
  if (parsed.data.mode !== "disabled" && resolution.status === "disabled") {
    return {
      ok: false,
      error: t("errors.invalidConfiguration", { details: resolution.issues.join("; ") }),
    };
  }

  const mode: ProviderMode = parsed.data.mode;
  const capability: LocationCapability = parsed.data.capability;
  await db.insert(locationProviderDecisions).values({
    capability,
    mode,
    provider:
      mode === "disabled"
        ? "none"
        : mode === "public"
          ? PUBLIC_LOCATION_PROVIDERS[capability].id
          : candidate.provider,
    endpoint: mode === "custom" ? candidate.endpoint : null,
    credentialHeader: mode === "custom" ? candidate.credentialHeader : null,
    customContactUrl: mode === "custom" ? candidate.customContactUrl : null,
    customOperatingLimits: mode === "custom" ? candidate.customOperatingLimits : null,
    disclosureVersion: LOCATION_PROVIDER_DISCLOSURE_VERSION,
    decidedAt: new Date(),
    decidedBy: user.username,
  });

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}
