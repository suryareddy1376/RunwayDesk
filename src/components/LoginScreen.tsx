import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { WORKSPACE_CHANGED_EVENT } from "../hooks/useWorkspace";
import { supabase } from "../lib/supabase";
import { seedDemoWorkspace } from "../services/db";

const DEMO_EMAIL = "demo@studioveda.in";
const DEMO_PASSWORD = "RunwayDemo2026!";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 6;
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2";
const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-blue focus:outline-none";

type Mode = "signin" | "signup";

type FieldErrors = { email?: string; password?: string };

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return errors;
}

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function launchDemo() {
    setBusy(true);
    setError(null);
    try {
      try {
        await signIn(DEMO_EMAIL, DEMO_PASSWORD);
      } catch {
        await signUp(DEMO_EMAIL, DEMO_PASSWORD);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        throw new Error("Demo account needs its email confirmed before it can open.");
      }

      const { data: settings, error: settingsError } = await supabase
        .from("studio_settings")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (settingsError) throw new Error(settingsError.message);

      if (!settings) {
        await seedDemoWorkspace();
      }
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const isSignIn = mode === "signin";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-10 font-sans text-ink">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="heading-lg">RunwayDesk</h1>
          <p className="body-md mt-1 text-ink-secondary">
            {isSignIn ? "Sign in to your studio" : "Create your studio account"}
          </p>
        </div>

        <button
          type="button"
          onClick={launchDemo}
          disabled={busy}
          className={`mb-6 flex w-full items-center justify-center rounded-lg bg-blue px-3 py-2.5 button-md text-white transition-transform duration-150 ease-emphasis hover:bg-blue/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          Launch Demo Studio
        </button>

        <div role="tablist" aria-label="Account mode" className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1">
          <button
            type="button"
            role="tab"
            aria-selected={isSignIn}
            onClick={() => switchMode("signin")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${isSignIn ? "border-line bg-surface text-ink" : "border-transparent text-ink-muted hover:text-ink"} ${FOCUS_RING}`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignIn}
            onClick={() => switchMode("signup")}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${!isSignIn ? "border-line bg-surface text-ink" : "border-transparent text-ink-muted hover:text-ink"} ${FOCUS_RING}`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="mb-1 block body-sm font-medium text-ink-secondary">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="you@studio.com"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
              className={INPUT_CLASS}
            />
            {fieldErrors.email && (
              <p id="auth-email-error" className="mt-1 body-sm text-rose">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1 block body-sm font-medium text-ink-secondary">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignIn ? "current-password" : "new-password"}
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="At least 6 characters"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "auth-password-error" : undefined}
              className={INPUT_CLASS}
            />
            {fieldErrors.password && (
              <p id="auth-password-error" className="mt-1 body-sm text-rose">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`flex w-full items-center justify-center rounded-lg border border-line bg-surface px-3 py-2.5 button-md text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            {busy ? "Please wait..." : isSignIn ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
