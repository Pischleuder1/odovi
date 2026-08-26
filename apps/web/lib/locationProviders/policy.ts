import "server-only";
import { desc } from "drizzle-orm";
import {
  LOCATION_CAPABILITIES,
  LOCATION_CAPABILITY_DISCLOSURES,
  LOCATION_PROVIDER_CREDENTIAL_ENV,
  LocationProviderPolicy,
  PUBLIC_LOCATION_PROVIDERS,
  type LocationCapability,
  type ProviderDecision,
  type ProviderMode,
} from "@odovi/core";
import { locationProviderDecisions } from "@odovi/db";
import { db } from "../db";

const capabilities = new Set<string>(LOCATION_CAPABILITIES);
const modes = new Set<string>(["disabled", "public", "custom"] satisfies ProviderMode[]);

export interface ProviderReviewDecisionView {
  mode: ProviderMode;
  provider: string;
  endpoint: string | null;
  credentialHeader: string | null;
  customContactUrl: string | null;
  customOperatingLimits: string | null;
  disclosureVersion: string;
  decidedAt: string;
  decidedBy: string;
}

export interface ProviderReviewItem {
  capability: LocationCapability;
  status: "active" | "disabled";
  reason: string | null;
  requiresReview: boolean;
  issues: readonly string[];
  publicProvider: (typeof PUBLIC_LOCATION_PROVIDERS)[LocationCapability];
  disclosure: (typeof LOCATION_CAPABILITY_DISCLOSURES)[LocationCapability];
  credentialEnvironment: string;
  decision: ProviderReviewDecisionView | null;
}

export interface ProviderReviewSnapshot {
  requiresReview: boolean;
  activeCount: number;
  items: ProviderReviewItem[];
}

function isCapability(value: string): value is LocationCapability {
  return capabilities.has(value);
}

function isMode(value: string): value is ProviderMode {
  return modes.has(value);
}

export async function loadProviderDecisions(): Promise<ProviderDecision[]> {
  const rows = await db
    .select()
    .from(locationProviderDecisions)
    .orderBy(desc(locationProviderDecisions.id));

  return rows
    .filter((row) => isCapability(row.capability))
    .map((row) => ({
      decisionId: row.id,
      capability: row.capability as LocationCapability,
      mode: row.mode as ProviderMode,
      provider: row.provider,
      endpoint: row.endpoint,
      credentialHeader: row.credentialHeader,
      customContactUrl: row.customContactUrl,
      customOperatingLimits: row.customOperatingLimits,
      disclosureVersion: row.disclosureVersion,
      decidedAt: row.decidedAt,
    }));
}

export async function getLocationProviderPolicy(): Promise<LocationProviderPolicy> {
  return new LocationProviderPolicy(await loadProviderDecisions(), process.env);
}

export async function getProviderReviewSnapshot(): Promise<ProviderReviewSnapshot> {
  const rows = await db
    .select()
    .from(locationProviderDecisions)
    .orderBy(desc(locationProviderDecisions.id));
  const current = new Map<LocationCapability, (typeof rows)[number]>();
  for (const row of rows) {
    if (isCapability(row.capability) && !current.has(row.capability)) {
      current.set(row.capability, row);
    }
  }

  const decisions = rows
    .filter((row) => isCapability(row.capability))
    .map((row) => ({
      decisionId: row.id,
      capability: row.capability as LocationCapability,
      mode: row.mode as ProviderMode,
      provider: row.provider,
      endpoint: row.endpoint,
      credentialHeader: row.credentialHeader,
      customContactUrl: row.customContactUrl,
      customOperatingLimits: row.customOperatingLimits,
      disclosureVersion: row.disclosureVersion,
      decidedAt: row.decidedAt,
    } satisfies ProviderDecision));
  const policy = new LocationProviderPolicy(decisions, process.env);

  const items = LOCATION_CAPABILITIES.map((capability): ProviderReviewItem => {
    const resolution = policy.resolve(capability);
    const row = current.get(capability);
    return {
      capability,
      status: resolution.status,
      reason: resolution.status === "disabled" ? resolution.reason : null,
      requiresReview: resolution.status === "disabled" && resolution.requiresReview,
      issues: resolution.status === "disabled" ? resolution.issues : [],
      publicProvider: PUBLIC_LOCATION_PROVIDERS[capability],
      disclosure: LOCATION_CAPABILITY_DISCLOSURES[capability],
      credentialEnvironment: LOCATION_PROVIDER_CREDENTIAL_ENV[capability],
      decision:
        row && isMode(row.mode)
          ? {
              mode: row.mode,
              provider: row.provider,
              endpoint: row.endpoint,
              credentialHeader: row.credentialHeader,
              customContactUrl: row.customContactUrl,
              customOperatingLimits: row.customOperatingLimits,
              disclosureVersion: row.disclosureVersion,
              decidedAt: row.decidedAt.toISOString(),
              decidedBy: row.decidedBy,
            }
          : null,
    };
  });

  return {
    requiresReview: items.some((item) => item.requiresReview),
    activeCount: items.filter((item) => item.status === "active").length,
    items,
  };
}
