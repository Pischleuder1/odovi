import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { APP_TIMEZONE } from "../../../../lib/config";
import { getChargingAnalytics } from "../../../../lib/chargeAnalytics";
import { getVehicles } from "../../../../lib/queries";
import { buttonClasses } from "../../../../components/ui/Button";
import { ChargeAnalytics } from "./ChargeAnalytics";

export const dynamic = "force-dynamic";

export default async function ChargeAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const params = await searchParams;
  const limit: 5 | 10 = params.limit === "10" ? 10 : 5;
  const [t, locale, vehicles] = await Promise.all([
    getTranslations("charges"),
    getLocale(),
    getVehicles(),
  ]);
  const vehicleId = vehicles[0]?.id;
  const analytics = vehicleId != null ? await getChargingAnalytics(vehicleId, limit) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("analysis.title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("analysis.subtitle")}
          </p>
        </div>
        <Link href="/charges" className={buttonClasses("secondary", "md")}>
          <ArrowLeft aria-hidden size={16} />
          {t("analysis.back")}
        </Link>
      </div>

      <div className="mt-6">
        {analytics ? (
          <ChargeAnalytics
            analytics={analytics}
            locale={locale}
            timeZone={APP_TIMEZONE}
            limit={limit}
          />
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            {t("analysis.noVehicle")}
          </div>
        )}
      </div>
    </div>
  );
}
