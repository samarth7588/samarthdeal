"use client";

import { useEffect, useRef, useState } from "react";

import { getOrderFormPostStatus, type OrderFormSlotAvailability } from "../_lib/order-form-slots";

export default function ProductPostSlotCount({
  formUrl,
  className = "mt-2",
  currentStatus,
  onStatusDetected,
}: {
  formUrl: string | null;
  className?: string;
  currentStatus?: "draft" | "live" | "over";
  onStatusDetected?: (status: "live" | "over") => void;
}) {
  const [availability, setAvailability] =
    useState<OrderFormSlotAvailability | null>(null);
  const [availabilityUrl, setAvailabilityUrl] = useState<string | null>(null);
  const [unavailableUrl, setUnavailableUrl] = useState<string | null>(null);
  const [visibleFormUrl, setVisibleFormUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onStatusDetectedRef = useRef(onStatusDetected);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !formUrl) return;

    if (typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setVisibleFormUrl(formUrl));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleFormUrl(formUrl);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(container);

    return () => observer.disconnect();
  }, [formUrl]);

  useEffect(() => {
    onStatusDetectedRef.current = onStatusDetected;
  }, [onStatusDetected]);

  useEffect(() => {
    if (!formUrl || visibleFormUrl !== formUrl) return;

    const requestedFormUrl = formUrl;
    const controller = new AbortController();
    let active = true;

    async function loadSlots() {
      function markUnavailable() {
        setAvailability(null);
        setAvailabilityUrl(requestedFormUrl);
        setUnavailableUrl(requestedFormUrl);
        onStatusDetectedRef.current?.("over");
      }

      try {
        const response = await fetch(
          `/api/product-post-slots?url=${encodeURIComponent(requestedFormUrl)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          if (active) markUnavailable();
          return;
        }

        const result: unknown = await response.json();
        if (!active || !isSlotResponseForUrl(result, requestedFormUrl)) {
          if (active) {
            markUnavailable();
          }
          return;
        }

        const slots = result.slots;
        if (!slots || slots.slots.length === 0) {
          markUnavailable();
          return;
        }

        setAvailability(slots && slots.slots.length > 0 ? slots : null);
        setAvailabilityUrl(requestedFormUrl);
        setUnavailableUrl(null);
        const detectedStatus = getOrderFormPostStatus(slots);
        if (detectedStatus && detectedStatus !== currentStatus) {
          onStatusDetectedRef.current?.(detectedStatus);
        }
      } catch {
        if (!controller.signal.aborted && active) {
          markUnavailable();
        }
      }
    }

    void loadSlots();
    const refreshTimer = window.setInterval(() => void loadSlots(), 30_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      controller.abort();
    };
  }, [currentStatus, formUrl, visibleFormUrl]);

  if (!formUrl) return null;
  const currentAvailability = availabilityUrl === formUrl ? availability : null;
  const unavailable = unavailableUrl === formUrl;

  return (
    <div
      aria-live="polite"
      className={`${className} flex flex-wrap gap-1.5`}
      ref={containerRef}
    >
      {visibleFormUrl !== formUrl ? (
        <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 md:text-xs">
          Slots load when visible
        </span>
      ) : currentAvailability
        ? currentAvailability.slots.map((slot) => (
          <span
            className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide md:text-xs ${
              slot.availableSlots > 0
                ? "bg-sky-100 text-sky-800"
                : "bg-rose-50 text-rose-700"
            }`}
            key={slot.dealType}
          >
            {slot.dealType}: {slot.availableSlots} {slot.availableSlots === 1 ? "slot" : "slots"}
          </span>
        ))
        : (
          <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 md:text-xs">
            {unavailable ? "Slots unavailable" : "Checking slots…"}
          </span>
        )}
    </div>
  );
}

function isSlotResponseForUrl(
  value: unknown,
  requestedFormUrl: string,
): value is { slots: OrderFormSlotAvailability | null } {
  if (!value || typeof value !== "object" || !("slots" in value)) return false;
  const slots = value.slots;
  if (slots === null) return true;
  if (!slots || typeof slots !== "object" || !("formUrl" in slots) || !("slots" in slots)) {
    return false;
  }

  try {
    if (
      typeof slots.formUrl !== "string" ||
      new URL(slots.formUrl).toString() !== new URL(requestedFormUrl).toString() ||
      !Array.isArray(slots.slots)
    ) {
      return false;
    }
    return slots.slots.every(
      (slot) =>
        slot &&
        typeof slot === "object" &&
        "dealType" in slot &&
        typeof slot.dealType === "string" &&
        "availableSlots" in slot &&
        typeof slot.availableSlots === "number" &&
        Number.isSafeInteger(slot.availableSlots) &&
        slot.availableSlots >= 0,
    );
  } catch {
    return false;
  }
}
