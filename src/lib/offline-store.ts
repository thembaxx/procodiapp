import { z } from "zod";
import { offerSchema, type OffersResponse } from "./offers";

const snapshotSchema = z.object({
  offers: z.array(offerSchema).max(500),
  updatedAt: z.string().nullable(),
  checks: z.array(
    z.object({
      storeId: z.string(),
      status: z.enum(["checked", "unavailable"]),
      pages: z.number(),
      message: z.string().optional(),
    }),
  ),
  newOfferIds: z.array(z.string()),
  mode: z.enum(["public_pages", "web_search"]),
});

export const emptyOffers: OffersResponse = {
  offers: [],
  updatedAt: null,
  checks: [],
  newOfferIds: [],
  mode: "public_pages",
};

export function parseOffers(value: unknown): OffersResponse | null {
  const result = snapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("grocery-device", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Device storage is busy."));
  });
}

export async function saveOfflineOffers(data: OffersResponse): Promise<boolean> {
  let database: IDBDatabase | undefined;
  try {
    const parsed = parseOffers(data);
    if (!parsed) return false;
    database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put({ data: parsed, savedAt: Date.now() }, "latest");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch {
    // Browsing and saving bookmarks still work if device storage is unavailable.
    return false;
  } finally {
    database?.close();
  }
}

export async function readOfflineOffers(): Promise<{
  data: OffersResponse;
  savedAt: number;
} | null> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const record = await new Promise<unknown>((resolve, reject) => {
      const request = database!.transaction("snapshots").objectStore("snapshots").get("latest");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!record || typeof record !== "object" || !("data" in record) || !("savedAt" in record))
      return null;
    const data = parseOffers(record.data);
    return data && typeof record.savedAt === "number" && Number.isFinite(record.savedAt)
      ? { data, savedAt: record.savedAt }
      : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}
