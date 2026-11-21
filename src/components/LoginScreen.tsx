import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { WORKSPACE_CHANGED_EVENT } from "../hooks/useWorkspace";
import { supabase } from "../lib/supabase";
import { seedDemoWorkspace } from "../services/db";

const DEMO_EMAIL = "demo@studioveda.in";
const DEMO_PASSWORD = "RunwayDemo2026!";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";
const INPUT_CLASS = `min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ${FOCUS_RING}`;

type Mode = "signin" | "signup";

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 font-sans text-slate-900">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">RunwayDesk</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {isSignIn ? "Sign in to your studio" : "Create your studio account"}
          </h1>
        </div>

        <button
          type="button"
          onClick={launchDemo}
          disabled={busy}
          className={`mb-6 flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
        >
          Launch Demo Studio
        </button>

        <div role="tablist" aria-label="Account mode" className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={isSignIn}
            onClick={() => switchMode("signin")}
            className={`min-h-11 rounded-md text-sm font-medium ${isSignIn ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"} ${FOCUS_RING}`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignIn}
            onClick={() => switchMode("signup")}
            className={`min-h-11 rounded-md text-sm font-medium ${!isSignIn ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"} ${FOCUS_RING}`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignIn ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={INPUT_CLASS}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`flex min-h-11 w-full items-center justify-center rounded-md border border-slate-900 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            {busy ? "Please wait..." : isSignIn ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
