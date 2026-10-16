"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Table2 } from "lucide-react";

export function ChartCard({
  title,
  description,
  children,
  table,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  table?: ReactNode; // nếu có -> hiện nút chuyển "xem bảng"
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 p-5 pb-0">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {table ? (
          <Button variant="outline" size="sm" onClick={() => setShowTable((s) => !s)}>
            {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            {showTable ? "Biểu đồ" : "Bảng"}
          </Button>
        ) : null}
      </div>
      <CardContent className="p-5">{showTable && table ? table : children}</CardContent>
    </Card>
  );
}
