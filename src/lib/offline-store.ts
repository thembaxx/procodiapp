import { offersResponseSchema, type OffersResponse } from "./offers";

export const emptyOffers: OffersResponse = {
  offers: [],
  updatedAt: null,
  checks: [],
  newOfferIds: [],
  mode: "public_pages",
};

export function parseOffers(value: unknown): OffersResponse | null {
  const result = offersResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("grocery-device", 1);
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error("Device storage timed out."));
    }, 1500);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => {
      if (finished) {
        request.result.close();
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve(request.result);
    };
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error("Device storage is busy."));
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
      const timer = setTimeout(() => {
        try {
          transaction.abort();
        } catch {
          /* The transaction may already be closed. */
        }
        reject(new Error("Device storage timed out."));
      }, 1500);
      transaction.objectStore("snapshots").put({ data: parsed, savedAt: Date.now() }, "latest");
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve();
      };
      transaction.onerror = () => {
        clearTimeout(timer);
        reject(transaction.error);
      };
      transaction.onabort = () => {
        clearTimeout(timer);
        reject(transaction.error);
      };
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
      const transaction = database!.transaction("snapshots");
      const timer = setTimeout(() => {
        try {
          transaction.abort();
        } catch {
          /* The transaction may already be closed. */
        }
        reject(new Error("Device storage timed out."));
      }, 1500);
      const request = transaction.objectStore("snapshots").get("latest");
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      transaction.onabort = () => {
        clearTimeout(timer);
        reject(transaction.error);
      };
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
