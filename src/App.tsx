import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { useAuth, useUser } from "@clerk/react";
import { Sidebar, type Theme } from "./components/Sidebar";
import { StudioHeader } from "./components/StudioHeader";
import { PrimaryWorkspace } from "./components/PrimaryWorkspace";
import { ViewPanel } from "./components/view/ViewPanel";

const ProvidersModal = lazy(() =>
  import("./components/ProvidersModal").then((m) => ({ default: m.ProvidersModal })),
);
const PromptLibraryModal = lazy(() =>
  import("./components/PromptLibraryModal").then((m) => ({ default: m.PromptLibraryModal })),
);
import type {
  NavItemId,
  ViewType,
  Msg,
  ChatPane,
  ModelWithProvider,
  ProviderConfig,
  Conversation,
  Folder as FolderType,
  UserProfile,
} from "./types";
import type { Mode } from "./components/composer/ModeMenu";
import {
  getSession,
  loginLocal,
  listProviders,
  listModels,
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listFolders,
  createFolder,
  deleteFolder,
  getHealth,
  getPrefs,
  savePrefs,
  streamChat,
  cancelChat,
  setTokenGetter,
  setFavouriteModel,
  formatErrorMessage,
} from "./lib/api";

const VIEW_MIN = 380;
const VIEW_DEFAULT = 480;

