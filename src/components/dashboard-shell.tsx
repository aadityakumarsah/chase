"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AudioLines,
  Bot,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  PanelLeft,
  Maximize2,
  Minimize2,
  ArrowUpRight,
} from "lucide-react";
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

const navigation = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/debtors", "Accounts", Users],
  ["/brief", "Daily brief", FileText],
  ["/compliance", "Compliance", ShieldCheck],
  ["/ai", "AI insights", Bot],
  ["/prompt-prs", "Prompt improvements", Sparkles],
  ["/lab", "Voice lab", FlaskConical],
  ["/settings", "Settings", Settings],
] as const;

export function DashboardShell({
  children,
  readOnly,
}: {
  children: React.ReactNode;
  readOnly: boolean;
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
  const activeLabel =
    navigation.find(
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
        className="flex-1 space-y-1 overflow-y-auto px-3 py-6"
      >
        {navigation.map(([href, label, Icon], index) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <div key={href}>
              {(index === 0 || index === 4) && (
                <p
                  className={cn(
                    "px-3 pb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase",
                    index === 4 && "mt-7",
                  )}
                >
                  {index === 0 ? "Workspace" : "Intelligence & tools"}
                </p>
              )}
              <Link
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
            </div>
          );
        })}
      </nav>
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
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Workspace
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
                  Read-only demo
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
