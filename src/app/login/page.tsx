import Link from "next/link";
import { ArrowUpRight, AudioLines, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen bg-stone-50 lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-[#172822] p-8 text-stone-50 lg:p-16">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 text-2xl font-semibold tracking-tight"
        >
          <AudioLines size={28} /> chase
          <span className="text-emerald-400">.</span>
        </Link>
        <div className="py-16 lg:py-28">
          <p className="mb-8 text-xs tracking-[.22em] text-emerald-200/70 uppercase">
            A better way to follow up
          </p>
          <h1 className="max-w-lg text-5xl leading-[1.08] font-medium tracking-tight lg:text-6xl">
            Bolna makes the call.
            <br />
            <span className="text-emerald-300">
              Chase gets
              <br />
              you paid.
            </span>
          </h1>
          <p className="mt-8 max-w-sm text-base leading-7 text-stone-300">
            Thoughtful conversations. Clear promises. A little less chasing, a
            little more business.
          </p>
        </div>
        <p className="text-xs text-stone-400">
          Built for Indian businesses · Bolna × YC Symphony
        </p>
      </section>
      <section className="flex items-center justify-center p-8 lg:p-20">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex size-11 items-center justify-center rounded-xl border bg-white">
            <LockKeyhole size={20} />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Welcome back.
          </h2>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            Enter your admin passcode to open your workspace.
          </p>
          <form action="/login/session" method="post" className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="passcode" className="text-sm font-medium">
                Admin passcode
              </label>
              <Input
                id="passcode"
                name="passcode"
                type="password"
                autoComplete="current-password"
                required
                maxLength={512}
                className="h-11 bg-white"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                That passcode wasn’t accepted. Please try again.
              </p>
            )}
            <Button
              type="submit"
              className="h-11 w-full bg-[#172822] text-white"
            >
              Open workspace <ArrowUpRight size={16} />
            </Button>
          </form>
          <p className="mt-8 text-xs leading-5 text-muted-foreground">
            Your session expires after 8 hours.
          </p>
        </div>
      </section>
    </main>
  );
}
