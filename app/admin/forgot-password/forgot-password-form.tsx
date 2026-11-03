"use client";

import { FormEvent, useState } from "react";

import { createSupabaseBrowserClient } from "../../_lib/supabase-browser";

const requestTimeoutMs = 20_000;

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatus("sending");

    try {
      const supabase = createSupabaseBrowserClient(requestTimeoutMs);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });

      if (error) {
        setErrorMessage(
          error.status === 429
            ? "Too many reset emails were requested. Please wait a few minutes and try again."
            : "We could not send the reset email. Please try again.",
        );
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch {
      setErrorMessage("The request is taking too long or the connection failed. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-8 space-y-5">
        <p aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          If an account exists for {email}, a password reset link is on its way. Open it in this same browser to choose a new password.
        </p>
        <a className="block text-center text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950" href="/admin/login">
          Back to sign in
        </a>
      </div>
    );
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

      {errorMessage && (
        <p aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      )}

      <button
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "sending"}
        type="submit"
      >
        {status === "sending" ? "Sending..." : "Send reset link"}
      </button>

      <a className="block text-center text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950" href="/admin/login">
        Back to sign in
      </a>
    </form>
  );
}
