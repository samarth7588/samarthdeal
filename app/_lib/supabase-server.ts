import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const requestTimeoutMs = 15_000;

function createFetchWithTimeout(requestSignal?: AbortSignal): typeof fetch {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signals = [init?.signal, requestSignal, timeoutSignal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
    return fetch(input, { ...init, signal });
  };
}

export async function createSupabaseServerClient(requestSignal?: AbortSignal) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase public environment variables are not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    global: { fetch: createFetchWithTimeout(requestSignal) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; proxy refreshes them.
        }
      },
    },
  });
}