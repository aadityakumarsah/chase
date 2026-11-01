"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, SlidersHorizontal, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sub-navigation shared by the three settings routes. */
const TABS = [
  ["/settings", "Workspace", SlidersHorizontal],
  ["/settings/team", "Team", Users],
  ["/settings/billing", "Plan & billing", CreditCard],
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map(([href, label, Icon]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={15} strokeWidth={1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
