import { useEffect, useState } from "react";
import { cn } from "../lib/cn.js";
import { getHealth, type HealthInfo } from "../lib/api.js";
import { useTheme } from "../lib/hooks.js";
import { SparkIcon, SunIcon, MoonIcon, CheckIcon } from "./ui/Icons.js";

export interface LoginScreenProps {
  bootError?: string | null;
  onSignedIn: () => void;
}

/**
 * Sign-in screen.
 *
 * Providers are discovered from /api/health at runtime, so a deployment that
 * has only configured GitHub shows only GitHub. A deployment with neither
 * shows an explicit, actionable message instead of a dead button.
 */
export function LoginScreen({ bootError, onSignedIn }: LoginScreenProps) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  // The OAuth error arrives as a query parameter on the redirect back from the
  // provider; read it directly rather than pulling in a router dependency.
  const oauthError = useQueryError();

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then(setHealth)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
    return () => controller.abort();
  }, []);

  const providers = health?.auth ?? [];
  const message = oauthError ?? bootError;

  const start = (providerId: string) => {
    // A real form POST keeps this working without client-side fetch and lets
    // the server set its single-use state cookie before redirecting.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/auth/${providerId}/start`;
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-10">
      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-40"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, var(--brand-100) 0%, transparent 70%), radial-gradient(40% 40% at 85% 90%, var(--brand-50) 0%, transparent 70%)",
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-subtle bg-surface-raised text-ink-muted transition-colors hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      </button>

      <div className="relative w-full max-w-[400px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
            <SparkIcon size={24} />
          </span>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink-strong">ROSA</h1>
          <p className="max-w-[320px] text-[14px] leading-relaxed text-ink-muted">
            Chat and compare AI models side by side. Bring your own API keys —
            the deployment owner never pays for your inference.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-line-subtle bg-surface-overlay p-6 shadow-xl shadow-ink-strong/5">
          <h2 className="text-[15px] font-semibold text-ink-strong">Sign in</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Sign in to save conversations, providers and model favourites.
          </p>

          {message ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-state-danger/30 bg-state-danger-bg px-3 py-2 text-[12px] leading-snug text-state-danger-strong"
            >
              {message}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2.5">
            {loadError ? (
              <p className="rounded-lg border border-state-warning/30 bg-state-warning-bg px-3 py-2 text-[12px] leading-snug text-state-warning-strong">
                Could not reach the API ({loadError}). Start the API server and
                reload this page.
              </p>
            ) : providers.length === 0 ? (
              <p className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-[12px] leading-snug text-ink-muted">
                This deployment has no OAuth sign-in configured. Set{" "}
                <code className="font-mono text-[11px]">GITHUB_CLIENT_ID</code>/{" "}
                <code className="font-mono text-[11px]">GITHUB_CLIENT_SECRET</code> or{" "}
                <code className="font-mono text-[11px]">GOOGLE_CLIENT_ID</code>/{" "}
                <code className="font-mono text-[11px]">GOOGLE_CLIENT_SECRET</code>{" "}
                in the server environment. See{" "}
                <code className="font-mono text-[11px]">docs/OAUTH_SETUP.md</code>.
              </p>
            ) : (
              providers.map((providerId) => (
                <ProviderButton
                  key={providerId}
                  providerId={providerId}
                  onClick={() => start(providerId)}
                />
              ))
            )}
          </div>

          <ul className="mt-6 flex flex-col gap-2 border-t border-line-subtle pt-5">
            {[
              "Your API keys are encrypted with AES-256-GCM and never sent back to the browser.",
              "Up to 4 models answer the same prompt at once, each with its own stop button.",
              "Metrics are measured on the server, so TTFT and tokens/s are honest.",
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-[12px] leading-snug text-ink-muted"
              >
                <span className="mt-px shrink-0 text-state-positive-strong">
                  <CheckIcon size={13} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        {health ? (
          <p className="mt-4 text-center text-[11px] text-ink-faint">
            {health.keyStorage === "encrypted-server-side"
              ? "Key storage: encrypted server-side"
              : "Key storage: session-only (set ROSA_ENCRYPTION_KEY to persist keys)"}
          </p>
        ) : null}

        {/* Allows the parent to move this component into the app once the
            session cookie is confirmed by the callback redirect. */}
        <span className="hidden" aria-hidden="true" onClick={onSignedIn} />
      </div>
    </div>
  );
}

/** Read `?error=` from the URL without depending on a router. */
function useQueryError(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = new URLSearchParams(window.location.search).get("error");
    return value ? value : null;
  } catch {
    return null;
  }
}

function ProviderButton({
  providerId,
  onClick,
}: {
  providerId: string;
  onClick: () => void;
}) {
  const isGithub = providerId === "github";
  const label = isGithub ? "GitHub" : providerId === "google" ? "Google" : providerId;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2.5 rounded-lg px-4 text-[14px] font-medium",
        "border border-line-strong bg-surface-raised text-ink-strong transition-colors",
        "hover:bg-surface-sunken",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
      )}
    >
      {isGithub ? <GithubMark /> : <GoogleMark />}
      Continue with {label}
    </button>
  );
}

function GithubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 1.5a8.5 8.5 0 00-2.69 16.57c.43.08.59-.19.59-.42v-1.5c-2.37.51-2.87-1.13-2.87-1.13-.39-.99-.95-1.25-.95-1.25-.77-.53.06-.52.06-.52.85.06 1.3.88 1.3.88.76 1.31 1.98.93 2.46.71.08-.55.3-.93.54-1.14-1.89-.22-3.88-.95-3.88-4.21 0-.93.33-1.69.88-2.28-.09-.22-.38-1.09.08-2.27 0 0 .71-.23 2.33.88a8.1 8.1 0 014.24 0c1.62-1.11 2.33-.88 2.33-.88.46 1.18.17 2.05.08 2.27.55.59.88 1.35.88 2.28 0 3.27-2 3.99-3.9 4.2.31.27.58.79.58 1.6v2.37c0 .23.16.51.6.42A8.5 8.5 0 0010 1.5z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
      <path fill="#4285F4" d="M18.2 10.2c0-.65-.06-1.27-.16-1.87H10v3.54h4.6a3.94 3.94 0 01-1.71 2.58v2.15h2.77c1.62-1.49 2.54-3.69 2.54-6.4z" />
      <path fill="#34A853" d="M10 18.5c2.31 0 4.25-.77 5.66-2.08l-2.77-2.15c-.77.52-1.75.82-2.89.82-2.22 0-4.1-1.5-4.77-3.51H2.36v2.24A8.5 8.5 0 0010 18.5z" />
      <path fill="#FBBC05" d="M5.23 11.58a5.1 5.1 0 010-3.24V6.1H2.36a8.5 8.5 0 000 7.72l2.87-2.24z" />
      <path fill="#EA4335" d="M10 4.98c1.25 0 2.37.43 3.25 1.28l2.44-2.44A7.63 7.63 0 0010 1.5a8.5 8.5 0 00-7.64 4.6l2.87 2.24c.67-2.01 2.55-3.36 4.77-3.36z" />
    </svg>
  );
}
