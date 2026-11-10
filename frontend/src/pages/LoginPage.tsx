import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Lock, Mail, Sparkles, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { Button, Input, LabeledInput, LogoMark } from "@/components/ui";
import { BeforeAfter } from "@/components/BeforeAfter";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { DEMO_EMAIL, DEMO_PASSWORD, useAuthStore } from "@/store/auth";
import { toast } from "@/store/ui";

type Mode = "signin" | "register";

export default function LoginPage() {
  useDocumentTitle("Sign in");
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/app";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy("form");
    try {
      const response =
        mode === "signin"
          ? await api.login(email.trim(), password)
          : await api.register({
              name: name.trim(),
              email: email.trim(),
              password,
              organization: organization.trim() || undefined,
            });
      setSession(response.token, response.user);
      toast("success", `Welcome, ${response.user.name.split(" ")[0]}`);
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const demo = async () => {
    setError(null);
    setBusy("demo");
    try {
      const response = await api.demo();
      setSession(response.token, response.user);
      toast("success", "Demo session started", "You are signed in to the shared demo account.");
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not start the demo session.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-10 lg:flex">
        <div className="se-grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div className="se-glow pointer-events-none absolute inset-0 opacity-70" />

        <div className="relative flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark className="size-8 text-ink" />
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              Sense<span className="text-primary">Earth</span>
            </span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-[11.5px] text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>

        <div className="relative max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">
            change intelligence workspace
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-tight text-ink">
            Every mask you see was produced by the published network.
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
            Upload a pair, watch the job run, and review semantic transitions with the class palette
            the checkpoint was trained on.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-8 overflow-hidden rounded-2xl border border-line bg-bg-deep/70 p-2"
          >
            <BeforeAfter
              beforeSrc="/samples/before.jpg"
              afterSrc="/samples/after.jpg"
              beforeLabel="DEMO · 2024"
              afterLabel="2025"
              className="aspect-[16/10]"
            />
            <div className="flex items-center justify-between px-2 py-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
              <span>dubai coastline · modis 250 m</span>
              <span className="text-primary/80">demo pair</span>
            </div>
          </motion.div>
        </div>

        <div className="relative flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          <span className="size-1.5 rounded-full bg-accent se-live-dot" />
          local api · fastapi · pytorch 2.6 cpu
        </div>
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark className="size-8 text-ink" />
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              Sense<span className="text-primary">Earth</span>
            </span>
          </div>

          <div className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1">
            {(["signin", "register"] as Mode[]).map((option) => (
              <button
                key={option}
                onClick={() => {
                  setMode(option);
                  setError(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  mode === option ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink-soft"
                }`}
              >
                {option === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <h2 className="mt-6 text-[24px] font-semibold tracking-tight text-ink">
            {mode === "signin" ? "Open your workspace" : "Create a workspace"}
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            {mode === "signin"
              ? "Sign in with your SenseEarth account."
              : "Create an account. Passwords are hashed with PBKDF2-SHA256 before storage."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <>
                <LabeledInput
                  label="Full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ada Lovelace"
                  required
                  minLength={2}
                  autoComplete="name"
                />
                <LabeledInput
                  label="Organization (optional)"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  placeholder="Earth observation lab"
                  autoComplete="organization"
                />
              </>
            )}

            <LabeledInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.org"
              required
              autoComplete="email"
            />

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Password
                </label>
                <span className="text-[10.5px] text-muted/80">
                  {mode === "register" ? "min. 8 characters" : ""}
                </span>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="pr-9"
                />
                <Lock className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11.5px] leading-relaxed text-danger"
              >
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" full size="lg" loading={busy === "form"}>
              {mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight className="size-4" />
            </Button>
          </form>


          <Button
            variant="secondary"
            full
            size="lg"
            className="mt-3"
            loading={busy === "demo"}
            onClick={demo}
            icon={<Sparkles className="size-4 text-primary" />}
          >
            Continue with the demo account
          </Button>
          <p className="mt-3 text-center font-mono text-[10px] tracking-wide text-muted">
            {DEMO_EMAIL} · {DEMO_PASSWORD}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px] text-muted/80">
            <span className="flex items-center gap-1">
              <Mail className="size-3" /> no email verification
            </span>
            <span className="flex items-center gap-1">
              <UserRound className="size-3" /> per-account data
            </span>
            <span className="flex items-center gap-1">
              <Lock className="size-3" /> hashed passwords
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
