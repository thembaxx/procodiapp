import { describe, expect, it } from "vitest";
import { blockingFindings } from "../../scripts/check-codeql.mjs";
import { assertDeploymentResponse } from "../../scripts/check-deployment.mjs";

describe("release security gate", () => {
  it("blocks high and critical findings while allowing medium findings", () => {
    const report = {
      runs: [
        {
          tool: {
            driver: {
              rules: [
                { id: "medium", properties: { "security-severity": "6.9" } },
                { id: "high", properties: { "security-severity": "7.0" } },
                { id: "critical", properties: { "security-severity": "9.8" } },
              ],
            },
          },
          results: [
            { ruleId: "medium" },
            { ruleId: "high" },
            { ruleIndex: 2 },
            { ruleId: "unknown", level: "error" },
          ],
        },
      ],
    };
    expect(blockingFindings(report)).toEqual(report.runs[0].results.slice(1));
  });

  it("refuses absent or malformed analysis instead of claiming success", () => {
    expect(() => blockingFindings({ runs: [] })).toThrow();
    expect(() => blockingFindings({ runs: [{}] })).toThrow();
    expect(blockingFindings({ runs: [{ tool: { driver: { rules: [] } }, results: [] }] })).toEqual(
      [],
    );
  });

  it("requires real storage readiness before promotion", () => {
    expect(() =>
      assertDeploymentResponse("/api/health", 200, "application/json", '{"status":"ready"}'),
    ).not.toThrow();
    expect(() =>
      assertDeploymentResponse("/api/health", 503, "application/json", '{"status":"unavailable"}'),
    ).toThrow();
    expect(() =>
      assertDeploymentResponse("/api/health", 200, "application/json", '{"status":"unavailable"}'),
    ).toThrow();
  });

  it("rejects login pages and broken public assets instead of promoting them", () => {
    expect(() => assertDeploymentResponse("/api/offers", 200, "text/html", "Sign in")).toThrow();
    expect(() => assertDeploymentResponse("/", 200, "text/html", "Sign in")).toThrow();
    expect(() => assertDeploymentResponse("/sw.js", 200, "text/html", "Missing")).toThrow();
    expect(() =>
      assertDeploymentResponse("/api/offers", 200, "application/json", '{"offers":[]}'),
    ).not.toThrow();
  });
});
