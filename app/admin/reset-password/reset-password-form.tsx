"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "../../_lib/supabase-browser";

const minPasswordLength = 8;
const inputClassName =
  "mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10";

type LinkState = "checking" | "ready" | "invalid";

export default function ResetPasswordForm() {
  const supabase = useMemo(() => createSupabaseBrowserClient(20_000), []);
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isActive = true;

    // The Supabase client exchanges the `code` from the reset email for a
    // session while it initialises; getSession() waits for that to finish.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isActive) setLinkState(data.session ? "ready" : "invalid");
      })
      .catch(() => {
        if (isActive) setLinkState("invalid");
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (isActive && session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        setLinkState("ready");
      }
    });

    return () => {
      isActive = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length < minPasswordLength) {
      setErrorMessage(`Use at least ${minPasswordLength} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErrorMessage(
          error.code === "same_password"
            ? "Choose a password that is different from your current one."
            : error.code === "weak_password"
              ? "That password is too weak. Try a longer password with a mix of characters."
              : "We could not update your password. Request a new reset link and try again.",
        );
        setIsSaving(false);
        return;
      }

      // Full page load so the server sees the refreshed session cookies.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin");
    } catch {
      setErrorMessage("The request is taking too long or the connection failed. Please try again.");
      setIsSaving(false);
    }
  }

  if (linkState === "checking") {
    return <p className="mt-6 text-sm text-slate-600">Checking your reset link...</p>;
  }

  if (linkState === "invalid") {
    return (
      <div className="mt-6 space-y-5">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          This reset link is invalid or has expired. Reset links only work once, in the same browser where you requested them.
        </p>
        <a
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
          href="/admin/forgot-password"
        >
          Request a new link
        </a>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="password"
          minLength={minPasswordLength}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          autoComplete="new-password"
          className={inputClassName}
          id="confirm-password"
          minLength={minPasswordLength}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </div>

      {errorMessage && (
        <p aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      )}

      <button
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}
