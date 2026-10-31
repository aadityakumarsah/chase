"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page render failed", error.digest ?? error.name);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto text-amber-500" />
        <h1 className="mt-4 text-2xl font-semibold">This view took a pause</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Chase could not load this page safely. No collection action was
          started. Try the view again.
        </p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw /> Try again
        </Button>
      </section>
    </main>
  );
}
