"use client";

interface HeaderProps {
  onHowItWorks: () => void;
  onRefundTime: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export default function Header({
  onHowItWorks,
  onRefundTime,
  searchValue,
  onSearchChange,
}: HeaderProps) {
  return (
    <header className="border-b border-slate-200/80 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="text-[#000000]">SAMARTH</span>
            <span className="text-[#000000]">DEALS</span>
          </h1>
          <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-3 text-sm font-semibold sm:gap-4">
            <button
              className="text-slate-700 transition hover:text-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-500/20"
              onClick={onHowItWorks}
              type="button"
            >
              How it works
            </button>
            <button
              className="text-slate-700 transition hover:text-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-500/20"
              onClick={onRefundTime}
              type="button"
            >
              Refund Time
            </button>
            <a className="text-slate-700 transition hover:text-orange-700" href="/admin">
              Admin
            </a>
          </nav>
        </div>
        <label className="relative mt-4 block w-full rounded-2xl border border-red-200 bg-red-50 shadow-[0_0_0_1px_rgba(239,68,68,0.03)] transition hover:border-red-300 focus-within:border-red-500 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(239,68,68,0.12)]">
          <span className="sr-only">Search deals</span>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="6" />
            <path strokeLinecap="round" d="m20 20-4.35-4.35" />
          </svg>
          <input
            className="h-12 w-full rounded-2xl border-0 bg-transparent py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition duration-300 placeholder:text-red-300 sm:h-14 sm:text-base"
            type="search"
            value={searchValue}
            onInput={(event) => onSearchChange(event.currentTarget.value)}
            placeholder="Search deals, prices or products..."
          />
        </label>
        <p className="mt-2 text-xs font-medium leading-5 text-amber-800 sm:text-sm">
          ⚠️ Always open the order link first to check slot availability. This applies only to Jayshakthi Deal.
        </p>
      </div>
    </header>
  );
}
