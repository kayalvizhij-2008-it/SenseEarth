import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "@/api/client";
import type { User } from "@/api/types";
import { LogoMark } from "@/components/ui";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/ui";

const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Google consent screen, so no session was created.",
  invalid_state:
    "This sign-in link is no longer valid. It may have expired or already been used — start again from the sign-in page.",
  token_exchange_failed:
    "The backend could not exchange the Google authorization code. Check the client ID, client secret and redirect URI.",
  userinfo_failed: "Google did not return your profile. Try signing in again.",
  incomplete_profile: "Google did not share an email address, which is required for an account.",
  email_not_verified: "That Google account's email is not verified, so it cannot be used here.",
  missing_code: "Google returned without an authorization code. Start the sign-in again.",
  account_failed: "The account could not be created or linked. Try again in a moment.",
};

export default function AuthCallbackPage() {
  useDocumentTitle("Completing sign-in");
  const location = useLocation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const failure = params.get("error");
    if (failure) {
      setError(ERRORS[failure] ?? `Google sign-in failed (${failure}).`);
      return;
    }
    const token = params.get("token");
    if (!token) {
      setError("The callback did not include a session token. Start the sign-in again.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!response.ok) throw new Error("The new session could not be verified.");
        const user = (await response.json()) as User;
        if (cancelled) return;
        setSession(token, user);
        toast("success", `Signed in as ${user.name}`, "Google account connected.");
        navigate("/app", { replace: true });
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Sign-in could not be completed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, setSession]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 text-center">
        <LogoMark className="mx-auto size-9 text-ink" />
        {error ? (
          <>
            <AlertTriangle className="mx-auto mt-6 size-6 text-danger" />
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">Sign-in did not finish</h1>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted" role="alert">
              {error}
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Link
                to="/login"
                className="rounded-full bg-primary px-4 py-2 text-[12px] font-medium text-primary-ink hover:opacity-90"
              >
                Back to sign in
              </Link>
              <Link to="/" className="rounded-full border border-line px-4 py-2 text-[12px] text-ink-soft hover:text-ink">
                Return to site
              </Link>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mt-6 size-5 animate-spin text-primary" />
            <h1 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">Verifying your Google session</h1>
            <p className="mt-2 text-[12.5px] text-muted">This takes a moment. You will land in the workspace.</p>
          </>
        )}
      </div>
    </div>
  );
}
