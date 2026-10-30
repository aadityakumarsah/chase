"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  Bot,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
const navigation = [
  ["/", "Command center", LayoutDashboard],
  ["/debtors", "Debtors", Users],
  ["/compliance", "Compliance", ShieldCheck],
  ["/ai", "AI Ops", Bot],
  ["/brief", "Daily brief", FileText],
  ["/prompt-prs", "Prompt PRs", Sparkles],
  ["/lab", "Voice lab", FlaskConical],
  ["/settings", "Settings", Settings],
] as const;
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/stage") return <>{children}</>;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border/70 bg-card/90 p-5 backdrop-blur-xl lg:flex lg:flex-col">
        <Link
          href="/"
          className="flex items-center gap-3 px-2 text-xl font-semibold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <AudioLines size={20} />
          </span>
          chase<span className="-ml-2 text-primary">.</span>
        </Link>
        <div className="mt-8 flex items-center gap-2 px-2 text-[10px] font-semibold tracking-[.2em] text-muted-foreground uppercase">
          <ListChecks size={13} /> Collections OS
        </div>
        <nav className="mt-3 space-y-1">
          {navigation.map(([href, label, Icon]) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon size={17} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl border bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-500">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,.8)]" />{" "}
            Live workspace
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Bolna makes the call. Chase gets you paid.
          </p>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-5 backdrop-blur-xl lg:px-8">
          <div className="text-sm text-muted-foreground">Operator console</div>
          <div className="flex items-center gap-2">
            <Link
              href="/stage"
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Open stage view
            </Link>
            <ThemeToggle />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
