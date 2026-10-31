import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { ChaseBrand } from "@/components/marketing/brand";
import styles from "@/components/marketing/marketing.module.css";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className={`${styles.site} ${styles.signIn}`}>
      <section className={styles.signInStory}>
        <ChaseBrand />
        <div>
          <Image
            src="/assets/chase-mascot.webp"
            width={300}
            height={274}
            alt="Chase mascot"
            priority
          />
          <h1>
            A little less chasing.
            <br />
            <span>A lot more business.</span>
          </h1>
          <p>
            Your conversations, commitments and collections.
            <br />
            All right where you left them.
          </p>
        </div>
        <a href="https://sagarmathalabs.com" target="_blank" rel="noreferrer">
          Backed by Sagarmatha Labs ↗
        </a>
      </section>
      <section className={styles.signInForm}>
        <div>
          <span className={styles.eyebrow}>YOUR CHASE WORKSPACE</span>
          <h2>Good to have you back.</h2>
          <p>Enter your admin or read-only demo passcode to continue.</p>
          <form action="/login/session" method="post">
            <label htmlFor="passcode">Workspace passcode</label>
            <input
              id="passcode"
              name="passcode"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
              aria-describedby={error ? "login-error" : undefined}
            />
            {error && (
              <p id="login-error" role="alert">
                That passcode wasn’t accepted. Please try again.
              </p>
            )}
            <button type="submit" className={styles.primaryButton}>
              Open workspace <ArrowRight size={16} />
            </button>
          </form>
          <p>Secure access. Your session expires after 8 hours.</p>
          <Link href="/">
            <ArrowLeft size={14} />
            Back to Chase <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>
    </main>
  );
}
