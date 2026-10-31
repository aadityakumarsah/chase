"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type AccountUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type AccountWorkspace = {
  id: string;
  name: string;
  role: "owner" | "admin" | "operator" | "viewer";
  plan: "trial" | "starter" | "growth" | "scale";
};

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Identity, role and sign-out. Sign-out posts so it cannot be triggered by a link. */
export function AccountMenu({
  user,
  workspace,
}: {
  user: AccountUser;
  workspace: AccountWorkspace;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted"
        aria-label="Account menu"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-foreground">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- provider avatar host is not known at build time
            <img
              src={user.avatarUrl}
              alt=""
              className="size-7 rounded-full object-cover"
            />
          ) : (
            initials(user.name)
          )}
        </span>
        <span className="hidden max-w-[12ch] truncate sm:inline">
          {user.name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-1">
          <span className="block truncate text-xs font-medium">
            {user.name}
          </span>
          <span className="block truncate text-[11px] font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="space-y-1">
          <span className="block truncate text-xs font-medium">
            {workspace.name}
          </span>
          <span className="block text-[11px] font-normal text-muted-foreground capitalize">
            {workspace.role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings size={14} /> Workspace settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/billing">Plan and billing</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/team">
            <Users size={14} /> Teammates
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings#profile">
            <UserRound size={14} /> Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2 text-left"
            >
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
