// Temporary runner diagnostic: reports fixed categories, never provider text or credentials.
const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.log(JSON.stringify({ probe: "configuration", result: "missing-key" }));
  process.exit(1);
}
const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const codes = new Set([
  "INVALID_ARGUMENT",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "INTERNAL",
  "API_KEY_INVALID",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "SERVICE_DISABLED",
  "BILLING_DISABLED",
  "CONSUMER_INVALID",
  "FAILED_PRECONDITION",
]);
let stop = false;
let grounded = false;
async function probe(label, route, body) {
  if (stop) return null;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/${route}`, {
      method: body ? "POST" : "GET",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const chunks = [];
    let bytes = 0;
    const reader = response.body?.getReader();
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 50_000) {
          await reader.cancel();
          throw new Error("oversized");
        }
        chunks.push(value);
      }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const errorCodes = [
      data.error?.status,
      ...(data.error?.details ?? []).map((x) => x.reason),
    ].filter((code) => codes.has(code));
    const message = typeof data.error?.message === "string" ? data.error.message : "";
    const categories = [];
    if (/model.*not found|not found.*model|not supported.*generatecontent/i.test(message))
      categories.push("model-or-operation-unavailable");
    if (/free tier.*not available|free.?tier.*unavailable|not eligible.*free/i.test(message))
      categories.push("free-tier-unavailable");
    if (/location|region|country/i.test(message)) categories.push("location-related");
    if (/api.?key.*not valid|api.?key.*blocked|api.?key.*leaked/i.test(message))
      categories.push("key-rejected");
    if (/billing|payment/i.test(message)) categories.push("billing-related");
    const candidate = data.candidates?.[0];
    const search = candidate?.groundingMetadata;
    const groundedResponse = !!(
      search?.webSearchQueries?.length && search?.groundingChunks?.length
    );
    const contextResults = (data.steps ?? []).filter((step) => step.type === "url_context_result");
    console.log(
      JSON.stringify({
        probe: label,
        http: response.status,
        ...(errorCodes.length ? { codes: [...new Set(errorCodes)] } : {}),
        ...(categories.length ? { categories } : {}),
        ...(candidate
          ? {
              hasText: !!candidate.content?.parts?.some(
                (p) => typeof p.text === "string" && !p.thought,
              ),
              grounded: groundedResponse,
            }
          : {}),
        ...(data.models
          ? {
              listed: models.filter((model) =>
                data.models.some(
                  (item) =>
                    item.name === `models/${model}` &&
                    item.supportedGenerationMethods?.includes("generateContent"),
                ),
              ),
            }
          : {}),
        ...(data.steps
          ? {
              interactionCompleted: data.status === "completed",
              contextResults: contextResults.length,
              contextItems: contextResults.reduce(
                (count, step) => count + (Array.isArray(step.result) ? step.result.length : 0),
                0,
              ),
            }
          : {}),
      }),
    );
    if ([401, 403, 429].includes(response.status) || response.status >= 500) stop = true;
    return { ok: response.ok, status: response.status, grounded: groundedResponse };
  } catch {
    console.log(JSON.stringify({ probe: label, result: "network-or-response-failure" }));
    stop = true;
    return null;
  }
}
await probe(
  "model-list",
  "v1beta/models?pageSize=100&fields=models(name,supportedGenerationMethods)",
);
for (const model of models) {
  const basicBody = {
    contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
    generationConfig: { maxOutputTokens: 32 },
  };
  const basic = await probe(
    `${model}:basic:v1beta`,
    `v1beta/models/${model}:generateContent`,
    basicBody,
  );
  if (basic?.status === 404)
    await probe(`${model}:basic:v1`, `v1/models/${model}:generateContent`, basicBody);
  if (basic?.ok) {
    const result = await probe(
      `${model}:grounding:v1beta`,
      `v1beta/models/${model}:generateContent`,
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Use Google Search to find Pick n Pay South Africa's official website. Reply with the URL only.",
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    );
    grounded ||= !!(result?.ok && result.grounded);
  }
}
const current = await probe("gemini-3.8-flash:url-context:interactions", "v1beta/interactions", {
  model: "gemini-3.8-flash",
  store: false,
  input:
    "Use URL context to read https://www.pnp.co.za/asap and identify any official promotion or terms links on that page. Reply with at most three URLs, or none if unavailable.",
  tools: [{ type: "url_context" }],
  generation_config: { max_output_tokens: 1024, thinking_level: "minimal" },
});
process.exitCode = grounded || current?.ok ? 0 : 1;
