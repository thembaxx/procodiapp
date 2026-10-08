import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";

const nextRequire = createRequire(import.meta.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");
loadEnvConfig(process.cwd(), false);

const { values } = parseArgs({ options: { port: { type: "string" } } });
const port = values.port ?? process.env.PORT ?? "3000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("Invalid port.");

const server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: "0.0.0.0",
    DATA_DIR: path.resolve(process.env.DATA_DIR ?? ".data"),
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
