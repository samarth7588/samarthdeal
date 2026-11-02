"use client";

import Link from "next/link";

export default function ViewSiteButton() {
  return (
    <Link
      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-950/10"
      href="/"
      rel="noopener noreferrer"
      target="_blank"
    >
      View site
    </Link>
  );
}
