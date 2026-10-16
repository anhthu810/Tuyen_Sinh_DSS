import { createBrowserClient } from "@supabase/ssr";

// Supabase client cho CLIENT COMPONENT (trình duyệt). Dùng anon/publishable key.
// An toàn vì RLS chỉ cho SELECT công khai.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
