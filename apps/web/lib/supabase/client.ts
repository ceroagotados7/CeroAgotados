import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase para el navegador (auth + sesión en cookies). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
