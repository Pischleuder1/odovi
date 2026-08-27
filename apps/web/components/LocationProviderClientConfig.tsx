"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { Map } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  ActiveMapTileConfig,
  LocationProviderClientConfig,
} from "../lib/locationProviders/clientConfig";

const Context = createContext<LocationProviderClientConfig | null>(null);

export function LocationProviderClientConfigProvider({
  config,
  children,
}: {
  config: LocationProviderClientConfig;
  children: ReactNode;
}) {
  return <Context.Provider value={config}>{children}</Context.Provider>;
}

export function useLocationProviderClientConfig(): LocationProviderClientConfig {
  const value = useContext(Context);
  if (!value) throw new Error("Location provider client config is missing");
  return value;
}

export function MapTileGate({
  className,
  children,
}: {
  className: string;
  children: (config: ActiveMapTileConfig) => ReactNode;
}) {
  const t = useTranslations("common.locationProviders.mapTiles");
  const { mapTiles } = useLocationProviderClientConfig();
  if (mapTiles.status === "disabled") {
    return (
      <div
        data-testid="map-tiles-disabled"
        className={`${className} flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center dark:border-neutral-700 dark:bg-neutral-900`}
      >
        <Map aria-hidden size={24} className="text-neutral-400" />
        <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {t("title")}
        </p>
        <p className="mt-1 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
          {t("description")}
        </p>
        <Link
          href="/settings#provider-review"
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        >
          {t("activate")}
        </Link>
      </div>
    );
  }

  return (
    <>
      {children(mapTiles)}
      <p className="mt-1 text-right text-[11px] text-neutral-500 dark:text-neutral-400">
        <a
          data-testid="map-provider-attribution"
          href={mapTiles.attribution.href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {mapTiles.attribution.label}
        </a>
      </p>
    </>
  );
}
