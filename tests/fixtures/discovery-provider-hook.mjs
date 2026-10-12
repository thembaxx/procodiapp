import { writeFile } from "node:fs/promises";
const retailers = [
  ["Checkers Sixty60", "sixty60.co.za"],
  ["Pick n Pay asap!", "pnp.co.za"],
  ["Woolworths Dash", "woolworths.co.za"],
  ["Shoprite", "shoprite.co.za"],
  ["SPAR2U", "spar.co.za"],
  ["Makro", "makro.co.za"],
];
const text =
  "South African online grocery shoppers save R40 using WORKER40 on a basket of R400. This promotion ends on 2099-12-31. Delivery area exclusions and checkout eligibility apply.";
let searches = 0;
globalThis.fetch = async (target, options = {}) => {
  const url = String(target);
  if (url.startsWith("https://storage.example.invalid/rest/v1/")) {
    if (url.includes("rpc/cleanup_expired_data")) return Response.json(0);
    if (url.includes("rpc/take_refresh_slot")) return Response.json(0);
    if (options.method === "POST" && url.includes("promotion_cache")) {
      await writeFile(
        process.env.DISCOVERY_TEST_OUTPUT,
        JSON.stringify({ searches, record: JSON.parse(options.body) }),
      );
      return new Response(null, { status: 204 });
    }
    return Response.json([]);
  }
  if (url === "https://api.tavily.com/search") {
    searches++;
    const query = JSON.parse(options.body).query;
    const retailer = retailers.find(([name]) => query.includes(name));
    return Response.json({ results: [{ url: `https://www.${retailer[1]}/worker-promotion` }] });
  }
  if (url === "https://api.openai.com/v1/chat/completions") {
    const page = JSON.parse(JSON.parse(options.body).messages[1].content).sourceUrl;
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              offers: page.endsWith("/worker-promotion")
                ? [
                    {
                      code: "WORKER40",
                      type: "discount",
                      title: "Worker fixture grocery promotion",
                      criteria:
                        "South African online groceries; minimum basket R400; delivery area exclusions and checkout eligibility apply.",
                      expiresAt: "2099-12-31",
                      ongoing: false,
                      evidence:
                        "South African online grocery shoppers save R40 using WORKER40 on a basket of R400.",
                      expiryEvidence: "This promotion ends on 2099-12-31.",
                      codeEvidence: "save R40 using WORKER40 on a basket of R400.",
                      minBasketZar: 400,
                      newCustomersOnly: false,
                    },
                  ]
                : [],
            }),
          },
        },
      ],
    });
  }
  if (url.endsWith("/robots.txt"))
    return new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } });
  if (
    retailers.some(
      ([, host]) => new URL(url).hostname === host || new URL(url).hostname === `www.${host}`,
    )
  )
    return new Response(text, { headers: { "Content-Type": "text/html" } });
  throw new Error("Fixture blocked an unexpected network request.");
};
