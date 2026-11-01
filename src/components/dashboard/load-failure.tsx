"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardRequestError } from "@/lib/dashboard/client";

export function LoadFailure({
  error,
  retry,
  title = "This view could not load",
}: {
  error: unknown;
  retry: () => void;
  title?: string;
}) {
  const status = error instanceof DashboardRequestError ? error.status : null;
  const authIssue = status === 401 || status === 403;
  const detail = authIssue
    ? "Your sign-in or workspace access needs attention. Sign in again, then reopen this page."
    : status === 404
      ? "This item is no longer available in your workspace."
      : status === null
        ? "The request took too long or the connection was interrupted. Your data has not been changed."
        : "Chase could not fetch this view right now. Your data has not been changed.";
  return (
    <div role="alert" className="rounded-2xl border bg-card p-7 shadow-none">
      <AlertCircle className="mb-4 text-amber-600" size={24} />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {detail}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={retry}>
          <RefreshCw size={15} /> Try again
        </Button>
        {authIssue && (
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
