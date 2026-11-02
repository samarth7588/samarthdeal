import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "./supabase-server";

export type AdminSession = {
  user: User | null;
  isAuthorized: boolean;
};

export async function getAdminSession(signal?: AbortSignal): Promise<AdminSession> {
  const supabase = await createSupabaseServerClient(signal);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isAuthorized: false };
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { user, isAuthorized: false };
  }

  return { user, isAuthorized: Boolean(data) };
}