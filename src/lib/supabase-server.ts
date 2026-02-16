import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export const createServerSupabaseClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
});

/**
 * Cached per-request user fetch. Call from any server component —
 * only the first call hits Supabase Auth; subsequent calls return
 * the cached result within the same React render.
 */
export const getUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Cached per-request profile fetch. Deduplicates profile queries
 * across layouts and pages within the same render.
 */
export const getProfile = cache(async (userId: string) => {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, favorite_color, bio, is_site_admin")
    .eq("id", userId)
    .single();
  return data;
});
