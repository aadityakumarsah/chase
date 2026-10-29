import { notFound } from "next/navigation";
import { z } from "zod";
// Never present an unverified token as a payable invoice. Payment resolution ships later.
export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (
    !z
      .string()
      .min(16)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
      .safeParse(token).success
  )
    notFound();
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
      <div className="max-w-sm rounded-xl border bg-white p-8">
        <h1 className="text-xl font-semibold">Payments are coming soon.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This Chase workspace isn’t accepting payments yet. Please contact the
          business directly.
        </p>
      </div>
    </main>
  );
}
