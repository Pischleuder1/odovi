import "server-only";
import { parseTeslaProviderConfig } from "@odovi/runtime-config";

export interface TeslaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  partnerDomain: string;
  fleetApiBaseUrl: string;
  commandApiUrl: string;
}

export function getTeslaConfig(): TeslaConfig | null {
  const config = parseTeslaProviderConfig(process.env);
  if (!config) return null;
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    partnerDomain: config.partnerDomain,
    fleetApiBaseUrl: config.fleetApiBaseUrl,
    commandApiUrl: config.commandApiUrl,
  };
}
