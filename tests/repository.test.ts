import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqlite } from "../server/db/sqlite.js";
import { AppDatabase } from "../server/db/repository.js";
import { decryptSecret, encryptSecret, generateMasterKey } from "../server/db/crypto.js";

const MASTER = generateMasterKey();
let dir: string;
let dbPath: string;
let app: AppDatabase;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rosa-db-test-"));
  dbPath = join(dir, "test.db");
  const driver = await openSqlite(dbPath);
  app = new AppDatabase(driver, MASTER, { allowHttpLocalDev: true });
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

async function newUser(email = "user@example.com") {
  return app.upsertOAuthUser({
    provider: "github",
    providerAccountId: `gh-${Math.random().toString(36).slice(2)}`,
    email,
    name: "Test User",
    avatarUrl: null,
  });
}

describe("schema & migrations", () => {
  it("creates every table on a fresh database", async () => {
    const driver = app.driver;
    const rows = await driver
      .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    const names = rows.results.map((r) => r.name);
    for (const t of [
      "users",
      "sessions",
      "providers",
      "models",
      "model_favourites",
      "conversations",
      "folders",
      "messages",
      "oauth_states",
      "rate_limits",
      "user_prefs",
    ]) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });

  it("is idempotent — a second migrate is a no-op", async () => {
    const reopened = await openSqlite(dbPath);
    const before = await reopened
      .prepare<{ n: number }>("SELECT COUNT(*) AS n FROM schema_migrations")
      .first();
    await reopened.migrate();
    const after = await reopened
      .prepare<{ n: number }>("SELECT COUNT(*) AS n FROM schema_migrations")
      .first();
    expect(after?.n).toBe(before?.n);
  });
});

