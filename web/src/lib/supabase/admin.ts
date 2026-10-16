import { createClient as createSbClient } from "@supabase/supabase-js";

// Supabase client QUYỀN CAO — CHỈ dùng ở SERVER (seed / ghi dữ liệu). Bypass RLS.
// TUYỆT ĐỐI không import vào Client Component. Cần SUPABASE_SERVICE_ROLE_KEY (secret key).
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY chưa cấu hình (chỉ cần khi ghi dữ liệu từ server).",
    );
  }
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
