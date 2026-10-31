"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Copy, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/dashboard/client";
import { useReadOnly } from "@/components/read-only-context";

type Member = {
  id: string;
  name: string | null;
  email: string;
  role: "owner" | "admin" | "operator" | "viewer";
  status: string;
  joinedAt: string;
  isOwner: boolean;
};
type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

const ROLE_HELP: Record<string, string> = {
  owner: "Full control, including billing and deletion.",
  admin: "Settings, teammates, agents and prompt approvals.",
  operator: "Works the queue: calls, messages, promises, payments.",
  viewer: "Read-only.",
};

export function TeamSettings() {
  const readOnly = useReadOnly();
  const { data, mutate } = useSWR<{ members: Member[]; invites: Invite[] }>(
    "/api/team",
    apiFetch,
  );
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("operator");
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    setBusy(true);
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      return toast.error(body.error ?? "Could not send that invitation.");
    // Email delivery of invites is not wired yet: show the single-use link so
    // the admin can pass it on deliberately rather than pretend mail was sent.
    setLastLink(body.invite.url);
    form.reset();
    toast.success(`Invitation ready for ${body.invite.email}`);
    await mutate();
  }

  async function patch(payload: Record<string, unknown>, message: string) {
    const response = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error ?? "Could not apply that.");
    toast.success(message);
    await mutate();
  }

  if (!data)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Teammates</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Teammates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {member.name ?? member.email}
                  {member.isOwner && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      Owner
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email} · {ROLE_HELP[member.role]}
                </p>
              </div>
              {!readOnly && !member.isOwner && (
                <div className="flex items-center gap-2">
                  <Select
                    value={member.role}
                    onValueChange={(next) =>
                      patch({ memberId: member.id, role: next }, "Role updated")
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch(
                        { memberId: member.id, remove: true },
                        "Teammate removed",
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
              <label className="flex-1 space-y-2">
                <span className="text-xs text-muted-foreground">
                  Email address
                </span>
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="name@business.in"
                />
              </label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserPlus size={14} />
                )}
                Create invite
              </Button>
            </form>
            {lastLink && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Send this single-use link to your teammate. It expires in 72
                  hours and only works for the invited email address.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-[11px]">
                    {lastLink}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(lastLink);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy size={13} /> Copy
                  </Button>
                </div>
              </div>
            )}
            {data.invites.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Pending invites</p>
                {data.invites.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="truncate">
                      {item.email} · {item.role}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch(
                          { inviteId: item.id, revoke: true },
                          "Invitation revoked",
                        )
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
