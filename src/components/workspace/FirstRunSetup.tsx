import { useState } from "react";
import type { Action, AppState } from "../../state/appState.js";
import { PROVIDER_PRESETS, presetFor } from "../../../shared/providers.js";
import type { ProviderKind } from "../../../shared/types.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { useToast } from "../ui/Toast.js";
import { KeyIcon, CheckIcon, ExternalIcon, CloseIcon } from "../ui/Icons.js";
import {
  createProvider,
  discoverModels,
  testProvider,
  type DiscoverModelsResult,
} from "../../lib/api.js";

export interface FirstRunSetupProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onRefreshModels: () => Promise<unknown>;
  onRefreshProviders: () => Promise<unknown>;
}

/**
 * Guided first-run: add one provider, paste one key, discover models.
 *
 * This is the whole setup path, so it is kept deliberately short — the app is
 * genuinely usable after one provider and one discovered model.
 */
export function FirstRunSetup({
  state,
  dispatch,
  onRefreshModels,
  onRefreshProviders,
}: FirstRunSetupProps) {
  const toast = useToast();
  const presets = Object.values(PROVIDER_PRESETS);

  const [selectedKind, setSelectedKind] = useState(presets[0]?.kind ?? "openai-compatible");
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "discover" | null>(null);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preset = presetFor(selectedKind as ProviderKind);

  const choosePreset = (kind: string) => {
    const next = presetFor(kind as ProviderKind);
    setSelectedKind(next.kind);
    setBaseUrl(next.defaultBaseUrl ?? "");
    setDisplayName(next.label ?? "");
    setError(null);
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const { provider } = await createProvider({
        kind: selectedKind,
        displayName: displayName.trim() || preset?.label || "Provider",
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      });
      setSavedProviderId(provider.id);
      await Promise.all([onRefreshProviders(), onRefreshModels()]);
      // Discovery is automatic whenever the provider supports it, so the user
      // does not have to find a second button.
      if (preset?.supportsListing && apiKey.trim()) {
        try {
          const discovered = await discoverModels(provider.id);
          await onRefreshModels();
          toast({
            tone: "success",
            message: `${discovered.count} models discovered from ${provider.displayName}.`,
          });
        } catch (err) {
          toast({
            tone: "warning",
            message: "Provider saved, but model discovery failed.",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        toast({ tone: "success", message: `${provider.displayName} is connected.` });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    if (!savedProviderId) return;
    setBusy("test");
    setError(null);
    try {
      const result = await testProvider(savedProviderId);
      toast({
        tone: "success",
        message: result.message,
        detail: result.modelCount ? `${result.modelCount} models reachable.` : undefined,
      });
      await onRefreshProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (state.providers.length > 0 && state.models.length === 0) {
    return (
      <NoModelsYet
        state={state}
        dispatch={dispatch}
        onRefreshModels={onRefreshModels}
        onRefreshProviders={onRefreshProviders}
      />
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-line-subtle bg-surface-raised p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <KeyIcon size={18} />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-ink-strong">
                Add your first provider
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                ROSA never funds inference. You supply your own API key — it is
                encrypted on the server and never returned to this browser.
              </p>
            </div>
          </div>

          {/* Provider presets */}
          <fieldset className="mt-5">
            <legend className="text-[12px] font-medium text-ink-strong">Provider</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const active = p.kind === selectedKind;
                return (
                  <button
                    key={p.kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() => choosePreset(p.kind)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                      active
                        ? "border-brand-300 bg-brand-50 font-medium text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200"
                        : "border-line-subtle text-ink-muted hover:bg-surface-sunken hover:text-ink-strong",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-col gap-3.5">
            <Input
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={preset?.label ?? "Provider"}
            />

            <Input
              label="Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset?.defaultBaseUrl ?? "https://api.example.com/v1"}
              mono
              hint={
                preset?.supportsListing
                  ? "Model discovery reads /models from this URL."
                  : "This provider has no model-listing endpoint, so model ids are entered manually."
              }
            />

            <Input
              label="API key"
              type="password"
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              mono
              hint="Stored encrypted with AES-256-GCM under a key only the server holds."
            />

            {error ? (
              <p className="rounded-lg border border-state-danger/30 bg-state-danger-bg px-3 py-2 text-[12px] leading-snug text-state-danger-strong">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => void save()} loading={busy === "save"}>
                Save &amp; discover models
              </Button>
              {savedProviderId ? (
                <Button variant="secondary" onClick={() => void runTest()} loading={busy === "test"}>
                  Test connection
                </Button>
              ) : null}
              {savedProviderId ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-state-positive-strong">
                  <CheckIcon size={12} />
                  saved
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-1.5 border-t border-line-subtle pt-4 text-[12px] text-ink-muted">
            <p className="font-medium text-ink-strong">What happens next</p>
            <ol className="flex list-decimal flex-col gap-1 pl-4">
              <li>ROSA fetches this provider&apos;s model list.</li>
              <li>Models appear with only the metadata the provider reports — no invented prices or context windows.</li>
              <li>You star the ones you use, then chat or compare.</li>
            </ol>
            <a
              href="/docs/providers"
              className="mt-1 inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
            >
              Provider setup reference
              <ExternalIcon size={11} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Providers exist, but no models have been discovered yet. */
function NoModelsYet({
  state,
  dispatch,
  onRefreshModels,
  onRefreshProviders,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onRefreshModels: () => Promise<unknown>;
  onRefreshProviders: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const runDiscovery = async (providerId: string) => {
    setBusy(providerId);
    try {
      const discovered: DiscoverModelsResult = await discoverModels(providerId);
      await onRefreshModels();
      await onRefreshProviders();
      toast({
        tone: "success",
        message: `${discovered.count} models discovered.`,
        detail: discovered.fromListing
          ? "Read from the provider's model-listing endpoint."
          : undefined,
      });
    } catch (err) {
      toast({
        tone: "danger",
        message: "Discovery failed.",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg rounded-2xl border border-line-subtle bg-surface-raised p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink-strong">
          No models discovered yet
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          You have {state.providers.length} provider
          {state.providers.length === 1 ? "" : "s"} connected. Refresh a model
          list to populate the library.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {state.providers.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center gap-2.5 rounded-lg border border-line-subtle px-3 py-2.5"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  provider.connectionStatus === "ok"
                    ? "bg-state-positive"
                    : provider.connectionStatus === "error"
                      ? "bg-state-danger"
                      : "bg-line-strong",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-strong">
                  {provider.displayName}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-faint">
                  {provider.baseUrl}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === provider.id}
                onClick={() => void runDiscovery(provider.id)}
              >
                Discover
              </Button>
            </li>
          ))}
        </ul>

        {state.providers.every((p) => presetFor(p.kind)?.supportsListing === false) ? (
          <p className="mt-4 rounded-lg border border-state-warning/30 bg-state-warning-bg px-3 py-2 text-[12px] leading-snug text-state-warning-strong">
            None of your providers expose a model-listing endpoint (Azure OpenAI,
            for example, requires deployment names). Add a provider whose
            endpoint lists models, or ask for the manual model-entry flow.
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "mode/set", mode: state.mode === "compare" ? "single" : "compare" })}
          >
            <CloseIcon size={12} />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
