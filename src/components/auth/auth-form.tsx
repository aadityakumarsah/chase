"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import styles from "@/components/marketing/marketing.module.css";

type Mode = "signin" | "signup";

/**
 * Email/password and Google sign-in against Supabase Auth.
 *
 * Chase never sees a password: the browser talks to Supabase directly and the
 * resulting session cookie is what our server verifies on each request.
 */
export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const destination = next && next.startsWith("/") ? next : "/dashboard";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("form");
    try {
      const supabase = supabaseBrowser();
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
          },
        });
        if (signUpError) throw signUpError;
        // With email confirmation enabled Supabase returns no session yet.
        if (!data.session) {
          setNotice(
            "Check your inbox and confirm your email address to finish creating the account.",
          );
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      router.push(destination);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function withGoogle() {
    setError(null);
    setBusy("google");
    try {
      const supabase = supabaseBrowser();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setBusy(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Google sign-in is unavailable right now.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={withGoogle}
        disabled={busy !== null}
        className={styles.googleButton}
      >
        {busy === "google" ? (
          <Loader2 size={16} className={styles.spin} />
        ) : (
          <GoogleMark />
        )}
        Continue with Google
      </button>

      <div className={styles.authDivider}>
        <span>or use your email</span>
      </div>

      <form onSubmit={onSubmit}>
        {mode === "signup" && (
          <>
            <label htmlFor="fullName">Your name</label>
            <input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              maxLength={120}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </>
        )}
        <label htmlFor="email">Work email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          maxLength={512}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === "signup" && (
          <p className={styles.authHint}>At least 8 characters.</p>
        )}
        {error && (
          <p role="alert" className={styles.authError}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles.authNotice}>
            {notice}
          </p>
        )}
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={busy !== null}
        >
          {busy === "form" ? (
            <>
              <Loader2 size={16} className={styles.spin} /> Working…
            </>
          ) : (
            <>
              {mode === "signup" ? "Create account" : "Sign in"}{" "}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className={styles.authSwitch}>
        {mode === "signup" ? (
          <>
            Already have a workspace? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New to Chase? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
