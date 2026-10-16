// Server Component thuần — dùng <a> thay <Link> để không có Client Component
// đọc URL data (usePathname) trên trang động khi Cache Components bật.

import { ArrowLeft, ExternalLink } from "lucide-react";

export function BackToExplorerLink() {
  return (
    <a
      href="/explorer"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Quay lại Tra cứu ngành
    </a>
  );
}

export function ProgramAnalysisLinks({ programId }: { programId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/diem-chuan?program=${encodeURIComponent(programId)}`}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Phân tích điểm chuẩn <ExternalLink className="size-4" />
      </a>
      <a
        href={`/chi-phi?program=${encodeURIComponent(programId)}`}
        className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
      >
        Ước tính chi phí <ExternalLink className="size-4" />
      </a>
    </div>
  );
}