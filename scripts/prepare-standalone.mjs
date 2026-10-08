import { cp } from "node:fs/promises";

// Next's standalone server expects these assets beside the generated server.
await cp("public", ".next/standalone/public", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
