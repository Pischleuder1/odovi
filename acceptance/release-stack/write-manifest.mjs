import { readFileSync, writeFileSync } from "node:fs";

const [output, status] = process.argv.slice(2);
const dependencyGates = [
  { issue: 27, contract: "single-use setup token", enforced: process.env.ODOVI_ACCEPTANCE_SETUP_TOKEN != null },
  { issue: 28, contract: "visible version and build identity", enforced: process.env.ODOVI_EXPECT_RELEASE_IDENTITY === "1" },
  { issue: 29, contract: "browser locale detection and English fallback", enforced: process.env.ODOVI_EXPECT_BROWSER_LOCALE === "1" },
  { issue: 31, contract: "readiness distinct from liveness", enforced: process.env.ODOVI_ACCEPTANCE_READINESS_PATH !== "/api/health" },
  { issue: 32, contract: "explicit provider-disabled UI and zero-default policy", enforced: process.env.ODOVI_EXPECT_PROVIDER_DISABLED_UI === "1" },
];

const manifest = {
  schemaVersion: 1,
  status,
  startedAt: process.env.ODOVI_ACCEPTANCE_STARTED_AT,
  finishedAt: new Date().toISOString(),
  gitCommit: process.env.ODOVI_ACCEPTANCE_GIT_COMMIT,
  version: process.env.ODOVI_ACCEPTANCE_VERSION,
  composeProject: process.env.ODOVI_ACCEPTANCE_PROJECT,
  images: {
    web: process.env.ODOVI_WEB_IMAGE,
    worker: process.env.ODOVI_WORKER_IMAGE,
    fixtures: process.env.ODOVI_FIXTURES_IMAGE,
  },
  baseUrl: process.env.ODOVI_ACCEPTANCE_BASE_URL,
  fixtureDay: process.env.ODOVI_ACCEPTANCE_DAY,
  readinessPath: process.env.ODOVI_ACCEPTANCE_READINESS_PATH,
  dependencyGates,
  evidence: {
    composeConfig: "compose-config.yml",
    composePs: "compose-ps.json",
    composeLogs: "compose.log",
    imageInspect: "image-inspect.json",
    egressSummary: "egress-summary.json",
    playwrightResults: [
      "playwright-journey.json",
      "playwright-coverage.json",
      "playwright-restart.json",
    ],
    playwrightReports: [
      "playwright-report/journey/index.html",
      "playwright-report/coverage/index.html",
      "playwright-report/restart/index.html",
    ],
  },
};

writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
