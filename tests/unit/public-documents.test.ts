import { afterEach, expect, it, vi } from "vitest";
import { readPublicDocument } from "../../src/lib/server/public-pages";

afterEach(() => vi.unstubAllGlobals());
function publicFetch(body: string | Uint8Array, contentType = "text/html") {
  const fetch = vi.fn(async (url: string) =>
    String(url).endsWith("/robots.txt")
      ? new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } })
      : new Response(body as BodyInit, { headers: { "Content-Type": contentType } }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("reads eligible content beyond previous byte/text caps and decodes entities", async () => {
  publicFetch(
    `<html><script>${"x".repeat(1_600_000)}</script><main>${"Text ".repeat(15_000)}<p>Grocery benefit &amp; conditions remain available for qualifying online shoppers.</p></main></html>`,
  );
  const document = await readPublicDocument("https://www.woolworths.co.za/content/test-large");
  expect(document.text.length).toBeGreaterThan(55_000);
  expect(document.text).toContain("Grocery benefit & conditions");
});
it("retains the bounded body limit and rejects unreadable JavaScript-only pages", async () => {
  publicFetch("x".repeat(2_500_001));
  await expect(readPublicDocument("https://www.makro.co.za/oversized")).rejects.toMatchObject({
    kind: "size",
  });
  publicFetch("<main>Please enable JavaScript to continue</main>");
  await expect(readPublicDocument("https://www.pnp.co.za/test-shell")).rejects.toThrow(
    "could not be read",
  );
});
it("does not fetch a source when its robots policy denies access", async () => {
  const fetch = vi.fn(
    async () =>
      new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(readPublicDocument("https://shopriteholdings.co.za/denied")).rejects.toThrow(
    "automated access",
  );
  expect(fetch).toHaveBeenCalledOnce();
});
it("extracts an actual text PDF using the bounded public-document path", async () => {
  const text =
    "Online grocery membership: free deliveries. Minimum basket R350. Monthly subscription R99. Terms and delivery coverage apply.";
  const content = `BT /F1 12 Tf 20 700 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  publicFetch(new TextEncoder().encode(pdf), "application/pdf");
  const document = await readPublicDocument("https://www.termsconditions.co.za/docs/test-only.pdf");
  expect(document.html).toBeNull();
  expect(document.text).toContain("Monthly subscription R99");
});
