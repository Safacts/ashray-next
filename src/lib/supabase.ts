import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Fallback to placeholder during build so `next build` can collect page data without env
const browserUrl = supabaseUrl || "https://placeholder.supabase.co";
const browserKey = supabaseAnonKey || "placeholder-anon-key";

export const supabase = createClient(browserUrl, browserKey);

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const effectiveUrl = url || "https://placeholder.supabase.co";
  const effectiveKey = key || "placeholder-anon-key";
  return createClient(effectiveUrl, effectiveKey);
}

// alias for consumers expecting createServerClient name
export const createServerClient = createServerSupabaseClient;
