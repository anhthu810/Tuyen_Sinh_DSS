import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NAV_BY_HREF } from "@/lib/nav";

export function ModuleStub({ href }: { href: string }) {
  const meta = NAV_BY_HREF[href];
  if (!meta) return null;
  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        badge={meta.milestone ? `Sắp xây dựng · ${meta.milestone}` : "Sắp xây dựng"}
      />
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-8">
          <div className="text-sm font-medium">Màn hình này sẽ được xây ở mốc {meta.milestone ?? "sau"}.</div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Khung điều hướng và kết nối dữ liệu đã sẵn sàng (Mốc M0). Nội dung chi tiết —
            biểu đồ, bộ lọc và logic khuyến nghị — sẽ được bổ sung theo lộ trình trong{" "}
            <code>dss-web-plan/PLAN.md</code> và <code>docs/03-dss-logic-and-flows.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
