import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BuildInfoCard,
  SECURITY_URL,
  SUPPORT_URL,
  type BuildInfoLabels,
} from "./BuildInfoCard";

const labels: BuildInfoLabels = {
  title: "About Odovi",
  version: "Version",
  build: "Build",
  copy: "Copy for support",
  copied: "Copied",
  supportTitle: "Support",
  supportDescription: "Best-effort support without a response-time SLA.",
  supportLink: "Open GitHub Issues",
  securityTitle: "Security",
  securityDescription: "Report vulnerabilities privately.",
  securityLink: "Open a private advisory",
};

describe("BuildInfoCard", () => {
  it("renders copyable release identity and the public support paths", () => {
    const html = renderToStaticMarkup(
      <BuildInfoCard
        buildInfo={{
          version: "0.2.0-rc.1",
          commit: "75f5917e8750",
          identity: "Odovi 0.2.0-rc.1 (75f5917e8750)",
        }}
        labels={labels}
      />,
    );

    expect(html).toContain("0.2.0-rc.1");
    expect(html).toContain("75f5917e8750");
    expect(html).toContain('data-testid="release-identity"');
    expect(html).toContain("Copy for support");
    expect(html).toContain(`href="${SUPPORT_URL}"`);
    expect(html).toContain(`href="${SECURITY_URL}"`);
    expect(html).toContain("Best-effort support without a response-time SLA.");
  });
});
