import { redirect } from "next/navigation";

import { getAdminSession } from "../_lib/admin-auth";
import { getAdminProductPosts } from "../_lib/admin-product-posts";
import AdminProductManager from "./admin-product-manager";
import LogoutButton from "./logout-button";
import ViewSiteButton from "./view-site-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, isAuthorized } = await getAdminSession();

  if (!user) {
    redirect("/admin/login");
  }

  if (!isAuthorized) {
    redirect("/admin/access-denied");
  }

  const { posts, errorMessage } = await getAdminProductPosts();

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-6 text-slate-950 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-6 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="bg-gradient-to-r from-slate-800 via-blue-800 to-emerald-700 bg-clip-text text-xs font-black uppercase tracking-[0.16em] text-transparent">SAMARTH DEALS</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Admin Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600">Signed in as an authorized administrator</p>
          </div>
          <div className="flex items-center gap-3">
            <ViewSiteButton />
            <LogoutButton />
          </div>
        </header>

        <AdminProductManager errorMessage={errorMessage} posts={posts} />
      </div>
    </main>
  );
}
