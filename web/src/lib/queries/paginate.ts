// PostgREST (Supabase) trả tối đa 1000 dòng/lần theo mặc định → đọc theo trang.
// `build` phải tạo query MỚI mỗi lần gọi (builder không dùng lại được sau khi await).
const PAGE = 1000;

export async function fetchAllRows<T>(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
