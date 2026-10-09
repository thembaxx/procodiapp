import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? files(filename) : [filename];
    }),
  );
  return children.flat();
}

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const assets = (await files(".next/static"))
  .filter((filename) => /\.(js|css|woff2)$/.test(filename))
  .map((filename) => "/_next/" + path.relative(".next", filename).split(path.sep).join("/"));
const publicFiles = ["public/fonts", "public/icons"];
for (const directory of publicFiles)
  assets.push(
    ...(await files(directory))
      .filter((filename) => /\.(woff2|png)$/.test(filename))
      .map((filename) => "/" + path.relative("public", filename).split(path.sep).join("/")),
  );
assets.push("/offline", "/icon.svg", "/manifest.webmanifest");
for (const theme of ["dark", "light"])
  for (const design of ["wallet", "rewards", "orbit"])
    assets.push(`/manifest.webmanifest?theme=${theme}&design=${design}`);
const source = await readFile("src/service-worker.js", "utf8");
await writeFile(
  "public/sw.js",
  source
    .replace('"__GROCERY_BUILD__"', JSON.stringify(buildId))
    .replace('"__GROCERY_ASSETS__"', JSON.stringify(JSON.stringify(assets.sort()))),
);
console.log(`Prepared offline shell with ${assets.length} assets.`);
