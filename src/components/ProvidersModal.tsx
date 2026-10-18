import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Check,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Radio,
  Server,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ProviderConfig, ProviderKind } from "@shared/types.js";
import { PROVIDER_PRESETS } from "@shared/providers.js";
import {
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
  discoverModels,
} from "../lib/api";
import { ModelIcon } from "./composer/icons";

interface ProvidersModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderConfig[];
  onRefreshProviders: () => Promise<void>;
  onRefreshModels: () => Promise<void>;
  keyStorage?: string;
}

interface QuickPreset {
  label: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl: string;
  notes?: string;
  isLocal?: boolean;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "Ollama (Local)",
    kind: "openai-compatible",
    displayName: "Ollama Local",
    baseUrl: "http://localhost:11434/v1",
    notes: "Default local port 11434. No API key needed.",
    isLocal: true,
  },
  {
    label: "LM Studio",
    kind: "openai-compatible",
    displayName: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    notes: "Local model server port 1234. No API key needed.",
    isLocal: true,
  },
  {
    label: "OpenAI",
    kind: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    notes: "GPT-4o, o1, o3-mini series.",
  },
  {
    label: "Anthropic",
    kind: "anthropic",
    displayName: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    notes: "Claude 3.5 Sonnet, Claude 3.5 Haiku, Opus.",
  },
  {
    label: "Google Gemini",
    kind: "google",
    displayName: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    notes: "Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0.",
  },
  {
    label: "DeepSeek",
    kind: "openai-compatible",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    notes: "DeepSeek-V3, DeepSeek-R1 reasoning models.",
  },
  {
    label: "Groq",
    kind: "groq",
    displayName: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    notes: "Ultra-fast LPU inference for Llama 3 & Gemma.",
  },
  {
    label: "OpenRouter",
    kind: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    notes: "Aggregator accessing 100+ AI models.",
  },
];

