import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "../lib/locale";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [requestLocale, t] = await Promise.all([
    getLocale(),
    getTranslations("ui"),
  ]);
  const locale = isLocale(requestLocale) ? requestLocale : DEFAULT_LOCALE;

  return {
    name: "Odovi",
    short_name: "Odovi",
    description: t("meta.description"),
    lang: locale,
    dir: "ltr",
    display: "standalone",
    orientation: "portrait",
    start_url: "/",
    scope: "/",
    background_color: "#0B1020",
    theme_color: "#FF6B4A",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
