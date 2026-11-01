"use client";

interface SearchBarProps {
  value: string;
  onQueryChange: (value: string) => void;
}

export default function SearchBar({ value, onQueryChange }: SearchBarProps) {
  return (
    <label className="relative block w-full rounded-2xl border border-red-200 bg-red-50 shadow-[0_0_0_1px_rgba(239,68,68,0.03)] transition hover:border-red-300 focus-within:border-red-500 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(239,68,68,0.12)]">
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
        className="h-12 w-full rounded-2xl border-0 bg-transparent py-3 pl-11 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-red-300"
        type="search"
        value={value}
        onInput={(event) => onQueryChange(event.currentTarget.value)}
        placeholder="Search deals, platforms or prices..."
      />
    </label>
  );
}
