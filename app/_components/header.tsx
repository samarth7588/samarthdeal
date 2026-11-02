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
          <div className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-[linear-gradient(110deg,#f8f7ff_0%,#fff_72%,#f3edff_100%)] px-3 py-2 sm:gap-3 sm:px-4">
            <svg
              aria-hidden="true"
              className="h-9 w-9 shrink-0 text-[#17145C] sm:h-11 sm:w-11"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M11 17h26l2 25H9l2-25Z"
                fill="currentColor"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              <path
                d="M17 18v-4a7 7 0 0 1 14 0v4"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="3"
              />
              <path
                d="m20 25 8-3 5 7-8 9-8-7 3-6Z"
                fill="#F8F7FF"
                stroke="#F8F7FF"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
              <circle cx="27.5" cy="26.5" r="1.4" fill="#17145C" />
            </svg>
            <span aria-hidden="true" className="h-8 w-px shrink-0 bg-[#17145C]/25 sm:h-9" />
            <h1 className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[clamp(1.05rem,5vw,2rem)] font-extrabold leading-none tracking-tight">
              <span className="text-[#17145C]">SAMARTH</span>
              <span className="bg-gradient-to-r from-[#6D28D9] to-[#9333EA] bg-clip-text text-transparent">DEALS</span>
            </h1>
          </div>
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
        <label className="relative mt-4 block w-full rounded-2xl border border-red-500 bg-white shadow-[0_0_0_1px_rgba(239,68,68,0.03)] transition hover:border-red-600 focus-within:border-red-600 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(239,68,68,0.12)]">
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
            className="h-12 w-full rounded-2xl border-0 bg-transparent py-3 pl-12 pr-4 text-sm text-black outline-none transition duration-300 placeholder:text-black sm:h-14 sm:text-base"
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
