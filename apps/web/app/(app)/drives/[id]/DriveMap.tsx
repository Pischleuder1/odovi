"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RoutePointTuple } from "../../../../lib/driveRoute";
import type { ActiveMapTileConfig } from "../../../../lib/locationProviders/clientConfig";
import {
  addConfiguredMapTiles,
  createConfiguredMap,
} from "../../../../lib/locationProviders/mapTiles.client";

export interface DriveMapProps {
  points: RoutePointTuple[];
  mapTiles: ActiveMapTileConfig;
}

function markerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const START_ICON = markerIcon("#16a34a"); // green-600: start
const END_ICON = markerIcon("#dc2626"); // red-600: end

function speedColor(speedKmh: number | null): string {
  if (speedKmh == null) return "#6b7280";
  if (speedKmh < 50) return "#16a34a";
  if (speedKmh < 100) return "#eab308";
  if (speedKmh < 130) return "#f97316";
  return "#dc2626";
}

function pointSummary(point: RoutePointTuple): string {
  const [, , timestampMs, speedKmh, soc] = point;
  const time = new Date(timestampMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = [time];
  if (speedKmh != null) parts.push(`${Math.round(speedKmh)} km/h`);
  if (soc != null) parts.push(`SoC ${Math.round(soc)}%`);
  return parts.join(" · ");
}

function addSpeedLegend(map: L.Map): L.Control {
  const legend = new L.Control({ position: "bottomright" });

  legend.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-control");
    container.style.background = "rgba(255,255,255,0.94)";
    container.style.color = "#111827";
    container.style.padding = "6px 8px";
    container.style.borderRadius = "6px";
    container.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
    container.style.fontSize = "11px";
    container.style.lineHeight = "1.35";

    const entries = [
      ["#16a34a", "< 50"],
      ["#eab308", "50–99"],
      ["#f97316", "100–129"],
      ["#dc2626", "≥ 130"],
      ["#6b7280", "n/a"],
    ] as const;

    for (const [color, label] of entries) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "5px";

      const swatch = document.createElement("span");
      swatch.style.display = "inline-block";
      swatch.style.width = "14px";
      swatch.style.height = "4px";
      swatch.style.background = color;
      swatch.style.borderRadius = "9999px";

      const text = document.createElement("span");
      text.textContent = `${label} km/h`;

      row.append(swatch, text);
      container.append(row);
    }

    L.DomEvent.disableClickPropagation(container);
    return container;
  };

  legend.addTo(map);
  return legend;
}

/**
 * Hand-rolled Leaflet wrapper mirroring app/(app)/places/PlaceMap.tsx:
 * no react-leaflet (React 19 / Next 15 friction), must be loaded via
 * next/dynamic with ssr: false since Leaflet touches window/document.
 *
 * Read-only track view with a speed-colored GPS route, start/end markers,
 * and interactive route points. Hover shows time, speed and SoC; clicking
 * a point additionally exposes its exact coordinates.
 * scrollWheelZoom stays off until the user clicks into the map, so the
 * page doesn't get scroll-hijacked while scrolling past the card.
 */
export function DriveMap({ points, mapTiles }: DriveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (points.length < 2) return;

    const latLngs: L.LatLngTuple[] = points.map((p) => [p[0], p[1]]);

    const map = createConfiguredMap(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });

    addConfiguredMapTiles(map, mapTiles);

    // A shared Canvas renderer keeps the interactive route usable even for
    // long drives (driveRoute already thins the payload to at most 1,500 points).
    const renderer = L.canvas({ padding: 0.5 });

    for (let index = 1; index < points.length; index += 1) {
      const speedKmh = points[index][3] ?? points[index - 1][3];

      L.polyline([latLngs[index - 1], latLngs[index]], {
        color: speedColor(speedKmh),
        weight: 5,
        opacity: 0.86,
        renderer,
        interactive: false,
      }).addTo(map);
    }

    for (const point of points) {
      const [lat, lon] = point;
      const summary = pointSummary(point);

      const hitTarget = L.circleMarker([lat, lon], {
        radius: 7,
        stroke: false,
        fill: true,
        fillColor: "#000000",
        fillOpacity: 0.01,
        renderer,
      }).addTo(map);

      hitTarget.bindTooltip(summary, {
        direction: "top",
        sticky: true,
        opacity: 0.95,
      });

      hitTarget.on("click", () => {
        L.popup()
          .setLatLng([lat, lon])
          .setContent(`${summary}<br>${lat.toFixed(5)}, ${lon.toFixed(5)}`)
          .openOn(map);
      });
    }

    L.marker(latLngs[0], { icon: START_ICON }).addTo(map);
    L.marker(latLngs[latLngs.length - 1], { icon: END_ICON }).addTo(map);
    addSpeedLegend(map);

    map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });

    // Enable scroll-to-zoom only once the user has clicked into the map,
    // otherwise a page-scroll gesture over the map hijacks the scroll.
    map.on("click", () => map.scrollWheelZoom.enable());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 sm:h-[360px]"
    />
  );
}
