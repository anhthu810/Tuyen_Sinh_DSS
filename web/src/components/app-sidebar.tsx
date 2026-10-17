"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  TrendingUp,
  Briefcase,
  Wallet,
  Sparkles,
  Search,
  ShieldCheck,
  GraduationCap,
  Target,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ListOrdered,
  TrendingUp,
  Briefcase,
  Wallet,
  Sparkles,
  Search,
  ShieldCheck,
  Target,
  Bot,
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
          <div className="text-xs text-muted-foreground">Nhóm 5 · Hướng nghiệp</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-4 text-xs text-muted-foreground">
        7 trường · 380 ngành · 2023–2026
      </div>
    </aside>
  );
}
