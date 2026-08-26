"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ActiveMapTileConfig } from "../../../../lib/locationProviders/clientConfig";
import {
  addConfiguredMapTiles,
  createConfiguredMap,
} from "../../../../lib/locationProviders/mapTiles.client";

export interface ChargeMapProps {
  lat: number;
  lon: number;
  mapTiles: ActiveMapTileConfig;
}

const CHARGE_ICON = L.divIcon({
  className: "",
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#3441e3;border:2px solid #f3f0e8;box-shadow:0 0 0 3px rgba(71,87,255,0.24);"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * Hand-rolled Leaflet wrapper matching drives/[id]/DriveMap.tsx:
 * no react-leaflet, must be loaded via next/dynamic with ssr: false.
 * scrollWheelZoom stays off until the user clicks into the map.
 */
export function ChargeMap({ lat, lon, mapTiles }: ChargeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngTuple = [lat, lon];
    const map = createConfiguredMap(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });

    addConfiguredMapTiles(map, mapTiles);

    L.marker(center, { icon: CHARGE_ICON }).addTo(map);
    map.setView(center, 15);

    map.on("click", () => map.scrollWheelZoom.enable());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, mapTiles]);

  return (
    <div
      ref={containerRef}
      className="h-48 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 sm:h-56"
    />
  );
}
