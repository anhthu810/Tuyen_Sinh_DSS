import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSubjectCombinationOptions } from "@/lib/queries/signals";
import { AiAdvisorForm } from "./_components/ai-form";

export default function TuVanAiPage() {
  return (
    <div>
      <PageHeader
        title="Tư vấn AI chọn ngành"
        description="Nhập điểm và mô tả tính cách/sở thích của bạn — trợ lý AI (GLM-5.3) phân tích cùng dữ liệu điểm chuẩn, việc làm, chi phí thật và gợi ý 3–5 ngành phù hợp nhất kèm lý do."
        badge="AI · GLM-5.3 (z.ai)"
      />
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <AiAdvisorContent />
      </Suspense>
      <p className="mt-6 text-xs text-muted-foreground">
        AI chỉ chọn trong các ngành có thật & khả thi với mức điểm của bạn (không bịa ngành/trường).
        Kết quả mang tính tham khảo, nên cân nhắc thêm cùng thầy cô/phụ huynh. Dữ liệu điểm chuẩn
        dùng dự báo nên có sai số.
      </p>
    </div>
  );
}

async function AiAdvisorContent() {
  const subjectCombinations = await getSubjectCombinationOptions();
  return <AiAdvisorForm subjectCombinations={subjectCombinations} />;
}
