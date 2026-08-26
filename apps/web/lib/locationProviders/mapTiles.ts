import type { ActiveProviderResolution } from "@odovi/core";

export interface MapTileCoordinates {
  z: number;
  x: number;
  y: number;
}

export interface MapTileResponse {
  body: ArrayBuffer;
  contentType: string;
  cacheControl: string;
}

export function expandMapTileEndpoint(
  endpoint: string,
  coordinates: MapTileCoordinates,
): string {
  return endpoint
    .replaceAll("{z}", String(coordinates.z))
    .replaceAll("{x}", String(coordinates.x))
    .replaceAll("{y}", String(coordinates.y));
}

export async function fetchConfiguredMapTile(
  coordinates: MapTileCoordinates,
  provider: ActiveProviderResolution,
  request: typeof fetch = fetch,
): Promise<MapTileResponse> {
  const endpoint =
    provider.mode === "public"
      ? provider.endpoints.tiles
      : provider.endpoints.default;
  if (!endpoint) throw new Error("Map tile endpoint is not configured");

  const headers = new Headers({ Accept: "image/*" });
  if (provider.credentialHeader && provider.credential) {
    headers.set(provider.credentialHeader, provider.credential);
  }
  const response = await request(expandMapTileEndpoint(endpoint, coordinates), {
    headers,
    redirect: "follow",
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`Map tile provider returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Map tile provider returned a non-image response");
  }

  return {
    body: await response.arrayBuffer(),
    contentType,
    cacheControl:
      response.headers.get("cache-control") ?? "private, max-age=300",
  };
}