export function ProvidersModal({
  isOpen,
  onClose,
  providers,
  onRefreshProviders,
  onRefreshModels,
  keyStorage = "encrypted-server-side",
}: ProvidersModalProps) {
  const [view, setView] = useState<"list" | "form">("list");
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);

  // Form state
  const [kind, setKind] = useState<ProviderKind>("openai-compatible");
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Per-provider action state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    id: string;
    type: "success" | "error";
    text: string;
  } | null>(null);

  const resetForm = () => {
    setEditingProvider(null);
    setKind("openai-compatible");
    setDisplayName("");
    setBaseUrl("");
    setApiKey("");
    setOrganizationId("");
    setShowApiKey(false);
    setFormError(null);
  };

  const openAddForm = () => {
    resetForm();
    applyPreset(QUICK_PRESETS[0]!);
    setView("form");
  };

  const openEditForm = (p: ProviderConfig) => {
    setEditingProvider(p);
    setKind(p.kind);
    setDisplayName(p.displayName);
    setBaseUrl(p.baseUrl);
    setApiKey("");
    setOrganizationId(p.organizationId || "");
    setShowApiKey(false);
    setFormError(null);
    setView("form");
  };

  const applyPreset = (preset: QuickPreset) => {
    setKind(preset.kind);
    setDisplayName(preset.displayName);
    setBaseUrl(preset.baseUrl);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setFormError("Display name is required.");
      return;
    }
    if (!baseUrl.trim()) {
      setFormError("Base URL is required.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingProvider) {
        await updateProvider(editingProvider.id, {
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          organizationId: organizationId.trim() || null,
        });
      } else {
        const created = await createProvider({
          kind,
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          organizationId: organizationId.trim() || null,
        });

        // Auto-test and discover models after creation if supported
        try {
          await testProvider(created.id);
          if (PROVIDER_PRESETS[kind]?.supportsListing) {
            await discoverModels(created.id);
          }
        } catch {
          /* background probe error non-blocking */
        }
      }

      await onRefreshProviders();
      await onRefreshModels();
      setView("list");
      resetForm();
    } catch (err: unknown) {
      setFormError((err as Error)?.message || "Failed to save provider.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setActionNotice(null);
    try {
      const res = await testProvider(id);
      if (res.ok) {
        const ms = res.latencyMs;
        const speedDesc = ms
          ? ms < 200
            ? `⚡ Ultra-fast (${ms}ms)`
            : ms < 800
              ? `✓ Connected (${ms}ms)`
              : `Slow connection (${ms}ms)`
          : "OK";
        setActionNotice({
          id,
          type: "success",
          text: `Endpoint verified: ${speedDesc}`,
        });
      } else {
        setActionNotice({
          id,
          type: "error",
          text: res.error || "Connection test failed.",
        });
      }
      await onRefreshProviders();
    } catch (err: unknown) {
      setActionNotice({
        id,
        type: "error",
        text: (err as Error)?.message || "Failed to reach endpoint",
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDiscover = async (id: string) => {
    setDiscoveringId(id);
    setActionNotice(null);
    try {
      const res = await discoverModels(id);
      setActionNotice({
        id,
        type: "success",
        text: `Discovered ${res.discovered} models (${res.added} added, ${res.updated} updated).`,
      });
      await onRefreshProviders();
      await onRefreshModels();
    } catch (err: unknown) {
      setActionNotice({
        id,
        type: "error",
        text: (err as Error)?.message || "Discovery failed.",
      });
    } finally {
      setDiscoveringId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove provider "${name}"?`)) return;
    try {
      await deleteProvider(id);
      await onRefreshProviders();
      await onRefreshModels();
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to delete provider.");
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-2xl max-h-[88vh] bg-white dark:bg-[#1a201b] text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden focus:outline-none">
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-transparent">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--lime)]/15 border border-[var(--lime)]/30 text-[var(--lime-text)] flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                  Custom AI Providers & Endpoints
                </Dialog.Title>
                <Dialog.Description className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2 mt-0.5">
                  <span>BYOK — Connect OpenAI, Anthropic, Ollama, DeepSeek & more</span>
                  <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.2 rounded bg-neutral-200/80 dark:bg-black/30 text-neutral-700 dark:text-neutral-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    {keyStorage === "encrypted-server-side"
                      ? "AES-GCM Encrypted"
                      : "Session Only"}
                  </span>
                </Dialog.Description>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {view === "list" && (
                <button
                  onClick={openAddForm}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--lime)] text-white hover:opacity-90 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Provider</span>
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#1a201b]">
            {view === "list" ? (
              <div className="space-y-4">
                {/* Providers count and quick status */}
                <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 pb-1">
                  <span>
                    Configured Endpoints ({providers.length})
                  </span>
                  <button
                    onClick={() => {
                      onRefreshProviders();
                      onRefreshModels();
                    }}
                    className="flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {providers.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed border-neutral-300 dark:border-white/15 rounded-xl bg-neutral-50 dark:bg-[#202721]">
                    <Radio className="w-10 h-10 mx-auto text-neutral-400 dark:text-neutral-500 mb-3 opacity-60" />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                      No custom providers configured yet
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-5 leading-relaxed">
                      Connect your OpenAI, Anthropic, or local Ollama / LM Studio endpoints. Rosa works with any standard or OpenAI-compatible LLM host.
                    </p>
                    <button
                      onClick={openAddForm}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[var(--lime)] text-white rounded-lg hover:opacity-90 transition-colors cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Your First Provider</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {providers.map((p) => {
                      const isTesting = testingId === p.id;
                      const isDiscovering = discoveringId === p.id;
                      const notice = actionNotice?.id === p.id ? actionNotice : null;

                      return (
                        <div
                          key={p.id}
                          className="p-4 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-[#232b24] hover:border-[var(--lime)] transition-all flex flex-col gap-3 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-white dark:bg-black/20 border border-neutral-200 dark:border-white/10 flex items-center justify-center shrink-0">
                                <ModelIcon type={p.kind} className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                    {p.displayName}
                                  </h4>
                                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-neutral-200/80 dark:bg-black/30 text-neutral-600 dark:text-neutral-400 shrink-0">
                                    {p.kind}
                                  </span>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate mt-0.5">
                                  {p.baseUrl}
                                </p>
                              </div>
                            </div>

                            {/* Status badge */}
                            <div className="flex items-center gap-2 shrink-0">
                              {p.connectionStatus === "ok" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Connected
                                </span>
                              ) : p.connectionStatus === "error" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                                  <AlertCircle className="w-3 h-3" />
                                  Error
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 bg-neutral-200/60 dark:bg-white/5 px-2 py-0.5 rounded-full">
                                  Untested
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Chips row: Key hint & Model count */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-white/10 pt-2.5">
                            <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>
                                {p.hasApiKey
                                  ? `••••••••${p.apiKeyHint || ""}`
                                  : "No API key (Local host)"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                              <Sparkles className="w-3.5 h-3.5 text-[var(--lime-text)]" />
                              <span>
                                {p.modelCount !== null ? `${p.modelCount} models discovered` : "0 models"}
                              </span>
                            </div>

                            <div className="flex-1" />

                            {/* Actions */}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleTest(p.id)}
                                disabled={isTesting}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                                title="Verify connectivity and response latency"
                              >
                                {isTesting ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-[var(--lime)]" />
                                ) : (
                                  <Zap className="w-3 h-3 text-amber-500" />
                                )}
                                <span>{isTesting ? "Testing…" : "Test Ping"}</span>
                              </button>

                              <button
                                onClick={() => handleDiscover(p.id)}
                                disabled={isDiscovering}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                                title="Discover available models from this endpoint"
                              >
                                {isDiscovering ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-[var(--lime)]" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                <span>{isDiscovering ? "Discovering…" : "Discover Models"}</span>
                              </button>

                              <button
                                onClick={() => openEditForm(p)}
                                className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                title="Edit Provider"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDelete(p.id, p.displayName)}
                                className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Delete Provider"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Action Notice feedback banner */}
                          {notice && (
                            <div
                              className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                                notice.type === "success"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {notice.type === "success" ? (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{notice.text}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Add / Edit Form */
              <form onSubmit={handleSave} className="space-y-5">
                {/* Quick Presets (Only when adding new) */}
                {!editingProvider && (
                  <div className="space-y-3">
                    <div>
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block mb-1.5">
                        Local Hosts (No API Key Required)
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {QUICK_PRESETS.filter((p) => p.isLocal).map((pr) => (
                          <button
                            key={pr.label}
                            type="button"
                            onClick={() => applyPreset(pr)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left border transition-all cursor-pointer ${
                              displayName === pr.displayName && baseUrl === pr.baseUrl
                                ? "border-[var(--lime)] bg-[var(--lime)]/15 text-[var(--lime)] dark:text-[var(--lime-text)] font-semibold shadow-xs"
                                : "border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#232b24] hover:border-[var(--lime)] text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            <ModelIcon type={pr.kind} className="w-4 h-4 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{pr.label}</div>
                              <div className="text-[10px] text-neutral-400 font-mono truncate">{pr.baseUrl}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block mb-1.5">
                        Cloud AI Providers (BYOK)
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {QUICK_PRESETS.filter((p) => !p.isLocal).map((pr) => (
                          <button
                            key={pr.label}
                            type="button"
                            onClick={() => applyPreset(pr)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left border transition-all cursor-pointer ${
                              displayName === pr.displayName && baseUrl === pr.baseUrl
                                ? "border-[var(--lime)] bg-[var(--lime)]/15 text-[var(--lime)] dark:text-[var(--lime-text)] font-semibold shadow-xs"
                                : "border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#232b24] hover:border-[var(--lime)] text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            <ModelIcon type={pr.kind} className="w-4 h-4 shrink-0" />
                            <span className="text-xs truncate">{pr.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Form fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Provider Kind
                    </label>
                    <select
                      value={kind}
                      onChange={(e) => {
                        const newKind = e.target.value as ProviderKind;
                        setKind(newKind);
                        const preset = PROVIDER_PRESETS[newKind];
                        if (preset && !baseUrl) {
                          setBaseUrl(preset.defaultBaseUrl);
                        }
                      }}
                      disabled={Boolean(editingProvider)}
                      className="w-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 rounded-xl px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:border-[var(--lime)] transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <option value="openai-compatible">Custom OpenAI-compatible (Ollama / vLLM / LM Studio / DeepSeek)</option>
                      <option value="openai">OpenAI Official</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="google">Google Gemini</option>
                      <option value="groq">Groq</option>
                      <option value="mistral">Mistral AI</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="cohere">Cohere</option>
                      <option value="azure-openai">Azure OpenAI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Display Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Ollama Local or Production Claude"
                      required
                      className="w-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 rounded-xl px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:border-[var(--lime)] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Base URL <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                      required
                      className="w-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 rounded-xl px-3 py-2 text-sm font-mono text-neutral-900 dark:text-neutral-100 outline-none focus:border-[var(--lime)] transition-colors"
                    />
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                      Local loopback addresses (http://localhost:11434/v1, http://127.0.0.1:1234/v1) are supported.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      API Key {kind === "openai-compatible" && baseUrl.includes("localhost") ? "(Optional for local Ollama)" : "(Required for cloud providers)"}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={
                          editingProvider?.hasApiKey
                            ? `Keep existing key (••••••••${editingProvider.apiKeyHint || ""})`
                            : "sk-... or x-api-key..."
                        }
                        className="w-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 rounded-xl px-3 py-2 pr-10 text-sm font-mono text-neutral-900 dark:text-neutral-100 outline-none focus:border-[var(--lime)] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                      Keys are encrypted server-side using AES-GCM and never returned in plaintext to the browser.
                    </p>
                  </div>

                  {(kind === "openai" || kind === "openai-compatible") && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Organization ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={organizationId}
                        onChange={(e) => setOrganizationId(e.target.value)}
                        placeholder="org-..."
                        className="w-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 rounded-xl px-3 py-2 text-sm font-mono text-neutral-900 dark:text-neutral-100 outline-none focus:border-[var(--lime)] transition-colors"
                      />
                    </div>
                  )}
                </div>

                {/* Form Error */}
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Submit row */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-200 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setView("list");
                      resetForm();
                    }}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-[var(--lime)] text-white hover:opacity-90 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{editingProvider ? "Save Changes" : "Save & Connect"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
