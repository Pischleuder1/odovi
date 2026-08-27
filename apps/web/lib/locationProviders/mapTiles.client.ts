"use client";

import L from "leaflet";
import type { ActiveMapTileConfig } from "./clientConfig";

export function createConfiguredMap(
  element: HTMLElement,
  options: L.MapOptions = {},
): L.Map {
  return L.map(element, { attributionControl: false, ...options });
}

export function addConfiguredMapTiles(
  map: L.Map,
  config: ActiveMapTileConfig,
): L.TileLayer {
  return L.tileLayer(config.urlTemplate, {
    maxZoom: 19,
    keepBuffer: 0,
    updateWhenIdle: true,
    updateWhenZooming: false,
  }).addTo(map);
}