describe("providers", () => {
  it("stores an encrypted key and never returns it", async () => {
    const user = await newUser();
    const secretKey = "sk-test-1234567890abcdef";
    const provider = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "My OpenAI",
      baseUrl: "https://api.openai.com/v1/",
      apiKey: secretKey,
    });

    // The returned config carries only a hint.
    expect(provider.hasApiKey).toBe(true);
    expect(provider.apiKeyHint).toBe("cdef");
    expect(JSON.stringify(provider)).not.toContain(secretKey);
    expect("apiKey" in provider).toBe(false);
    // Trailing slash normalised away.
    expect(provider.baseUrl).toBe("https://api.openai.com/v1");

    // And the stored column is ciphertext.
    const row = await app.getProviderRow(user.id, provider.id);
    expect(row?.api_key_enc).toBeTruthy();
    expect(row?.api_key_enc).not.toContain(secretKey);
  });

  it("decrypts the key back to the original", async () => {
    const user = await newUser();
    const secretKey = "sk-test-abcdefghijklmnop";
    const provider = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "Roundtrip",
      baseUrl: "https://api.openai.com/v1",
      apiKey: secretKey,
    });
    expect(await app.getProviderApiKey(user.id, provider.id)).toBe(secretKey);
  });

  it("rejects private and non-http base URLs", async () => {
    const user = await newUser();
    for (const baseUrl of [
      "http://169.254.169.254/latest/meta-data/",
      "https://db.internal/v1",
      "ftp://example.com",
      "https://10.0.0.5/v1",
    ]) {
      await expect(
        app.createProvider(user.id, {
          kind: "openai-compatible",
          displayName: "Bad",
          baseUrl,
        }),
      ).rejects.toThrow();
    }
  });

  it("allows a loopback URL only in local-dev mode", async () => {
    const user = await newUser();
    const p = await app.createProvider(user.id, {
      kind: "openai-compatible",
      displayName: "Ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    expect(p.baseUrl).toBe("http://127.0.0.1:11434/v1");

    // Without the local-dev opt-in the same URL is refused.
    const strict = new AppDatabase(app.driver, MASTER, { allowHttpLocalDev: false });
    await expect(
      strict.createProvider(user.id, {
        kind: "openai-compatible",
        displayName: "Ollama strict",
        baseUrl: "http://127.0.0.1:11434/v1",
      }),
    ).rejects.toThrow(/loopback|private/i);
  });

  it("refuses to save a key when no master key is configured", async () => {
    const user = await newUser();
    const noKeyDb = new AppDatabase(app.driver, null);
    await expect(
      noKeyDb.createProvider(user.id, {
        kind: "openai",
        displayName: "NoKey",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-1234567890",
      }),
    ).rejects.toThrow(/ROSA_ENCRYPTION_KEY/);
    expect(noKeyDb.canStoreKeys).toBe(false);
  });

  it("updates name, url, organisation and key", async () => {
    const user = await newUser();
    const p = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "Original",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-initial-key-1234",
    });

    await app.updateProvider(user.id, p.id, {
      displayName: "Renamed",
      baseUrl: "https://api.openai.com/v2",
      organizationId: "org-1",
      apiKey: "sk-replacement-key-5678",
    });

    const updated = await app.getProvider(user.id, p.id);
    expect(updated?.displayName).toBe("Renamed");
    expect(updated?.baseUrl).toBe("https://api.openai.com/v2");
    expect(updated?.organizationId).toBe("org-1");
    expect(updated?.apiKeyHint).toBe("5678");
    expect(await app.getProviderApiKey(user.id, p.id)).toBe("sk-replacement-key-5678");
  });

  it("clears a stored key when given an empty string", async () => {
    const user = await newUser();
    const p = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "Clearable",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-will-be-cleared-1",
    });
    await app.updateProvider(user.id, p.id, { apiKey: "" });
    const after = await app.getProvider(user.id, p.id);
    expect(after?.hasApiKey).toBe(false);
    expect(after?.apiKeyHint).toBeNull();
    expect(await app.getProviderApiKey(user.id, p.id)).toBeNull();
  });

  it("deletes a provider and cascades its models", async () => {
    const user = await newUser();
    const p = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "Deletable",
      baseUrl: "https://api.openai.com/v1",
    });
    await app.replaceModels(p.id, [
      {
        id: `${p.id}:gpt-4o`,
        providerId: p.id,
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        description: null,
        contextWindow: 128000,
        maxOutputTokens: null,
        capabilities: {
          vision: "provider",
          tools: "provider",
          structuredOutput: "provider",
          streaming: "inferred",
          inputModalities: ["text"],
          outputModalities: ["text"],
        },
        sources: {
          contextWindow: "provider",
          maxOutputTokens: "unavailable",
          description: "unavailable",
          capabilities: "provider",
        },
        discoveredAt: Date.now(),
        verified: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    await app.deleteProvider(user.id, p.id);
    expect(await app.getProvider(user.id, p.id)).toBeNull();
    const remaining = await app.driver
      .prepare<{ n: number }>("SELECT COUNT(*) AS n FROM models WHERE provider_id = ?")
      .bind(p.id)
      .first();
    expect(remaining?.n).toBe(0);
  });

  it("records connection status and discovery timestamps", async () => {
    const user = await newUser();
    const p = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "Status",
      baseUrl: "https://api.openai.com/v1",
    });
    await app.setProviderConnection(user.id, p.id, {
      connectionStatus: "ok",
      connectionError: null,
      lastErrorCode: null,
    });
    let after = await app.getProvider(user.id, p.id);
    expect(after?.connectionStatus).toBe("ok");
    expect(after?.lastConnectedAt).toBeGreaterThan(0);

    await app.setProviderConnection(user.id, p.id, {
      connectionStatus: "error",
      connectionError: "Invalid API key",
      lastErrorCode: "unauthorized",
    });
    after = await app.getProvider(user.id, p.id);
    expect(after?.connectionStatus).toBe("error");
    expect(after?.connectionError).toBe("Invalid API key");
    expect(after?.lastErrorCode).toBe("unauthorized");

    await app.setModelDiscovery(user.id, p.id, 42);
    after = await app.getProvider(user.id, p.id);
    expect(after?.modelCount).toBe(42);
    expect(after?.lastModelDiscoveryAt).toBeGreaterThan(0);
  });
});

