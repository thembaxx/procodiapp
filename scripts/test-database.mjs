// Only use an isolated test container. This creates test roles and fixture rows.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const container = process.env.DATABASE_CONTAINER;
if (!container || !/^[a-zA-Z0-9_-]+$/.test(container))
  throw new Error("Set DATABASE_CONTAINER to an isolated PostgreSQL test container.");
const args = ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
function sql(input) {
  return execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}
sql(`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end; $$;`);
const schema = await readFile("supabase/schema.sql", "utf8");
sql(schema);
sql(schema);
sql(await readFile("tests/security/storage.sql", "utf8"));
for (const role of ["anon", "authenticated"]) {
  let refused = false;
  try {
    sql(`set role ${role}; select * from public.promotion_reports;`);
  } catch (error) {
    refused = String(error.stderr).includes("permission denied");
  }
  if (!refused) throw new Error(`${role} could read reports.`);
}
const key = randomBytes(32).toString("hex");
const attempts = await Promise.all(
  Array.from(
    { length: 12 },
    () =>
      new Promise((resolve, reject) => {
        const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", (value) => {
          output += value;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(Number(output.trim()))
            : reject(new Error("Concurrent limiter attempt failed.")),
        );
        child.stdin.end(`select public.take_refresh_slot('${key}',60);`);
      }),
  ),
);
if (
  attempts.filter((value) => value === 0).length !== 1 ||
  attempts.some((value) => !Number.isInteger(value) || value < 0 || value > 60)
)
  throw new Error("Distributed limiter was not atomic.");
sql(`delete from public.refresh_limits where client_key='${key}';`);
console.log(
  "PostgreSQL: repeatable migration, RLS/permissions, retention, bounded RPCs and 12-way limiter concurrency passed.",
);
