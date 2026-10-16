import { Inbox } from "lucide-react";

export function EmptyState({
  title = "Chưa có dữ liệu",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {description ? (
        <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
