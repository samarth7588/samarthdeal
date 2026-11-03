import ForgotPasswordForm from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">SAMARTH DEALS</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Reset your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter your admin email address and we&apos;ll send you a link to choose a new password.
        </p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
