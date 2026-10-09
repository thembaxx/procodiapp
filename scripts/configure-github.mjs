import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const repository = "thembaxx/procodiapp";
const prefix = `repos/${repository}`;
const apply = process.argv.includes("--apply");
const ruleset = JSON.parse(
  await readFile(new URL("../.github/main-ruleset.json", import.meta.url)),
);
let failed = false;

function request(method, endpoint, body) {
  const args = ["api", endpoint, "--method", method];
  if (body !== undefined) args.push("--input", "-");
  const result = spawnSync("gh", args, {
    input: body === undefined ? undefined : JSON.stringify(body),
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0) {
    const status = result.stderr.match(/HTTP \d{3}/)?.[0] ?? "request failed";
    console.error(`BLOCKED ${method} ${endpoint}: ${status}`);
    failed = true;
    return null;
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

const settings = [
  {
    method: "PATCH",
    endpoint: prefix,
    body: {
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
      allow_auto_merge: true,
      security_and_analysis: {
        secret_scanning: { status: "enabled" },
        secret_scanning_push_protection: { status: "enabled" },
      },
    },
  },
  { method: "PUT", endpoint: `${prefix}/vulnerability-alerts` },
  { method: "PUT", endpoint: `${prefix}/automated-security-fixes` },
  { method: "PUT", endpoint: `${prefix}/private-vulnerability-reporting` },
  {
    method: "PUT",
    endpoint: `${prefix}/actions/permissions/workflow`,
    body: { default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
  },
];
if (!apply) {
  console.log(
    "Review .github/main-ruleset.json before applying with an admin-authorized gh session.",
  );
  console.log(
    "No bypass: one independent code-owner approval; authors cannot approve their own PRs.",
  );
  console.log("Add a trusted collaborator to CODEOWNERS before owner-authored work needs merging.");
  console.log(
    `Ruleset: ${ruleset.name}, active on main, required check: CI gate (GitHub Actions).`,
  );
  for (const setting of settings) console.log(`${setting.method} ${setting.endpoint}`);
  console.log("Run: node scripts/configure-github.mjs --apply");
} else {
  // Add one managed ruleset; never replace or disable an existing protection rule.
  const existing = request("GET", `${prefix}/rulesets`);
  if (Array.isArray(existing)) {
    const managed = existing.find((entry) => entry.name === ruleset.name);
    if (managed) {
      const current = request("GET", `${prefix}/rulesets/${managed.id}`);
      // Do not overwrite a managed rule the owner may have strengthened by hand.
      if (current) console.log(`EXISTS ${ruleset.name}; inspect it in GitHub before editing.`);
    } else {
      const created = request("POST", `${prefix}/rulesets`, ruleset);
      if (created) console.log(`APPLIED ruleset ${created.id}`);
    }
  }
  for (const setting of settings) {
    if (request(setting.method, setting.endpoint, setting.body))
      console.log(`APPLIED ${setting.method} ${setting.endpoint}`);
  }
  if (failed) {
    console.error(
      "Some administration changes were denied. Do not describe protection as enabled.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "Administration requests completed. Verify enforcement and checks in repository settings.",
    );
  }
}
