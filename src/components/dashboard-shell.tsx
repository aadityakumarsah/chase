"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Bot,
  BookOpen,
  CreditCard,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  PanelLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import useSWR from "swr";
import { apiFetch } from "@/lib/dashboard/client";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "./ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { ReadOnlyProvider } from "./read-only-context";
import {
  AccountMenu,
  type AccountUser,
  type AccountWorkspace,
} from "./account-menu";

type NavItem = readonly [string, string, LucideIcon];
type NavGroup = { heading: string; items: readonly NavItem[] };

const navigation: readonly NavGroup[] = [
  {
    heading: "Workspace",
    items: [
      ["/dashboard", "Overview", LayoutDashboard],
      ["/debtors", "Accounts", Users],
      ["/brief", "Daily brief", FileText],
      ["/compliance", "Compliance", ShieldCheck],
    ],
  },
  {
    heading: "Intelligence & tools",
    items: [
      ["/ai", "AI insights", Bot],
      ["/prompt-prs", "Prompt improvements", Sparkles],
      ["/lab", "Voice lab", FlaskConical],
    ],
  },
  {
    heading: "Account",
    items: [
      ["/settings/billing", "Plan & billing", CreditCard],
      ["/settings", "Settings", Settings],
      ["/docs", "Documentation", BookOpen],
    ],
  },
];

const FLAT_NAV: readonly NavItem[] = navigation.flatMap((group) => group.items);

/** Tier labels the sidebar card shows; keep in step with src/lib/billing/plans.ts. */
const TIER_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

type BillingSummary = {
  tier: string;
  source: string;
  entitlements: { debtors: number | null; callsPerMonth: number | null };
  usage: { debtors: number; callsThisMonth: number };
  trialEndsAt: string | null;
};

/**
 * Plan state in the sidebar.
 *
 * Shows what the workspace is entitled to and how much of it is gone, because a
 * limit the customer cannot see is a limit they only discover by being blocked.
 */
