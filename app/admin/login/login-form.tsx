"use client";

import { FormEvent, useState } from "react";

import { createSupabaseBrowserClient } from "../../_lib/supabase-browser";

const signInTimeoutMs = 20_000;

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient(signInTimeoutMs);
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !authData.session) {
        setErrorMessage("We could not sign you in. Check your email and password and try again.");
        setIsLoading(false);
        return;
      }

      // Full page load so the new session cookies are sent to the server, which
      // then decides whether to show the dashboard or the access-denied page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin");
    } catch {
      setErrorMessage("Sign in is taking too long or the connection failed. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10"
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10"
          id="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {errorMessage && (
        <p aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      )}

      <button
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}