"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  GraduationCap,
  Target,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  TrendingUp,
  Target,
  SlidersHorizontal,
};

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col gap-1 border-r bg-card px-3 py-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-5" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">DSS Tuyển sinh</div>
          <div className="text-xs text-muted-foreground">Nhóm 5 · EIS / DSS</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item, idx) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active =
            item.href === "/"
              ? pathname === "/" ||
                (item.childPrefixes?.some((p) => pathname.startsWith(p)) ?? false)
              : pathname === item.href ||
                pathname.startsWith(item.href + "/") ||
                (item.childPrefixes?.some(
                  (p) => pathname === p || pathname.startsWith(p + "/"),
                ) ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate">{item.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {idx + 1}. {item.stage}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t px-2 pt-4 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Phạm vi dữ liệu</div>
        <div>7 trường · 380 ngành · 500 HS · 2023–2026</div>
      </div>
    </aside>
  );
}
