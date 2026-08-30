"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { VisitHeatPoint } from "../../../../lib/yearAnalytics";
import type { ActiveMapTileConfig } from "../../../../lib/locationProviders/clientConfig";
import {
  addConfiguredMapTiles,
  createConfiguredMap,
} from "../../../../lib/locationProviders/mapTiles.client";

export interface VisitHeatmapMapProps {
  points: VisitHeatPoint[];
  mapTiles: ActiveMapTileConfig;
  visitLabel: string;
  emptyLabel?: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function VisitHeatmapMap({
  points,
  mapTiles,
  visitLabel,
  emptyLabel = "",
}: VisitHeatmapMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !overlayRef.current || mapRef.current) return;

    const map = createConfiguredMap(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });
    addConfiguredMapTiles(map, mapTiles);

    const tooltipLayer = L.layerGroup().addTo(map);
    const maxVisits = Math.max(...points.map((point) => point.visits), 1);
    const bounds = L.latLngBounds([]);

    for (const point of points) {
      const latLng: L.LatLngTuple = [point.lat, point.lon];
      const intensity = Math.sqrt(point.visits / maxVisits);
      const interactiveRadius = 10 + intensity * 12;

      const hitArea = L.circleMarker(latLng, {
        radius: interactiveRadius,
        stroke: false,
        fillOpacity: 0,
        opacity: 0,
        interactive: true,
      }).addTo(tooltipLayer);

      hitArea.bindTooltip(
        `<strong>${escapeHtml(point.label)}</strong><br>${point.visits} ${escapeHtml(visitLabel)}`,
      );
      bounds.extend(latLng);
    }

    const fit = () => {
      map.invalidateSize();
      if (points.length === 0) {
        map.setView([20, 0], 2);
      } else if (points.length === 1) {
        map.setView([points[0]!.lat, points[0]!.lon], 11);
      } else if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
      }
    };

    const renderHeatOverlay = () => {
      const svg = overlayRef.current;
      if (!svg) return;

      const size = map.getSize();
      svg.setAttribute("width", String(size.x));
      svg.setAttribute("height", String(size.y));
      svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);

      while (svg.firstChild) svg.removeChild(svg.firstChild);

      if (points.length === 0) return;

      const defs = createSvgElement("defs");
      const filter = createSvgElement("filter", {
        id: "heat-soft-blur",
        x: "-40%",
        y: "-40%",
        width: "180%",
        height: "180%",
      });
      const blur = createSvgElement("feGaussianBlur", {
        stdDeviation: "16",
      });
      filter.appendChild(blur);
      defs.appendChild(filter);

      const filterTight = createSvgElement("filter", {
        id: "heat-core-blur",
        x: "-20%",
        y: "-20%",
        width: "140%",
        height: "140%",
      });
      const blurTight = createSvgElement("feGaussianBlur", {
        stdDeviation: "5",
      });
      filterTight.appendChild(blurTight);
      defs.appendChild(filterTight);

      svg.appendChild(defs);

      const softGroup = createSvgElement("g", {
        filter: "url(#heat-soft-blur)",
      });
      const coreGlowGroup = createSvgElement("g", {
        filter: "url(#heat-core-blur)",
      });
      const markerGroup = createSvgElement("g");

      points.forEach((point, index) => {
        const pixel = map.latLngToContainerPoint([point.lat, point.lon]);
        const intensity = Math.sqrt(point.visits / maxVisits);
        const outerRadius = 34 + intensity * 56;
        const coreRadius = 12 + intensity * 18;

        const gradientId = `visit-heat-${index}`;
        defs.appendChild(
          createRadialGradient(gradientId, {
            centerOpacity: 0.56 + intensity * 0.22,
            midOpacity: 0.22 + intensity * 0.14,
          }),
        );

        softGroup.appendChild(
          createSvgElement("circle", {
            cx: `${pixel.x}`,
            cy: `${pixel.y}`,
            r: `${outerRadius}`,
            fill: `url(#${gradientId})`,
            opacity: `${0.88 + intensity * 0.1}`,
          }),
        );

        coreGlowGroup.appendChild(
          createSvgElement("circle", {
            cx: `${pixel.x}`,
            cy: `${pixel.y}`,
            r: `${coreRadius}`,
            fill: "#7c3aed",
            opacity: `${0.16 + intensity * 0.16}`,
          }),
        );

        markerGroup.appendChild(
          createSvgElement("circle", {
            cx: `${pixel.x}`,
            cy: `${pixel.y}`,
            r: `${Math.max(2.5, 2.5 + intensity * 3)}`,
            fill: "#4c1d95",
            opacity: "0.85",
          }),
        );

        if (point.knownPlace) {
          markerGroup.appendChild(
            createSvgElement("circle", {
              cx: `${pixel.x}`,
              cy: `${pixel.y}`,
              r: `${Math.max(5, 5 + intensity * 4)}`,
              fill: "none",
              stroke: "#6d28d9",
              "stroke-width": "1.25",
              opacity: "0.55",
            }),
          );
        }
      });

      svg.appendChild(softGroup);
      svg.appendChild(coreGlowGroup);
      svg.appendChild(markerGroup);
    };

    fit();
    renderHeatOverlay();

    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el && el.clientHeight > 0) {
        fit();
        renderHeatOverlay();
        ro.disconnect();
      }
    });
    ro.observe(containerRef.current);

    const rerender = () => renderHeatOverlay();
    map.on("zoomend", rerender);
    map.on("moveend", rerender);
    map.on("resize", rerender);
    map.on("click", () => map.scrollWheelZoom.enable());

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.off("zoomend", rerender);
      map.off("moveend", rerender);
      map.off("resize", rerender);
      tooltipLayer.remove();
      map.remove();
      mapRef.current = null;
    };
    // Map data is immutable for one server render. A filter change remounts via navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[420px] w-full rounded-xl border border-neutral-200 dark:border-neutral-800 sm:h-[520px]"
      />
      <svg
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-[420] h-full w-full overflow-hidden rounded-xl"
        aria-hidden="true"
      />
      {points.length === 0 && emptyLabel && (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
          <div className="max-w-lg rounded-xl border border-white/70 bg-white/90 px-4 py-2 text-center text-sm font-medium text-neutral-700 shadow-sm backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/90 dark:text-neutral-200">
            {emptyLabel}
          </div>
        </div>
      )}
    </div>
  );
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

function createRadialGradient(
  id: string,
  opacities: { centerOpacity: number; midOpacity: number },
): SVGRadialGradientElement {
  const gradient = createSvgElement("radialGradient", {
    id,
    cx: "50%",
    cy: "50%",
    r: "50%",
    fx: "50%",
    fy: "50%",
  });

  gradient.appendChild(
    createSvgElement("stop", {
      offset: "0%",
      "stop-color": "#6d28d9",
      "stop-opacity": opacities.centerOpacity.toFixed(3),
    }),
  );
  gradient.appendChild(
    createSvgElement("stop", {
      offset: "42%",
      "stop-color": "#7c3aed",
      "stop-opacity": opacities.midOpacity.toFixed(3),
    }),
  );
  gradient.appendChild(
    createSvgElement("stop", {
      offset: "100%",
      "stop-color": "#8b5cf6",
      "stop-opacity": "0",
    }),
  );

  return gradient;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
