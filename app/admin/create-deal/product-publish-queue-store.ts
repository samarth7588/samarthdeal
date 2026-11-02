export type LocalPublishState = "waiting" | "uploading" | "saving" | "published" | "failed";

export type LocalProductPublishJob = {
  id: string;
  imageFile: Blob;
  imageFileName: string;
  imageUrl: string | null;
  description: string;
  status: "draft" | "live" | "over";
  productName: string;
  brand: string;
  platform: string;
  orderPrice: string;
  lessPrice: string;
  rating: string;
  state: LocalPublishState;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

const databaseName = "samarth-deals-product-publish";
const storeName = "jobs";
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Persistent browser storage is unavailable in this browser."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the local product queue."));
    request.onblocked = () => reject(new Error("The local product queue is blocked by another browser tab."));
  });
  return databasePromise;
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to update the local product queue."));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("Unable to update the local product queue."));
    tx.onabort = () => reject(tx.error ?? new Error("The local product queue update was aborted."));
  });
}

export function addLocalProductPublishJob(job: LocalProductPublishJob) {
  return transaction("readwrite", (store) => store.add(job));
}

export function getLocalProductPublishJobs() {
  return transaction("readonly", (store) => store.getAll()) as Promise<LocalProductPublishJob[]>;
}

export function updateLocalProductPublishJob(
  id: string,
  update: Partial<LocalProductPublishJob>,
) {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const tx = database.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) {
        reject(new Error("The queued product is no longer available on this device."));
        tx.abort();
        return;
      }
      store.put({ ...request.result, ...update, updatedAt: new Date().toISOString() });
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Unable to read the queued product."));
      tx.abort();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Unable to save the queued product."));
    tx.onabort = () => reject(tx.error ?? new Error("The queued product update was aborted."));
  }));
}