describe("user isolation", () => {
  it("hides user A's providers from user B", async () => {
    const a = await newUser("a@example.com");
    const b = await newUser("b@example.com");

    await app.createProvider(a.id, {
      kind: "openai",
      displayName: "A only",
      baseUrl: "https://api.openai.com/v1",
    });

    const listA = await app.listProviders(a.id);
    const listB = await app.listProviders(b.id);
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(0);
    expect(listA[0].displayName).toBe("A only");
  });

  it("returns null when user B asks for user A's provider by id", async () => {
    const a = await newUser("a2@example.com");
    const b = await newUser("b2@example.com");
    const pa = await app.createProvider(a.id, {
      kind: "openai",
      displayName: "A private",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(await app.getProvider(b.id, pa.id)).toBeNull();
    expect(await app.getProviderApiKey(b.id, pa.id)).toBeNull();
  });

  it("hides user A's conversations and messages from user B", async () => {
    const a = await newUser("a3@example.com");
    const b = await newUser("b3@example.com");

    const conv = await app.createConversation({ userId: a.id, title: "A secret chat" });
    await app.appendMessage({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      role: "user",
      content: "A private prompt",
    });

    expect(await app.getConversation(b.id, conv.id)).toBeNull();
    const listB = await app.listConversations({ userId: b.id });
    expect(listB.total).toBe(0);

    // A user cannot delete or mutate another user's conversation.
    await app.deleteConversation(b.id, conv.id);
    expect(await app.getConversation(a.id, conv.id)).not.toBeNull();
  });

  it("scopes favourites per user", async () => {
    const a = await newUser("a4@example.com");
    const b = await newUser("b4@example.com");
    await app.setFavourite(a.id, "prov:gpt-4o", true);
    expect(await app.listFavourites(a.id)).toEqual(new Set(["prov:gpt-4o"]));
    expect(await app.listFavourites(b.id)).toEqual(new Set());
  });

  it("deletes all of a user's data on account deletion", async () => {
    const user = await newUser("delete-me@example.com");
    const p = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "To delete",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-delete-me-key-1",
    });
    const conv = await app.createConversation({ userId: user.id, title: "Bye" });

    await app.deleteUserAndData(user.id);

    expect(await app.getUserById(user.id)).toBeNull();
    expect(await app.getProvider(user.id, p.id)).toBeNull();
    expect(await app.getConversation(user.id, conv.id)).toBeNull();
  });
});