export function App() {
  const { getToken, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();

  // Primary State
  const [activeNav, setActiveNav] = useState<NavItemId>("new-chat");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [keyStorage, setKeyStorage] = useState("encrypted-server-side");

  // Providers & Models
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelWithProvider[]>([]);
  const [selectedModel, setSelectedModel] = useState<{ providerId: string; modelId: string } | null>(null);

  // Conversations & Folders
  const [conversations, setConversations] = useState<
    Array<Conversation & { messageCount: number; lastMessageAt: number | null }>
  >([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New Conversation");
  const [folders, setFolders] = useState<FolderType[]>([]);

  // Multi-Pane Comparison State
  const [paneCount, setPaneCount] = useState<1 | 2 | 3 | 4>(1);
  const [panes, setPanes] = useState<ChatPane[]>([
    {
      id: 0,
      providerId: "",
      modelId: "",
      modelLabel: "Model 1",
      streaming: false,
      streamingContent: "",
      metrics: null,
      error: null,
    },
    {
      id: 1,
      providerId: "",
      modelId: "",
      modelLabel: "Model 2",
      streaming: false,
      streamingContent: "",
      metrics: null,
      error: null,
    },
    {
      id: 2,
      providerId: "",
      modelId: "",
      modelLabel: "Model 3",
      streaming: false,
      streamingContent: "",
      metrics: null,
      error: null,
    },
    {
      id: 3,
      providerId: "",
      modelId: "",
      modelLabel: "Model 4",
      streaming: false,
      streamingContent: "",
      metrics: null,
      error: null,
    },
  ]);

  // Chat Execution
  const [messages, setMessages] = useState<Msg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("Ask");
  const [temperature, setTemperature] = useState(0.7);

  // Abort Controllers for in-flight streams
  const activeControllersRef = useRef<Map<number, { controller: AbortController; requestId: string }>>(
    new Map(),
  );

  // Views & Modals
  const [viewType, setViewType] = useState<ViewType | null>(null);
  const [viewWidth, setViewWidth] = useState(VIEW_DEFAULT);
  const [isProvidersOpen, setIsProvidersOpen] = useState(false);
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);

  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem("rosa-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Attach Clerk token getter to API client
  useEffect(() => {
    if (getToken) {
      setTokenGetter(async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      });
    }
  }, [getToken]);

  // Theme change
  useEffect(() => {
    try {
      localStorage.setItem("rosa-theme", theme);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    const body = document.body;
    if (theme === "dark") {
      root.classList.remove("light", "theme-light");
      root.classList.add("dark", "theme-dark");
      body.classList.remove("light", "theme-light");
      body.classList.add("dark", "theme-dark");
    } else {
      root.classList.remove("dark", "theme-dark");
      root.classList.add("light", "theme-light");
      body.classList.remove("dark", "theme-dark");
      body.classList.add("light", "theme-light");
    }
  }, [theme]);

  // Global keyboard shortcuts (Ctrl/Cmd+K, Ctrl/Cmd+P, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>("textarea");
        ta?.focus();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setIsProvidersOpen((prev) => !prev);
      } else if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleNewChat();
      } else if (e.key === "Escape") {
        if (isLoading) {
          handleCancelStream();
        } else if (isProvidersOpen) {
          setIsProvidersOpen(false);
        } else if (isPromptLibraryOpen) {
          setIsPromptLibraryOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoading, isProvidersOpen, isPromptLibraryOpen]);

  // Auto-collapse sidebar on narrow screens
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsCollapsed(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Initial Load: health, session, prefs, providers, models, conversations, folders
  const loadInitialData = useCallback(async () => {
    try {
      const health = await getHealth();
      if (health) setKeyStorage(health.keyStorage);

      // Session
      let sess = await getSession();
      if (!sess.user && !isSignedIn) {
        try {
          // Attempt local dev sign-in
          const localLogin = await loginLocal();
          if (localLogin.user) {
            sess = { user: localLogin.user };
          }
        } catch {
          /* fallback */
        }
      }
      if (sess.user) {
        setUser(sess.user);
      } else if (clerkUser) {
        setUser({
          id: clerkUser.id,
          name: clerkUser.fullName || clerkUser.firstName || "Clerk User",
          email: clerkUser.primaryEmailAddress?.emailAddress || null,
          avatarUrl: clerkUser.imageUrl || null,
          createdAt: Date.now(),
        });
      }

      // Prefs
      const prefs = await getPrefs();
      if (typeof prefs?.sidebarWidth === "number") {
        setSidebarWidth(prefs.sidebarWidth);
      }

      // Providers & Models
      const pList = await listProviders();
      setProviders(pList);

      const mList = await listModels();
      setModels(mList);

      // Default model selection
      if (mList.length > 0) {
        const first = mList[0]!;
        setSelectedModel({ providerId: first.providerId, modelId: first.modelId });

        // Update default pane models
        setPanes((prev) =>
          prev.map((p, idx) => {
            const assigned = mList[idx % mList.length] || first;
            return {
              ...p,
              providerId: assigned.providerId,
              modelId: assigned.modelId,
              modelLabel: assigned.displayName || assigned.modelId,
            };
          }),
        );
      }

      // Conversations & Folders
      const convRes = await listConversations();
      setConversations(convRes.conversations);

      const fList = await listFolders();
      setFolders(fList);
    } catch {
      /* ignore */
    }
  }, [isSignedIn, clerkUser]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Refresh Providers and Models
  const refreshProviders = async () => {
    const pList = await listProviders();
    setProviders(pList);
  };

  const refreshModels = async () => {
    const mList = await listModels();
    setModels(mList);
    if (!selectedModel && mList.length > 0) {
      const first = mList[0]!;
      setSelectedModel({ providerId: first.providerId, modelId: first.modelId });
    }
  };

  const handleToggleFavouriteModel = async (providerId: string, modelId: string, current: boolean) => {
    try {
      await setFavouriteModel(providerId, modelId, !current);
      setModels((prev) =>
        prev.map((m) =>
          m.providerId === providerId && m.modelId === modelId ? { ...m, favourite: !current } : m,
        ),
      );
    } catch {
      /* ignore */
    }
  };

  // Select / Switch Conversation
  const handleSelectConversation = async (convId: string) => {
    try {
      setActiveConversationId(convId);
      const res = await getConversation(convId);
      setConversationTitle(res.conversation.title);
      setPaneCount(res.conversation.paneCount || 1);

      // Map messages
      const mappedMsgs: Msg[] = (res.messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        providerId: m.providerId,
        modelId: m.modelId,
        modelLabel: m.modelLabel,
        metrics: m.metrics,
        error: m.error ? formatErrorMessage(m.error) : null,
        paneIndex: m.paneIndex,
        createdAt: m.createdAt,
      }));
      setMessages(mappedMsgs);
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to load conversation.");
    }
  };

  // New Chat
  const handleNewChat = () => {
    setActiveConversationId(null);
    setConversationTitle("New Conversation");
    setMessages([]);
    setPrompt("");
    setPanes((prev) =>
      prev.map((p) => ({
        ...p,
        streaming: false,
        streamingContent: "",
        metrics: null,
        error: null,
      })),
    );
  };

  // Delete Conversation
  const handleDeleteConversation = async (id: string) => {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        handleNewChat();
      }
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to delete conversation.");
    }
  };

  // Rename Conversation
  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      await updateConversation(id, { title: newTitle });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)),
      );
      if (activeConversationId === id) {
        setConversationTitle(newTitle);
      }
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to rename conversation.");
    }
  };

  // Toggle Pin Conversation
  const handleTogglePin = async (id: string, current: boolean) => {
    try {
      await updateConversation(id, { pinned: !current });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, pinned: !current } : c)),
      );
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to update pin.");
    }
  };

  // Folders
  const handleCreateFolder = async (name: string) => {
    try {
      const folder = await createFolder(name);
      setFolders((prev) => [...prev, folder]);
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to create folder.");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
    } catch (err: unknown) {
      alert((err as Error)?.message || "Failed to delete folder.");
    }
  };

  // Update Pane Model (in comparison mode)
  const handleUpdatePaneModel = (
    paneIndex: number,
    model: { providerId: string; modelId: string; label?: string },
  ) => {
    setPanes((prev) => {
      const copy = [...prev];
      const target = copy[paneIndex];
      if (target) {
        copy[paneIndex] = {
          ...target,
          providerId: model.providerId,
          modelId: model.modelId,
          modelLabel: model.label || model.modelId,
        };
      }
      return copy;
    });
  };

  // Stop / Cancel active streams
  const handleCancelStream = async () => {
    activeControllersRef.current.forEach(({ controller, requestId }) => {
      controller.abort();
      cancelChat(requestId).catch(() => {});
    });
    activeControllersRef.current.clear();

    setIsLoading(false);
    setPanes((prev) =>
      prev.map((p) => ({
        ...p,
        streaming: false,
      })),
    );
  };

  // Send Prompt & Stream Response (Supports 1 to 4 Panes in parallel)
  const handleSendPrompt = async () => {
    const text = prompt.trim();
    if (!text || isLoading) return;

    // Check if models exist
    if (models.length === 0) {
      setIsProvidersOpen(true);
      return;
    }

    // Append user message
    const userMsg: Msg = {
      id: `usr-${Date.now()}`,
      role: "user",
      text,
      createdAt: Date.now(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setPrompt("");
    setIsLoading(true);

    // Ensure conversation exists on backend
    let currentConvId = activeConversationId;
    if (!currentConvId) {
      try {
        const titleSnippet = text.length > 36 ? `${text.slice(0, 36)}…` : text;
        const newConv = await createConversation({
          title: titleSnippet,
          paneCount,
        });
        currentConvId = newConv.id;
        setActiveConversationId(newConv.id);
        setConversationTitle(newConv.title);
        setConversations((prev) => [
          { ...newConv, messageCount: 1, lastMessageAt: Date.now() },
          ...prev,
        ]);
      } catch {
        /* fallback to session-only */
      }
    }

    // Active panes to run
    const activePanes = panes.slice(0, paneCount);

    // Reset pane streaming content
    setPanes((prev) =>
      prev.map((p, idx) =>
        idx < paneCount
          ? {
              ...p,
              streaming: true,
              streamingContent: "",
              metrics: null,
              error: null,
            }
          : p,
      ),
    );

    // Build chat history for LLM
    const history = updatedMessages.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    activeControllersRef.current.clear();

    // Fire streams in parallel
    const streamPromises = activePanes.map(async (pane, idx) => {
      const pId = pane.providerId || selectedModel?.providerId || models[0]?.providerId || "";
      const mId = pane.modelId || selectedModel?.modelId || models[0]?.modelId || "";
      const mLabel = pane.modelLabel || mId;

      const requestId = `req-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
      const controller = new AbortController();
      activeControllersRef.current.set(idx, { controller, requestId });

      let accumulatedText = "";

      try {
        await streamChat(
          {
            providerId: pId,
            modelId: mId,
            modelLabel: mLabel,
            messages: history,
            requestId,
            conversationId: currentConvId,
            temperature,
            stream: true,
          },
          {
            onDelta: (delta) => {
              accumulatedText += delta;
              setPanes((prev) => {
                const copy = [...prev];
                const cur = copy[idx];
                if (cur) {
                  copy[idx] = { ...cur, streamingContent: accumulatedText };
                }
                return copy;
              });
            },
            onDone: ({ metrics }) => {
              setPanes((prev) => {
                const copy = [...prev];
                const cur = copy[idx];
                if (cur) {
                  copy[idx] = {
                    ...cur,
                    streaming: false,
                    metrics: { ...metrics, startedAt: Date.now(), endedAt: Date.now() },
                  };
                }
                return copy;
              });

              // Add assistant turn to conversation messages
              setMessages((prev) => [
                ...prev,
                {
                  id: `ast-${Date.now()}-${idx}`,
                  role: "assistant",
                  text: accumulatedText,
                  providerId: pId,
                  modelId: mId,
                  modelLabel: mLabel,
                  paneIndex: paneCount > 1 ? idx : null,
                  metrics: { ...metrics, startedAt: Date.now(), endedAt: Date.now() },
                  createdAt: Date.now(),
                },
              ]);
            },
            onError: (err) => {
              const formattedError = formatErrorMessage(err);
              setPanes((prev) => {
                const copy = [...prev];
                const cur = copy[idx];
                if (cur) {
                  copy[idx] = {
                    ...cur,
                    streaming: false,
                    error: formattedError,
                  };
                }
                return copy;
              });

              setMessages((prev) => [
                ...prev,
                {
                  id: `err-${Date.now()}-${idx}`,
                  role: "assistant",
                  text: `⚠️ **${mLabel} Error:** ${formattedError}`,
                  providerId: pId,
                  modelId: mId,
                  modelLabel: mLabel,
                  paneIndex: paneCount > 1 ? idx : null,
                  error: formattedError,
                  createdAt: Date.now(),
                },
              ]);
            },
          },
          controller.signal,
        );
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          setPanes((prev) => {
            const copy = [...prev];
            const cur = copy[idx];
            if (cur) {
              copy[idx] = {
                ...cur,
                streaming: false,
                error: (err as Error)?.message || "Stream failed",
              };
            }
            return copy;
          });
        }
      } finally {
        activeControllersRef.current.delete(idx);
      }
    });

    await Promise.allSettled(streamPromises);
    setIsLoading(false);

    // Refresh conversation list to get latest message count
    try {
      const convRes = await listConversations();
      setConversations(convRes.conversations);
    } catch {
      /* ignore */
    }
  };

  const viewMax = Math.max(
    VIEW_MIN,
    Math.floor((window.innerWidth - (isCollapsed ? 72 : sidebarWidth)) * 0.7),
  );

  return (
    <div
      className={`w-screen h-screen flex overflow-hidden select-none font-sans text-[var(--text-primary)] bg-[var(--bg-app)] transition-colors duration-300 ${
        theme === "dark" ? "theme-dark" : "theme-light"
      }`}
    >
      {/* Sidebar */}
      <Sidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onTogglePinConversation={handleTogglePin}
        folders={folders}
        onCreateFolder={handleCreateFolder}
        onDeleteFolder={handleDeleteFolder}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onOpenProvidersModal={() => setIsProvidersOpen(true)}
        onOpenPromptLibraryModal={() => setIsPromptLibraryOpen(true)}
        providerCount={providers.length}
        user={user}
        theme={theme}
        onSetTheme={setTheme}
        width={sidebarWidth}
        onWidthChange={(w) => {
          setSidebarWidth(w);
          savePrefs({ sidebarWidth: w }).catch(() => {});
        }}
      />

      {/* Primary Area: Studio Header + PrimaryWorkspace + View Panel */}
      <div className="flex-1 h-screen flex flex-col overflow-hidden">
        <StudioHeader
          conversationTitle={conversationTitle}
          onUpdateTitle={(t) => {
            if (activeConversationId) {
              handleRenameConversation(activeConversationId, t);
            } else {
              setConversationTitle(t);
            }
          }}
          paneCount={paneCount}
          onSetPaneCount={(c) => {
            setPaneCount(c);
            if (activeConversationId) {
              updateConversation(activeConversationId, { paneCount: c }).catch(() => {});
            }
          }}
          providerCount={providers.length}
          onOpenProvidersModal={() => setIsProvidersOpen(true)}
          onResetChat={handleNewChat}
          viewType={viewType}
          onOpenView={(t) => setViewType(t)}
        />

        <div className="flex-1 flex overflow-hidden relative">
          <PrimaryWorkspace
            messages={messages}
            isLoading={isLoading}
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={handleSendPrompt}
            onCancelStream={handleCancelStream}
            mode={mode}
            onModeChange={setMode}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={(m) => {
              setSelectedModel(m);
              setPanes((prev) => {
                const copy = [...prev];
                copy[0] = {
                  ...copy[0]!,
                  providerId: m.providerId,
                  modelId: m.modelId,
                  modelLabel: m.label || m.modelId,
                };
                return copy;
              });
            }}
            onToggleFavourite={handleToggleFavouriteModel}
            onOpenProvidersModal={() => setIsProvidersOpen(true)}
            paneCount={paneCount}
            panes={panes}
            onUpdatePaneModel={handleUpdatePaneModel}
            temperature={temperature}
            onTemperatureChange={setTemperature}
            theme={theme}
          />

          {/* Conditional View Panel */}
          <AnimatePresence>
            {viewType && (
              <ViewPanel
                viewType={viewType}
                onTypeChange={setViewType}
                onClose={() => setViewType(null)}
                width={Math.min(viewWidth, viewMax)}
                onWidthChange={setViewWidth}
                maxWidth={viewMax}
                viewProps={{
                  panes: panes.slice(0, paneCount),
                  messages,
                  isLoading,
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Custom Providers Configuration Modal (Lazy loaded) */}
      <Suspense fallback={null}>
        {isProvidersOpen && (
          <ProvidersModal
            isOpen={isProvidersOpen}
            onClose={() => setIsProvidersOpen(false)}
            providers={providers}
            onRefreshProviders={refreshProviders}
            onRefreshModels={refreshModels}
            keyStorage={keyStorage}
          />
        )}
      </Suspense>

      {/* Prompt & Benchmark Library Modal (Lazy loaded) */}
      <Suspense fallback={null}>
        {isPromptLibraryOpen && (
          <PromptLibraryModal
            isOpen={isPromptLibraryOpen}
            onClose={() => setIsPromptLibraryOpen(false)}
            onSelectPrompt={(pr) => {
              setPrompt(pr);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
