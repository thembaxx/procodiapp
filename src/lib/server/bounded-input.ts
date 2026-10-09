export class InputLimit extends Error {
  constructor(public kind: "size" | "timeout") {
    super(kind === "size" ? "Input is too large." : "Input deadline exceeded.");
  }
}

// A byte limit alone cannot stop a peer that never finishes sending its body.
export async function boundedText(
  input: { body: ReadableStream<Uint8Array> | null; headers: Headers },
  maximumBytes: number,
  timeoutMs = 8000,
): Promise<string> {
  if (Number(input.headers.get("content-length") ?? 0) > maximumBytes) throw new InputLimit("size");
  if (!input.body) return "";
  const reader = input.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maximumBytes) throw new InputLimit("size");
          chunks.push(value);
        }
        const body = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return new TextDecoder("utf-8", { fatal: true }).decode(body);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new InputLimit("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // Cancellation must not allow a hostile stream's cancel hook to hold the request open.
    void reader.cancel().catch(() => {});
  }
}

export async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  return JSON.parse(await boundedText(response, maximumBytes));
}
