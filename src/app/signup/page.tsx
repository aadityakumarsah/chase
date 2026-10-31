import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { ChaseBrand } from "@/components/marketing/brand";
import styles from "@/components/marketing/marketing.module.css";

export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
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
          <span className={styles.eyebrow}>CREATE YOUR WORKSPACE</span>
          <h2>Start collecting what you are owed.</h2>
          {error === "unconfigured" ? (
            <p role="alert" className={styles.authError}>
              Sign-in is not configured in this deployment yet.
            </p>
          ) : (
            <p>Create your workspace. No card, no setup call.</p>
          )}
          <AuthForm mode="signup" next={next} />
          <Link href="/">
            <ArrowLeft size={14} />
            Back to Chase <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>
    </main>
  );
}
