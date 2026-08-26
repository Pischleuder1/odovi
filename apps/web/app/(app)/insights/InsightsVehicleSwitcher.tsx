"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Vehicle } from "../../../lib/queries";
import styles from "./Insights.module.css";

/** Fahrzeug-Umschalter — Pass-through über ?vehicle= (wie Kalender/Tag). */
export function InsightsVehicleSwitcher({
  vehicles,
  current,
}: {
  vehicles: Vehicle[];
  current: number;
}) {
  const router = useRouter();
  const t = useTranslations("insights");
  return (
    <select
      aria-label={t("vehicleSwitcherLabel")}
      value={current}
      onChange={(e) => router.push(`/insights?vehicle=${e.target.value}`)}
      className={styles.vehicleSwitcher}
    >
      {vehicles.map((v) => (
        <option key={v.id} value={v.id}>
          {v.displayName}
        </option>
      ))}
    </select>
  );
}
