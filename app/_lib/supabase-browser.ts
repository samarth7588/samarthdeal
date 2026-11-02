import { createBrowserClient } from "@supabase/ssr";

function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const requestSignal = input instanceof Request ? input.signal : undefined;
    const signals = [init?.signal, requestSignal, AbortSignal.timeout(timeoutMs)].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    return fetch(input, { ...init, signal: AbortSignal.any(signals) });
  };
}

export function createSupabaseBrowserClient(requestTimeoutMs?: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase public environment variables are not configured.");
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey, requestTimeoutMs
    ? { global: { fetch: fetchWithTimeout(requestTimeoutMs) } }
    : undefined);
}