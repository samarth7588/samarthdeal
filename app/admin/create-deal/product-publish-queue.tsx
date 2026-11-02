"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import {
  enqueueProductPublishJob,
  getProductPublishJobs,
  retryProductPublishJob,
} from "./product-publish-queue-actions";
import {
  compressProductImage,
  imageFingerprint,
} from "./product-image-optimization";
import {
  addLocalProductPublishJob,
  getLocalProductPublishJobs,
  updateLocalProductPublishJob,
  type LocalProductPublishJob,
  type LocalPublishState,
} from "./product-publish-queue-store";

const uploadTimeoutMs = 30_000;
const maxConcurrentUploads = 3;

async function timeQueueOperation<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    console.info("Product publishing timing", {
      operation: label,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
}

function subscribeToNetworkChanges(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getNetworkStatus() {
  return navigator.onLine;
}

function getServerNetworkStatus() {
  return true;
}

type ServerJob = {
  id: string;
  image_url: string;
  description: string;
  state: "queued" | "processing" | "published" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

function statusLabel(status: LocalPublishState | "processing") {
  switch (status) {
    case "waiting": return "Waiting";
    case "uploading": return "Uploading image";
    case "saving": return "Saving product";
    case "processing": return "Saving product";
    case "published": return "Published";
    case "failed": return "Failed";
  }
}

function QueueImage({ job }: { job: LocalProductPublishJob }) {
  const [previewUrl] = useState(() =>
    job.imageFile.size > 0 ? URL.createObjectURL(job.imageFile) : null,
  );
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const src = previewUrl ?? job.imageUrl;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className="h-14 w-14 rounded-lg bg-slate-100 object-contain" src={src} />
  ) : (
    <span aria-hidden="true" className="h-14 w-14 rounded-lg bg-slate-100" />
  );
}

export default function ProductPublishQueue({
  onQueueProductRef,
}: {
  onQueueProductRef: (enqueue: (formData: FormData, imageFile: File) => Promise<void>) => void;
}) {
  const [localJobs, setLocalJobs] = useState<LocalProductPublishJob[]>([]);
  const [serverJobs, setServerJobs] = useState<ServerJob[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const isOnline = useSyncExternalStore(
    subscribeToNetworkChanges,
    getNetworkStatus,
    getServerNetworkStatus,
  );
  const [queueError, setQueueError] = useState<string | null>(null);
  const [storagePersistenceWarning, setStoragePersistenceWarning] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const refreshingServerJobs = useRef(false);
  const mounted = useRef(true);
  const router = useRouter();
  const initializedPublishedIds = useRef(false);
  const knownPublishedIds = useRef(new Set<string>());

  const updateLocalJob = useCallback(async (
    id: string,
    update: Partial<LocalProductPublishJob>,
  ) => {
    await updateLocalProductPublishJob(id, update);
    if (!mounted.current) return;
    const updatedAt = new Date().toISOString();
    setLocalJobs((jobs) => jobs.map((job) =>
      job.id === id ? { ...job, ...update, updatedAt } : job,
    ));
  }, []);

  const refreshServerJobs = useCallback(async () => {
    if (refreshingServerJobs.current) return;
    refreshingServerJobs.current = true;
    try {
      const result = await getProductPublishJobs();
      if (!mounted.current) return;
      if (result.errorMessage) {
        setQueueError(result.errorMessage);
        return;
      }
      setQueueError(null);
      setServerJobs(result.jobs as ServerJob[]);
    } catch (error) {
      console.error("Unable to refresh the server publishing queue.", error);
      if (mounted.current) setQueueError("Unable to refresh the server publishing queue.");
    } finally {
      refreshingServerJobs.current = false;
    }
  }, []);

  const wakeWorker = useCallback(() => {
    const startedAt = performance.now();
    void fetch("/api/admin/product-publish-queue/wake", {
      method: "POST",
      keepalive: true,
    }).then(async (response) => {
      if (response.ok || !mounted.current) return;
      const body: unknown = await response.json().catch(() => null);
      const message = body && typeof body === "object" && "error" in body &&
        typeof body.error === "string"
        ? body.error
        : "The product was queued, but the server worker could not be started.";
      setQueueError(message);
    }).catch((error: unknown) => {
      if (!mounted.current) return;
      console.error("Unable to wake the product publishing worker.", error);
      setQueueError("The product is safely queued and the server worker will retry.");
    }).finally(() => {
      console.info("Product publishing timing", {
        operation: "worker-wake",
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
  }, []);

  const processJob = useCallback(async (job: LocalProductPublishJob) => {
    await updateLocalJob(job.id, {
      state: "uploading",
      errorMessage: null,
    });

    let imageUrl = job.imageUrl;
    if (!imageUrl) {
      const sourceFile = new File([job.imageFile], job.imageFileName, {
        type: job.imageFile.type,
      });
      const optimizedFile = await timeQueueOperation("queued-image-compression", () =>
        compressProductImage(sourceFile),
      );
      const fingerprint = await timeQueueOperation("queued-image-fingerprint", () =>
        imageFingerprint(optimizedFile),
      );
      const uploadData = new FormData();
      uploadData.set("image", optimizedFile);
      uploadData.set("fingerprint", fingerprint);
      const response = await timeQueueOperation("queued-image-upload", () =>
        fetch("/api/admin/product-publish-queue/image", {
          method: "POST",
          body: uploadData,
          credentials: "same-origin",
          signal: AbortSignal.timeout(uploadTimeoutMs),
        }),
      );
      const responseBody: unknown = await response.json();
      if (!response.ok) {
        const message = responseBody && typeof responseBody === "object" &&
          "error" in responseBody && typeof responseBody.error === "string"
          ? responseBody.error
          : `Image upload failed with HTTP ${response.status}.`;
        throw new Error(`Image upload failed: ${message}`);
      }
      if (
        !responseBody ||
        typeof responseBody !== "object" ||
        !("imageUrl" in responseBody) ||
        typeof responseBody.imageUrl !== "string"
      ) {
        throw new Error("Image upload failed: the server returned an invalid image URL.");
      }
      imageUrl = responseBody.imageUrl;
      await timeQueueOperation("persist-uploaded-image-reference", () =>
        updateLocalJob(job.id, {
          imageUrl,
          imageFile: new Blob(),
          imageFileName: "",
        }),
      );
    }

    await updateLocalJob(job.id, { state: "saving" });
    const uploadedImageUrl = imageUrl;
    if (!uploadedImageUrl) {
      throw new Error("The queued product has no uploaded image URL.");
    }
    const result = await timeQueueOperation("server-queue-insert", () =>
      enqueueProductPublishJob({
        id: job.id,
        imageUrl: uploadedImageUrl,
        description: job.description,
        status: job.status,
        productName: job.productName,
        brand: job.brand,
        platform: job.platform,
        orderPrice: job.orderPrice,
        lessPrice: job.lessPrice,
        rating: job.rating,
      }),
    );
    if (result.errorMessage) throw new Error(result.errorMessage);
    wakeWorker();
  }, [updateLocalJob, wakeWorker]);

  const enqueueProduct = useCallback(async (formData: FormData, imageFile: File) => {
    const description = String(formData.get("details") ?? "");
    const uploadedImageUrl = String(formData.get("imageUrl") ?? "").trim();
    const id = crypto.randomUUID();
    const job: LocalProductPublishJob = {
      id,
      imageFile: uploadedImageUrl ? new Blob() : imageFile,
      imageFileName: uploadedImageUrl ? "" : imageFile.name,
      imageUrl: uploadedImageUrl || null,
      description,
      status: String(formData.get("status") ?? "live") as LocalProductPublishJob["status"],
      productName: String(formData.get("productName") ?? ""),
      brand: String(formData.get("brand") ?? ""),
      platform: String(formData.get("platform") ?? ""),
      orderPrice: String(formData.get("orderPrice") ?? ""),
      lessPrice: String(formData.get("lessPrice") ?? ""),
      rating: String(formData.get("rating") ?? ""),
      state: "waiting",
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await addLocalProductPublishJob(job);
    setQueueError(null);
    setQueueError(null);
    setLocalJobs((jobs) => [...jobs, job].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ));
    if (navigator.storage?.persist) {
      void navigator.storage.persist().then((persisted) => {
        if (!persisted) {
          setStoragePersistenceWarning(
            "The browser may clear queued images if device storage is under pressure. Keep the admin panel open until uploads finish.",
          );
        } else {
          setStoragePersistenceWarning(null);
        }
      }).catch((error: unknown) => {
        console.error("Unable to request persistent browser storage.", error);
        setStoragePersistenceWarning("Browser storage persistence could not be confirmed.");
      });
    }
  }, []);

  const retryJob = useCallback(async (job: LocalProductPublishJob) => {
    const remoteJob = serverJobs.find((serverJob) => serverJob.id === job.id);
    if (remoteJob) {
      const result = await retryProductPublishJob(job.id);
      if (result.errorMessage) {
        setQueueError(result.errorMessage);
        return;
      }
      await updateLocalJob(job.id, { state: "saving", errorMessage: null });
      setServerJobs((jobs) => jobs.map((serverJob) =>
        serverJob.id === job.id
          ? { ...serverJob, state: "queued", attempts: 0, last_error: null }
          : serverJob,
      ));
      wakeWorker();
      return;
    }

    await updateLocalJob(job.id, { state: "waiting", errorMessage: null });
  }, [serverJobs, updateLocalJob, wakeWorker]);

  useEffect(() => {
    mounted.current = true;
    void getLocalProductPublishJobs()
      .then(async (savedJobs) => {
        const recovered: LocalProductPublishJob[] = [];
        for (const job of savedJobs) {
          if (job.state === "uploading" || job.state === "saving") {
            await updateLocalProductPublishJob(job.id, { state: "waiting" });
            recovered.push({ ...job, state: "waiting" });
          } else {
            recovered.push(job);
          }
        }
        setLocalJobs(recovered.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        setIsLoaded(true);
        void refreshServerJobs();
      })
      .catch((error: unknown) => {
        console.error("Unable to restore the product publishing queue.", error);
        setQueueError(error instanceof Error ? error.message : "Unable to restore the saved queue.");
        setIsLoaded(true);
      });

    return () => {
      mounted.current = false;
    };
  }, [refreshServerJobs]);

  useEffect(() => {
    onQueueProductRef(enqueueProduct);
  }, [enqueueProduct, onQueueProductRef]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = window.setInterval(() => void refreshServerJobs(), 5_000);
    return () => window.clearInterval(timer);
  }, [isLoaded, refreshServerJobs]);

  useEffect(() => {
    if (!initializedPublishedIds.current) {
      for (const job of serverJobs) {
        if (job.state === "published") knownPublishedIds.current.add(job.id);
      }
      initializedPublishedIds.current = true;
      return;
    }

    const newlyPublished = serverJobs.some((job) => {
      if (job.state !== "published" || knownPublishedIds.current.has(job.id)) return false;
      knownPublishedIds.current.add(job.id);
      return true;
    });
    if (newlyPublished) router.refresh();
  }, [router, serverJobs]);

  useEffect(() => {
    if (!isLoaded || !isOnline) return;
    const availableSlots = maxConcurrentUploads - inFlight.current.size;
    const waiting = localJobs.filter((job) =>
      job.state === "waiting" && !inFlight.current.has(job.id),
    ).slice(0, Math.max(0, availableSlots));

    for (const job of waiting) {
      inFlight.current.add(job.id);
      void processJob(job)
        .catch(async (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : "Product publishing failed.";
          console.error(`Unable to process queued product ${job.id}.`, error);
          try {
            await updateLocalJob(job.id, { state: "failed", errorMessage });
          } catch (persistError) {
            console.error(`Unable to save failure state for queued product ${job.id}.`, persistError);
            setQueueError("A product failed and its failure status could not be saved locally.");
          }
        })
        .finally(() => {
          inFlight.current.delete(job.id);
        });
    }
  }, [isLoaded, isOnline, localJobs, processJob, updateLocalJob]);

  const displayJobs = useMemo(() => {
    const localIds = new Set(localJobs.map((job) => job.id));
    const local = localJobs.map((job) => {
      const serverJob = serverJobs.find((item) => item.id === job.id);
      const state: LocalPublishState | "processing" = serverJob
        ? serverJob.state === "queued"
          ? "waiting"
          : serverJob.state
        : job.state;
      return { job, state, error: serverJob?.last_error ?? job.errorMessage };
    });
    const remoteOnly = serverJobs
      .filter((job) => !localIds.has(job.id))
      .map((job) => ({
        job: {
          id: job.id,
          description: job.description,
          imageFile: new Blob(),
          imageFileName: "",
          imageUrl: job.image_url,
          state: job.state === "processing"
            ? "saving"
            : job.state === "queued"
              ? "waiting"
              : job.state,
          createdAt: job.created_at,
          errorMessage: job.last_error,
        } as LocalProductPublishJob,
        state: job.state === "processing"
          ? "processing" as const
          : job.state === "queued"
            ? "waiting" as const
            : job.state,
        error: job.last_error,
      }));
    return [...local, ...remoteOnly].sort((a, b) =>
      b.job.createdAt.localeCompare(a.job.createdAt),
    );
  }, [localJobs, serverJobs]);

  const counts = displayJobs.reduce((total, item) => {
    if (item.state === "published") total.success += 1;
    else if (item.state === "failed") total.failed += 1;
    else if (item.state === "uploading" || item.state === "saving" || item.state === "processing") {
      total.processing += 1;
    } else total.pending += 1;
    return total;
  }, { pending: 0, processing: 0, success: 0, failed: 0 });

  return (
    <section aria-label="Product publishing queue" className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Background publishing</p>
          <h2 className="mt-2 text-xl font-black tracking-tight">Publishing queue</h2>
        </div>
        <div aria-live="polite" className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">Waiting {counts.pending}</span>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-800">Processing {counts.processing}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">Published {counts.success}</span>
          <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-800">Failed {counts.failed}</span>
        </div>
      </div>
      {!isOnline && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Offline. Queued products are saved on this device and will resume when connection returns.</p>}
      {storagePersistenceWarning && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{storagePersistenceWarning}</p>}
      {queueError && <p aria-live="polite" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{queueError}</p>}
      {displayJobs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{isLoaded ? "No products in the publishing queue." : "Restoring saved queue…"}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {displayJobs.map(({ job, state, error }) => (
            <article className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3" key={job.id}>
              <QueueImage job={job} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
                  {job.description.slice(0, 180)}
                </p>
                <p className={`mt-1 text-xs font-black ${
                  state === "published" ? "text-emerald-700" :
                    state === "failed" ? "text-rose-700" :
                      state === "processing" || state === "uploading" || state === "saving"
                        ? "text-blue-700"
                        : "text-slate-600"
                }`}>
                  {statusLabel(state)}
                </p>
                {error && <p className="mt-1 break-words text-xs text-rose-700">{error}</p>}
              </div>
              {state === "failed" && (
                <button
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    const localJob = localJobs.find((item) => item.id === job.id);
                    if (localJob) void retryJob(localJob);
                    else void retryProductPublishJob(job.id).then((result) => {
                      if (result.errorMessage) setQueueError(result.errorMessage);
                      else {
                        wakeWorker();
                        void refreshServerJobs();
                      }
                    });
                  }}
                  type="button"
                >
                  Retry
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
