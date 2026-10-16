import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client cho SERVER COMPONENT / Route Handler. Dùng anon key + cookies
// (sẵn sàng cho auth sau này; v1 chưa đăng nhập nên chỉ đọc dữ liệu công khai).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Gọi từ Server Component (không set được cookie) — bỏ qua an toàn.
          }
        },
      },
    },
  );
}
