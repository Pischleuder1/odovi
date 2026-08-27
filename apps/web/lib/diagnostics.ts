import "server-only";
import { getSyncState, type SyncStateRow } from "./queries";
import { getReadinessReport } from "./readiness";
import type { ReadinessReport } from "./readiness-model";

export type SyncHealth = "fresh" | "aging" | "stale" | "never";

/** Grün: letzter erfolgreicher Lauf < 5 min her. */
const FRESH_MS = 5 * 60 * 1000;
/** Gelb: < 1 h her. Älter (oder nie) ist rot — siehe classifyHealth. */
const AGING_MS = 60 * 60 * 1000;

const HEALTH_RANK: Record<SyncHealth, number> = {
  fresh: 0,
  aging: 1,
  stale: 2,
  never: 3,
};

function classifyHealth(row: SyncStateRow): SyncHealth {
  // Schema compatibility remains valid for the worker process lifetime;
  // worker freshness independently reveals whether that process stopped.
  if (row.source === "teslamate" && row.entity === "schema") {
    return row.lastStatus === "ok" ? "fresh" : "stale";
  }
  // Optional providers are failure-soft and may be disabled after a run. Their
  // last outcome matters; the age of an intentionally idle adapter does not.
  if (row.source === "location_provider") {
    if (row.lastStatus === "error") return "stale";
    if (row.lastStatus === "deferred") return "aging";
    return row.lastStatus === "ok" ? "fresh" : "never";
  }
  if (!row.lastSuccessAt) return "never";
  const ageMs = Date.now() - row.lastSuccessAt.getTime();
  if (ageMs < FRESH_MS) return "fresh";
  if (ageMs < AGING_MS) return "aging";
  return "stale";
}

export interface SyncEntityDiagnosis extends SyncStateRow {
  health: SyncHealth;
}

export interface DiagnosticsSummary {
  /** Trivialer Round-Trip gegen die eigene Odovi-DB. */
  odoviDbOk: boolean;
  odoviDbError: string | null;
  entities: SyncEntityDiagnosis[];
  /** Schlechtester Zustand über alle entities — bestimmt die Karten-Ampel. */
  overallHealth: SyncHealth;
  /** Ob TESLAMATE_DATABASE_URL im Web-Container gesetzt ist (Direkttest möglich). */
  teslamateEnvSet: boolean;
  readiness: ReadinessReport;
}

/**
 * Übersetzte Entity-Labels aus dem "settings"-Namespace (diagnostics.entities.*),
 * einmal pro Request vom aufrufenden Server Component gebaut und durchgereicht.
 */
export function buildEntityLabels(t: (key: string) => string): Record<string, string> {
  return {
    drives: t("diagnostics.entities.drives"),
    charges: t("diagnostics.entities.charges"),
    parks: t("diagnostics.entities.parks"),
    vehicles: t("diagnostics.entities.vehicles"),
    worker: t("diagnostics.entities.worker"),
    schema: t("diagnostics.entities.schema"),
    elevation: t("diagnostics.entities.elevation"),
    drive_weather: t("diagnostics.entities.driveWeather"),
  };
}

/** Menschenlesbares Label für eine sync_state-Zeile, z. B. "teslamate / Fahrten". */
export function entityLabel(
  source: string,
  entity: string,
  labels: Record<string, string>,
): string {
  const label = labels[entity] ?? entity;
  return `${source} / ${label}`;
}

/**
 * Baut die Diagnose-Zusammenfassung für die Settings-Seite: DB-Erreichbarkeit
 * plus je sync_state-Zeile eine Alters-Einstufung (grün/gelb/rot/nie).
 * Schluckt DB-Fehler statt die Seite crashen zu lassen — genau dafür ist die
 * Diagnose-Card da.
 */
export async function getDiagnostics(): Promise<DiagnosticsSummary> {
  const readiness = await getReadinessReport();
  let odoviDbOk = readiness.checks.database.state === "healthy";
  let odoviDbError: string | null = odoviDbOk
    ? null
    : readiness.checks.database.code;

  let rows: SyncStateRow[] = [];
  if (odoviDbOk) {
    try {
      rows = await getSyncState();
    } catch {
      odoviDbOk = false;
      odoviDbError = "unavailable";
    }
  }

  const entities: SyncEntityDiagnosis[] = rows.map((row) => ({
    ...row,
    health: classifyHealth(row),
  }));

  const overallHealth: SyncHealth =
    entities.length === 0
      ? "never"
      : entities.reduce<SyncHealth>(
          (worst, e) => (HEALTH_RANK[e.health] > HEALTH_RANK[worst] ? e.health : worst),
          "fresh",
        );

  return {
    odoviDbOk,
    odoviDbError,
    entities,
    overallHealth,
    teslamateEnvSet: Boolean(process.env.TESLAMATE_DATABASE_URL),
    readiness,
  };
}

/**
 * Menschenlesbare Hinweise für typische Fehlerbilder, unter der Diagnose-Card.
 * `t` ist an den "settings"-Namespace gebunden (getTranslations("settings")
 * im aufrufenden Server Component).
 */
export function diagnosticsHints(
  summary: DiagnosticsSummary,
  t: (key: string) => string,
): string[] {
  const hints: string[] = [];

  if (!summary.odoviDbOk) {
    hints.push(t("diagnostics.hints.dbUnreachable"));
    return hints;
  }

  if (summary.readiness.checks.migrations.state === "failed") {
    hints.push(t("diagnostics.hints.migrationsIncomplete"));
  }

  if (summary.readiness.checks.protectedApplication.state === "failed") {
    hints.push(t("diagnostics.hints.protectedUnavailable"));
  }

  if (summary.readiness.checks.teslamate.state !== "healthy") {
    hints.push(
      summary.readiness.checks.teslamate.code === "incompatible_schema"
        ? t("diagnostics.hints.teslamateIncompatible")
        : t("diagnostics.hints.teslamateUnavailable"),
    );
  }

  if (summary.readiness.checks.worker.state === "unknown") {
    hints.push(t("diagnostics.hints.neverSynced"));
  } else if (summary.readiness.checks.worker.state === "degraded") {
    hints.push(t("diagnostics.hints.stale"));
  }

  if (summary.readiness.checks.optionalProviders.state === "degraded") {
    hints.push(t("diagnostics.hints.optionalProviderUnavailable"));
  }

  return hints;
}
