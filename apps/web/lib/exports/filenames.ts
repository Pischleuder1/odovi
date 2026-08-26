import type { Classification } from "@odovi/core";

/** Slugs used in filenames — German, ASCII-safe (ä/ö/ü/ß spelled out). */
const CLASSIFICATION_SLUGS: Record<Classification, string> = {
  unclassified: "unklassifiziert",
  private: "privat",
  business: "geschaeftlich",
  commute: "arbeitsweg",
};

const ALL_CLASSIFICATIONS: Classification[] = [
  "unclassified",
  "private",
  "business",
  "commute",
];

/** `odovi-fahrt-2026-07-02-133.csv` (also used for `format: "gpx"`). */
export function driveFilename(
  date: string,
  driveId: number,
  format: "csv" | "pdf" | "gpx",
): string {
  return `odovi-fahrt-${date}-${driveId}.${format}`;
}

/** `odovi-tag-2026-07-02.csv` */
export function dayFilename(date: string, format: "csv" | "pdf"): string {
  return `odovi-tag-${date}.${format}`;
}

/**
 * `odovi-monat-2026-06-geschaeftlich.pdf` (single classification) or
 * `odovi-monat-2026-06.pdf` (all classifications / default).
 */
export function monthFilename(
  month: string,
  format: "csv" | "pdf",
  classifications?: Classification[],
): string {
  const isAll =
    classifications == null ||
    classifications.length === 0 ||
    classifications.length === ALL_CLASSIFICATIONS.length;

  if (isAll) return `odovi-monat-${month}.${format}`;
  if (classifications.length === 1) {
    return `odovi-monat-${month}-${CLASSIFICATION_SLUGS[classifications[0]!]}.${format}`;
  }
  const slug = classifications.map((c) => CLASSIFICATION_SLUGS[c]).join("-");
  return `odovi-monat-${month}-${slug}.${format}`;
}

/** ASCII-safe, lowercase, dash-separated slug of a free-text name (umlauts spelled out). */
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * `odovi-reise-alpenrundfahrt-12.csv` (name slugified; id keeps it unique
 * even for duplicate/empty names).
 */
export function journeyFilename(
  journeyId: number,
  name: string,
  format: "csv" | "pdf" | "gpx",
): string {
  const slug = slugify(name);
  return slug
    ? `odovi-reise-${slug}-${journeyId}.${format}`
    : `odovi-reise-${journeyId}.${format}`;
}
