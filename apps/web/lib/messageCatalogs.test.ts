import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MESSAGE_NAMESPACES, type Locale } from "./locale";

type CatalogValue = string | number | boolean | null | Catalog;
interface Catalog {
  [key: string]: CatalogValue;
}

const messagesDirectory = fileURLToPath(new URL("../messages/", import.meta.url));

function readCatalog(locale: Locale, namespace: string): Catalog {
  return JSON.parse(
    readFileSync(`${messagesDirectory}${locale}/${namespace}.json`, "utf8"),
  ) as Catalog;
}

function flattenCatalog(catalog: Catalog, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result.set(path, value);
    } else if (value && typeof value === "object") {
      for (const [childPath, childValue] of flattenCatalog(value, path)) {
        result.set(childPath, childValue);
      }
    }
  }
  return result;
}

function variables(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)/g)]
    .map((match) => match[1]!)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

describe("English and German message catalogs", () => {
  for (const namespace of MESSAGE_NAMESPACES) {
    it(`${namespace} has complete, non-key fallbacks in both languages`, () => {
      const english = flattenCatalog(readCatalog("en", namespace));
      const german = flattenCatalog(readCatalog("de", namespace));

      expect([...english.keys()].sort()).toEqual([...german.keys()].sort());

      for (const [key, englishValue] of english) {
        const germanValue = german.get(key)!;
        expect(englishValue.trim(), `empty English message: ${namespace}.${key}`).not.toBe("");
        expect(germanValue.trim(), `empty German message: ${namespace}.${key}`).not.toBe("");
        expect(englishValue, `English key leaked: ${namespace}.${key}`).not.toBe(
          `${namespace}.${key}`,
        );
        expect(germanValue, `German key leaked: ${namespace}.${key}`).not.toBe(
          `${namespace}.${key}`,
        );
        expect(variables(englishValue), `placeholder mismatch: ${namespace}.${key}`).toEqual(
          variables(germanValue),
        );
      }
    });
  }
});
