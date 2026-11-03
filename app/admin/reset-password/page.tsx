import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">SAMARTH DEALS</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Choose a new password</h1>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
