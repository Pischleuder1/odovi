"use client";

import dynamic from "next/dynamic";
import { MapTileGate } from "../../../../components/LocationProviderClientConfig";
import type { VisitHeatPoint } from "../../../../lib/yearAnalytics";

const VisitHeatmapMap = dynamic(
  () => import("./VisitHeatmapMap").then((module) => module.VisitHeatmapMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] w-full animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 sm:h-[520px]" />
    ),
  },
);

export interface VisitHeatmapMapLoaderProps {
  points: VisitHeatPoint[];
  visitLabel: string;
  emptyLabel?: string;
}

export function VisitHeatmapMapLoader({
  points,
  visitLabel,
  emptyLabel,
}: VisitHeatmapMapLoaderProps) {
  return (
    <MapTileGate className="h-[420px] w-full sm:h-[520px]">
      {(mapTiles) => (
        <VisitHeatmapMap
          points={points}
          mapTiles={mapTiles}
          visitLabel={visitLabel}
          emptyLabel={emptyLabel}
        />
      )}
    </MapTileGate>
  );
}
