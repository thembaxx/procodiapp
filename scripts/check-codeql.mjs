import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export function blockingFindings(report) {
  if (!Array.isArray(report.runs) || !report.runs.length) throw new Error("No CodeQL runs found.");
  return report.runs.flatMap((run) => {
    const rules = run.tool?.driver?.rules;
    if (!Array.isArray(rules) || !Array.isArray(run.results))
      throw new Error("Malformed CodeQL results.");
    return run.results.filter((result) => {
      const rule = rules.find((entry) => entry.id === result.ruleId) ?? rules[result.ruleIndex];
      const severity = Number(rule?.properties?.["security-severity"] ?? 0);
      return severity >= 7 || result.level === "error";
    });
  });
}

if (import.meta.main) {
  try {
    const directory = process.argv[2];
    if (!directory) throw new Error("Supply the CodeQL SARIF directory.");
    const files = (await readdir(directory)).filter((file) => file.endsWith(".sarif"));
    if (!files.length) throw new Error("No SARIF files found; refusing an empty security gate.");
    let count = 0;
    for (const file of files) {
      const report = JSON.parse(await readFile(path.join(directory, file), "utf8"));
      count += blockingFindings(report).length;
    }
    if (count)
      throw new Error(`${count} high/critical or error-level CodeQL findings need review.`);
    console.log("No blocking CodeQL findings.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CodeQL gate failed.");
    process.exitCode = 1;
  }
}
