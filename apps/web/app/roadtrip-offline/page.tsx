import { getTranslations } from "next-intl/server";
import { OfflineRoadtripCompanion } from "./OfflineRoadtripCompanion";
import { getLocationProviderPolicy } from "../../lib/locationProviders/policy";
import { externalNavigationClientConfig } from "../../lib/locationProviders/clientConfig";

export const dynamic = "force-dynamic";

export default async function OfflineRoadtripPage() {
  const [t, policy] = await Promise.all([
    getTranslations("journeys"),
    getLocationProviderPolicy(),
  ]);
  return (
    <OfflineRoadtripCompanion
      externalNavigation={externalNavigationClientConfig(
        policy.resolve("externalNavigation"),
      )}
      labels={{
        title: t("offline.title"),
        emptyTitle: t("offline.emptyTitle"),
        emptyHint: t("offline.emptyHint"),
        back: t("offline.back"),
        version: t("offline.version"),
        saved: t("offline.saved"),
        nextStop: t("offline.nextStop"),
        arrived: t("offline.arrived"),
        distance: t("offline.distance"),
        duration: t("offline.duration"),
        arrivalSoc: t("offline.arrivalSoc"),
        chargeTarget: t("offline.chargeTarget"),
        chargeEstimate: t("offline.chargeEstimate"),
        navigate: t("offline.navigate"),
        navigationDisabled: t("offline.navigationDisabled"),
        activateNavigation: t("offline.activateNavigation"),
        previous: t("offline.previous"),
        next: t("offline.next"),
        complete: t("offline.complete"),
        routeComplete: t("offline.routeComplete"),
        reset: t("offline.reset"),
        offlineReady: t("offline.offlineReady"),
        online: t("offline.online"),
        offline: t("offline.offline"),
      }}
    />
  );
}