function PlanCard({ onNavigate }: { onNavigate: () => void }) {
  const { data } = useSWR<BillingSummary>("/api/billing", apiFetch, {
    refreshInterval: 60_000,
  });
  if (!data) return null;
  const paid = data.tier !== "free";
  const trialing = data.source === "trial";
  const callLimit = data.entitlements.callsPerMonth;
  const used = data.usage.callsThisMonth;
  const share =
    callLimit === null
      ? 0
      : Math.min(100, Math.round((used / callLimit) * 100));
  const tight = callLimit !== null && used >= callLimit * 0.8;
  return (
    <Link
      href="/settings/billing"
      onClick={onNavigate}
      className="mx-4 mb-3 block rounded-lg border bg-background p-3 transition-colors hover:border-foreground/25"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">
          {TIER_LABEL[data.tier] ?? data.tier} plan
        </span>
        {trialing ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-500">
            TRIAL
          </span>
        ) : (
          !paid && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
              <Zap size={11} /> Upgrade
            </span>
          )
        )}
      </div>
      {callLimit === null ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Unlimited calls and accounts
        </p>
      ) : (
        <>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                tight ? "bg-amber-500" : "bg-foreground/60",
              )}
              style={{ width: `${share}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {used}/{callLimit} calls this month
          </p>
        </>
      )}
    </Link>
  );
}

export function DashboardShell({
  children,
  readOnly,
  user,
  workspace,
}: {
  children: React.ReactNode;
  readOnly: boolean;
  user: AccountUser;
  workspace: AccountWorkspace;
  workspaces?: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const collapsed = hidden || fullscreen || focusMode;
  useEffect(() => {
    // Restore after hydration; storage is optional in private browsers.
    const frame = requestAnimationFrame(() => {
      try {
        setHidden(localStorage.getItem("chase.sidebar.hidden") === "true");
      } catch {}
    });
    const changed = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      setFocusMode(false);
    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setHidden((value) => {
          try {
            localStorage.setItem("chase.sidebar.hidden", String(!value));
          } catch {}
          return !value;
        });
      }
      if (event.key === "Escape") setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("keydown", shortcut);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);
  function toggleSidebar() {
    setHidden(!hidden);
    try {
      localStorage.setItem("chase.sidebar.hidden", String(!hidden));
    } catch {}
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (focusMode) setFocusMode(false);
      else await document.documentElement.requestFullscreen();
    } catch {
      setFocusMode((value) => !value);
    }
  }
  // Longest match wins so /settings/billing does not resolve to /settings.
  const activeLabel =
    [...FLAT_NAV]
      .sort(([a], [b]) => b.length - a.length)
      .find(
        ([href]) => pathname === href || pathname.startsWith(`${href}/`),
      )?.[1] ?? "Workspace";
  const sidebar = (
    <>
      <Link
        href="/dashboard"
        onClick={() => setMobileOpen(false)}
        className="flex h-16 items-center gap-2.5 px-5 text-xl font-semibold tracking-tight"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
          <AudioLines size={18} />
        </span>
        chase
      </Link>
      <div className="mx-4 mt-4 rounded-lg border bg-background px-3 py-3">
        <p className="text-xs font-medium">Collections workspace</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Voice-powered receivables
        </p>
      </div>
      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-6 overflow-y-auto px-3 py-6"
      >
        {navigation.map((group) => (
          <div key={group.heading} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              {group.heading}
            </p>
            {group.items.map(([href, label, Icon]) => {
              // Longest-prefix matching keeps /settings from claiming its children.
              const active =
                pathname === href ||
                (pathname.startsWith(`${href}/`) &&
                  !FLAT_NAV.some(
                    ([other]) =>
                      other.length > href.length &&
                      (pathname === other || pathname.startsWith(`${other}/`)),
                  ));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors",
                    active
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon size={16} strokeWidth={1.7} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <PlanCard onNavigate={() => setMobileOpen(false)} />
      <a
        href="https://sagarmathalabs.com"
        target="_blank"
        rel="noreferrer"
        className="mx-4 mb-5 flex items-center justify-between border-t pt-4 text-muted-foreground hover:text-foreground"
      >
        <span>
          <span className="block text-[10px]">Backed by</span>
          <span className="mt-1 block text-xs font-medium">
            Sagarmatha Labs
          </span>
        </span>
        <ArrowUpRight size={14} />
      </a>
    </>
  );
  if (pathname === "/stage")
    return <ReadOnlyProvider value={readOnly}>{children}</ReadOnlyProvider>;
  return (
    <ReadOnlyProvider value={readOnly}>
      <div className="min-h-screen bg-background text-foreground">
        <a
          href="#workspace-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-card focus:p-3"
        >
          Skip to content
        </a>
        {!collapsed && (
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar lg:flex">
            {sidebar}
          </aside>
        )}
        <div className={cn("min-w-0", !collapsed && "lg:pl-60")}>
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-sm lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={toggleSidebar}
                disabled={fullscreen || focusMode}
                aria-label={hidden ? "Show sidebar" : "Hide sidebar"}
                aria-expanded={!collapsed}
                title="Toggle sidebar (⌘/Ctrl B)"
              >
                <PanelLeft size={17} />
              </Button>
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  >
                    <PanelLeft size={17} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 gap-0 p-0">
                  <SheetTitle className="sr-only">
                    Workspace navigation
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate Chase accounts, conversations and settings.
                  </SheetDescription>
                  {sidebar}
                </SheetContent>
              </Sheet>
              <span className="hidden max-w-[22ch] truncate text-xs text-muted-foreground sm:inline">
                {workspace.name}
              </span>
              <span className="hidden text-xs text-muted-foreground/50 sm:inline">
                /
              </span>
              <span className="truncate text-xs font-medium">
                {activeLabel}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {readOnly && (
                <span className="mr-2 rounded-md border px-2 py-1 text-[10px] text-muted-foreground">
                  Read-only access
                </span>
              )}
              <Link
                href="/stage"
                className="hidden rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
              >
                Stage view <ArrowUpRight size={13} className="ml-1.5" />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  fullscreen || focusMode
                    ? "Exit fullscreen"
                    : "Enter fullscreen"
                }
                title="Fullscreen workspace"
              >
                {fullscreen || focusMode ? (
                  <Minimize2 size={16} />
                ) : (
                  <Maximize2 size={16} />
                )}
              </Button>
              <ThemeToggle />
              <AccountMenu user={user} workspace={workspace} />
            </div>
          </header>
          <div id="workspace-content" className="min-w-0">
            {children}
          </div>
        </div>
      </div>
    </ReadOnlyProvider>
  );
}
