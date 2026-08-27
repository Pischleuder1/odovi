import { desc } from "drizzle-orm";
import {
  LOCATION_CAPABILITIES,
  LocationProviderPolicy,
  type LocationCapability,
  type ProviderDecision,
  type ProviderMode,
} from "@odovi/core";
import { locationProviderDecisions, type Db } from "@odovi/db";

const capabilities = new Set<string>(LOCATION_CAPABILITIES);
const modes = new Set<string>(["disabled", "public", "custom"] satisfies ProviderMode[]);

function isCapability(value: string): value is LocationCapability {
  return capabilities.has(value);
}

function isMode(value: string): value is ProviderMode {
  return modes.has(value);
}

export async function loadWorkerLocationProviderPolicy(
  db: Db,
  credentials: Record<string, string | undefined> = process.env,
): Promise<LocationProviderPolicy> {
  const rows = await db
    .select()
    .from(locationProviderDecisions)
    .orderBy(desc(locationProviderDecisions.id));

  const decisions = rows
    .filter((row) => isCapability(row.capability) && isMode(row.mode))
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

  return new LocationProviderPolicy(decisions, credentials);
}
