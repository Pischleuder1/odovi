import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  localeFromAcceptLanguage,
  resolveLocale,
} from "./locale";

describe("locale resolution", () => {
  it("uses English when the browser language is absent, invalid, or unsupported", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(localeFromAcceptLanguage(undefined)).toBe("en");
    expect(localeFromAcceptLanguage(" ")).toBe("en");
    expect(localeFromAcceptLanguage("fr-FR,es;q=0.9,*;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("de-DE;q=0,fr;q=1")).toBe("en");
  });

  it("negotiates the highest-priority supported browser language", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(localeFromAcceptLanguage("fr-FR,de;q=0.8,en;q=0.7")).toBe("de");
    expect(localeFromAcceptLanguage("de;q=0.6,en-GB;q=0.9")).toBe("en");
  });

  it("lets an explicit current or legacy selection override browser detection", () => {
    expect(
      resolveLocale({ localeCookie: "en", acceptLanguage: "de-DE" }),
    ).toBe("en");
    expect(
      resolveLocale({ legacyLocaleCookie: "de", acceptLanguage: "en-US" }),
    ).toBe("de");
    expect(
      resolveLocale({
        localeCookie: "unsupported",
        legacyLocaleCookie: "de",
        acceptLanguage: "en-US",
      }),
    ).toBe("de");
  });
});
