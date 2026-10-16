import { clamp } from "./scale";

// Độ phù hợp mã Holland (RIASEC) giữa HS và ngành — ước lượng 0–100.
// Khớp theo vị trí: chữ càng ở đầu (ưu thế cao) càng nặng; 100 khi trùng khớp hoàn toàn.
export function hollandMatch(
  student?: string | null,
  program?: string | null,
): number | null {
  if (!student || !program) return null;
  const A = student.toUpperCase().replace(/[^RIASEC]/g, "").slice(0, 3);
  const B = program.toUpperCase().replace(/[^RIASEC]/g, "").slice(0, 3);
  if (!A || !B) return null;
  let score = 0;
  let max = 0;
  for (let i = 0; i < A.length; i++) {
    const w = 3 - i; // trọng số theo vị trí trong mã HS
    max += w * 3;
    const j = B.indexOf(A[i]);
    if (j >= 0) score += w * (3 - j);
  }
  return max ? clamp((score / max) * 100) : null;
}

export const RIASEC = ["R", "I", "A", "S", "E", "C"] as const;
