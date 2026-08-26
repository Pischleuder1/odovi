import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  LEGACY_LOCALE_COOKIE,
  LOCALE_COOKIE,
  MESSAGE_NAMESPACES,
  resolveLocale,
} from "../lib/locale";

export {
  DEFAULT_LOCALE,
  isLocale,
  LEGACY_LOCALE_COOKIE,
  LOCALES,
  LOCALE_COOKIE,
  type Locale,
} from "../lib/locale";

/**
 * Feste Reihenfolge der Namespaces. Jede Sprache hat pro Namespace eine
 * Datei unter messages/<locale>/<ns>.json; der Dateiname wird zum Top-Level-Key
 * im gemergten Messages-Objekt (z. B. { common: {...}, nav: {...}, ... }).
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({
    localeCookie: cookieStore.get(LOCALE_COOKIE)?.value,
    legacyLocaleCookie: cookieStore.get(LEGACY_LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });

  // Alle Namespaces der aktiven Sprache dynamisch laden und unter ihrem
  // Namespace-Namen zusammenführen. Die Extraktions-Agents befüllen die
  // einzelnen Dateien; hier bleibt die Liste die einzige Quelle der Wahrheit.
  const entries = await Promise.all(
    MESSAGE_NAMESPACES.map(
      async (ns) =>
        [ns, (await import(`../messages/${locale}/${ns}.json`)).default] as const,
    ),
  );

  return {
    locale,
    messages: Object.fromEntries(entries),
  };
});