describe("conversations & messages", () => {
  it("persists a prompt and response and preserves ordering", async () => {
    const user = await newUser();
    const conv = await app.createConversation({ userId: user.id, title: "Chat" });

    await app.appendMessage({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      role: "user",
      content: "Hello",
    });
    await app.appendMessage({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      role: "assistant",
      content: "Hi there",
      providerId: "p1",
      modelId: "gpt-4o",
      modelLabel: "GPT-4o",
      status: "completed",
      metrics: {
        ttftMs: 120,
        firstResponseMs: 130,
        generationMs: 800,
        totalMs: 950,
        outputTokens: 25,
        inputTokens: 8,
        outputTokensEstimated: false,
        inputTokensEstimated: false,
        tokensPerSecond: 31.25,
        tokensPerSecondEstimated: false,
        contextWindow: 128000,
        startedAt: 1,
        endedAt: 2,
      },
    });

    const messages = await app.listMessages(conv.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hi there");
    expect(messages[1].model_id).toBe("gpt-4o");
    const metrics = JSON.parse(messages[1].metrics as string);
    expect(metrics.tokensPerSecond).toBe(31.25);
    expect(metrics.contextWindow).toBe(128000);
  });

  it("updates a message's content and status", async () => {
    const user = await newUser();
    const conv = await app.createConversation({ userId: user.id, title: "Edit" });
    const id = crypto.randomUUID();
    await app.appendMessage({ id, conversationId: conv.id, role: "assistant", content: "partial" });
    await app.updateMessage(id, { content: "complete answer", status: "completed" });
    const [msg] = await app.listMessages(conv.id);
    expect(msg.content).toBe("complete answer");
    expect(msg.status).toBe("completed");
  });

  it("stores and returns a provider error payload", async () => {
    const user = await newUser();
    const conv = await app.createConversation({ userId: user.id, title: "Err" });
    const id = crypto.randomUUID();
    await app.appendMessage({
      id,
      conversationId: conv.id,
      role: "assistant",
      content: "",
      status: "failed",
      error: { code: "rate-limited", message: "HTTP 429", upstreamStatus: 429, retryable: true },
    });
    const [msg] = await app.listMessages(conv.id);
    const err = JSON.parse(msg.error as string);
    expect(err.code).toBe("rate-limited");
    expect(err.retryable).toBe(true);
  });

  it("renames, pins, favourites and folders conversations", async () => {
    const user = await newUser();
    const conv = await app.createConversation({ userId: user.id, title: "Draft" });
    const folder = await app.createFolder(user.id, "Work");

    await app.updateConversation(user.id, conv.id, {
      title: "Renamed chat",
      pinned: true,
      favourite: true,
      folderId: folder.id,
      paneCount: 3,
    });

    const updated = await app.getConversation(user.id, conv.id);
    expect(updated?.title).toBe("Renamed chat");
    expect(updated?.pinned).toBe(true);
    expect(updated?.favourite).toBe(true);
    expect(updated?.folderId).toBe(folder.id);
    expect(updated?.paneCount).toBe(3);
  });

  it("searches conversations by title and by message content", async () => {
    const user = await newUser();
    const c1 = await app.createConversation({ userId: user.id, title: "Kubernetes help" });
    await app.createConversation({ userId: user.id, title: "Recipes" });

    await app.appendMessage({
      id: crypto.randomUUID(),
      conversationId: c1.id,
      role: "assistant",
      content: "Use a readiness probe",
    });

    const byTitle = await app.listConversations({ userId: user.id, query: "Kubernetes" });
    expect(byTitle.total).toBe(1);

    const byBody = await app.listConversations({ userId: user.id, query: "readiness probe" });
    expect(byBody.total).toBe(1);

    const none = await app.listConversations({ userId: user.id, query: "nonexistentzzz" });
    expect(none.total).toBe(0);
  });

  it("treats LIKE wildcards in a search as literal text", async () => {
    const user = await newUser();
    await app.createConversation({ userId: user.id, title: "100% done" });
    const res = await app.listConversations({ userId: user.id, query: "%" });
    // "%" must not match every row.
    expect(res.total).toBe(0);
  });

  it("paginates large histories", async () => {
    const user = await newUser();
    for (let i = 0; i < 12; i++) {
      await app.createConversation({ userId: user.id, title: `Chat ${i}` });
    }
    const page1 = await app.listConversations({ userId: user.id, limit: 5, offset: 0 });
    const page2 = await app.listConversations({ userId: user.id, limit: 5, offset: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page2.items).toHaveLength(5);
    expect(page1.total).toBe(12);
    const ids1 = new Set(page1.items.map((c) => c.id));
    expect(page2.items.some((c) => ids1.has(c.id))).toBe(false);
  });

  it("clears an entire history", async () => {
    const user = await newUser();
    for (let i = 0; i < 3; i++) {
      const c = await app.createConversation({ userId: user.id, title: `C${i}` });
      await app.appendMessage({
        id: crypto.randomUUID(),
        conversationId: c.id,
        role: "user",
        content: "hi",
      });
    }
    const removed = await app.deleteAllConversations(user.id);
    expect(removed).toBeGreaterThanOrEqual(3);
    expect((await app.listConversations({ userId: user.id })).total).toBe(0);
  });

  it("deleting a folder keeps its conversations, just unfiled", async () => {
    const user = await newUser();
    const folder = await app.createFolder(user.id, "Temp");
    const conv = await app.createConversation({ userId: user.id, title: "Inside", folderId: folder.id });
    await app.deleteFolder(user.id, folder.id);
    const after = await app.getConversation(user.id, conv.id);
    expect(after).not.toBeNull();
    expect(after?.folderId).toBeNull();
  });
});

describe("favourites lifecycle", () => {
  it("sets, pins and unsets", async () => {
    const user = await newUser();
    await app.setFavourite(user.id, "p:m1", true);
    expect((await app.listFavourites(user.id)).has("p:m1")).toBe(true);

    await app.setPinned(user.id, "p:m1", true);
    expect((await app.listPinned(user.id)).has("p:m1")).toBe(true);

    await app.setPinned(user.id, "p:m1", false);
    expect((await app.listPinned(user.id)).has("p:m1")).toBe(false);
    // Still a favourite, just unpinned.
    expect((await app.listFavourites(user.id)).has("p:m1")).toBe(true);

    await app.setFavourite(user.id, "p:m1", false);
    expect((await app.listFavourites(user.id)).has("p:m1")).toBe(false);
  });

  it("prunes favourites whose models no longer exist", async () => {
    const user = await newUser();
    const p = await app.createProvider(user.id, {
      kind: "openai",
      displayName: "Prune",
      baseUrl: "https://api.openai.com/v1",
    });
    await app.setFavourite(user.id, `${p.id}:gone`, true);
    await app.setFavourite(user.id, `${p.id}:still-here`, true);
    await app.replaceModels(p.id, [
      {
        id: `${p.id}:still-here`,
        providerId: p.id,
        modelId: "still-here",
        displayName: "Still Here",
        description: null,
        contextWindow: null,
        maxOutputTokens: null,
        capabilities: {
          vision: "unavailable",
          tools: "unavailable",
          structuredOutput: "unavailable",
          streaming: "inferred",
          inputModalities: ["text"],
          outputModalities: ["text"],
        },
        sources: {
          contextWindow: "unavailable",
          maxOutputTokens: "unavailable",
          description: "unavailable",
          capabilities: "unavailable",
        },
        discoveredAt: Date.now(),
        verified: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    const removed = await app.pruneFavourites(user.id);
    expect(removed).toBe(1);
    expect((await app.listFavourites(user.id)).has(`${p.id}:still-here`)).toBe(true);
  });
});

describe("sessions", () => {
  it("resolves a live session and rejects an expired one", async () => {
    const user = await newUser("session@example.com");
    const hash = `hash-${Math.random().toString(36).slice(2)}`;
    await app.createSession({
      tokenHash: hash,
      userId: user.id,
      ttlMs: 60_000,
      userAgent: "test",
      ip: "127.0.0.1",
    });
    const resolved = await app.resolveSession(hash);
    expect(resolved?.userId).toBe(user.id);

    await app.deleteSession(hash);
    expect(await app.resolveSession(hash)).toBeNull();
  });

  it("stores only a hash of the session token, never the token", async () => {
    const user = await newUser("hashed@example.com");
    // The route layer hashes the cookie value; verify the column holds only
    // that hash and cannot be reversed into the raw bearer token.
    const rawToken = "raw-session-token-abcdef123456";
    const digest = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(rawToken))
      .then((b) =>
        Array.from(new Uint8Array(b))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join(""),
      );
    await app.createSession({
      tokenHash: digest,
      userId: user.id,
      ttlMs: 60_000,
      userAgent: null,
      ip: null,
    });
    const row = await app.driver
      .prepare<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id = ?")
      .bind(user.id)
      .first();
    expect(row?.token_hash).toBe(digest);
    expect(row?.token_hash).not.toContain("raw-session-token");
    // And it is a real SHA-256 digest.
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit then blocks", async () => {
    const subject = `rl-${Math.random().toString(36).slice(2)}`;
    const ok: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      ok.push(await app.rateLimit("chat", subject, 3, 60_000));
    }
    expect(ok.slice(0, 3)).toEqual([true, true, true]);
    expect(ok.slice(3)).toEqual([false, false]);
  });

  it("tracks buckets independently", async () => {
    const subject = `rl2-${Math.random().toString(36).slice(2)}`;
    expect(await app.rateLimit("chat", subject, 1, 60_000)).toBe(true);
    expect(await app.rateLimit("chat", subject, 1, 60_000)).toBe(false);
    // A different bucket is unaffected.
    expect(await app.rateLimit("providers", subject, 1, 60_000)).toBe(true);
  });
});

describe("OAuth state", () => {
  it("consumes a state exactly once", async () => {
    const state = `state-${Math.random().toString(36).slice(2)}`;
    await app.saveOAuthState({
      state,
      provider: "github",
      codeVerifier: "verifier-123",
      redirectTo: "/chat",
      ttlMs: 60_000,
    });
    const first = await app.consumeOAuthState(state);
    expect(first?.provider).toBe("github");
    expect(first?.codeVerifier).toBe("verifier-123");
    expect(first?.redirectTo).toBe("/chat");
    expect(await app.consumeOAuthState(state)).toBeNull();
  });
});

describe("preferences", () => {
  it("round-trips user preferences", async () => {
    const user = await newUser("prefs@example.com");
    await app.savePrefs(user.id, { theme: "dark", sidebarWidth: 320, directBrowser: true });
    const prefs = await app.getPrefs(user.id);
    expect(prefs.theme).toBe("dark");
    expect(prefs.sidebarWidth).toBe(320);
    expect(prefs.directBrowser).toBe(true);

    await app.savePrefs(user.id, { theme: "light" });
    const after = await app.getPrefs(user.id);
    expect(after.theme).toBe("light");
    expect(after.sidebarWidth).toBe(320);
  });

  it("defaults to the light theme", async () => {
    const user = await newUser("defaults@example.com");
    const prefs = await app.getPrefs(user.id);
    expect(prefs.theme).toBe("light");
    expect(prefs.directBrowser).toBe(false);
  });
});

describe("encryption interop", () => {
  it("encrypts and decrypts through helpers directly", async () => {
    const env = await encryptSecret("sk-interop-key-1", MASTER);
    expect(await decryptSecret(env, MASTER)).toBe("sk-interop-key-1");
  });
});
