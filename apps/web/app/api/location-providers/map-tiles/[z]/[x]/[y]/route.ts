import { NextResponse } from "next/server";
import type {
  ActiveProviderResolution,
  LocationProviderAdapter,
} from "@odovi/core";
import {
  fetchConfiguredMapTile,
  type MapTileCoordinates,
} from "../../../../../../../lib/locationProviders/mapTiles";
import { getLocationProviderPolicy } from "../../../../../../../lib/locationProviders/policy";
import { validateSession } from "../../../../../../../lib/auth/session";

export const dynamic = "force-dynamic";

function coordinate(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validCoordinates(input: {
  z: number | null;
  x: number | null;
  y: number | null;
}): input is MapTileCoordinates {
  if (input.z == null || input.x == null || input.y == null) return false;
  if (input.z < 0 || input.z > 19) return false;
  const dimension = 2 ** input.z;
  return input.x >= 0 && input.x < dimension && input.y >= 0 && input.y < dimension;
}

function adapter(provider: ActiveProviderResolution): LocationProviderAdapter<
  MapTileCoordinates,
  Awaited<ReturnType<typeof fetchConfiguredMapTile>>
> {
  return {
    capability: "mapTiles",
    provider: provider.provider,
    request: fetchConfiguredMapTile,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  if (!(await validateSession())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const raw = await params;
  const coordinates = {
    z: coordinate(raw.z),
    x: coordinate(raw.x),
    y: coordinate(raw.y),
  };
  if (!validCoordinates(coordinates)) {
    return NextResponse.json({ error: "Invalid map tile coordinates" }, { status: 400 });
  }

  const policy = await getLocationProviderPolicy();
  const resolution = policy.resolve("mapTiles");
  if (resolution.status === "disabled" || resolution.mode !== "custom") {
    return NextResponse.json({ error: "Map tiles are disabled" }, { status: 404 });
  }
  const result = await policy.request(
    "mapTiles",
    coordinates,
    {
      public: adapter(resolution),
      custom: adapter,
    },
  );
  if (result.status === "disabled") return new Response(null, { status: 404 });

  return new Response(result.value.body, {
    headers: {
      "Content-Type": result.value.contentType,
      "Cache-Control": result.value.cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
