import type { SqlDriver, BindValue } from "./driver.js";
import { decryptSecret, encryptSecret, keyHint } from "./crypto.js";
import { validateProviderBaseUrl } from "../../shared/urlGuard.js";
import type {
  Conversation,
  CreateProviderInput,
  Folder,
  ModelRecord,
  ModelWithProvider,
  ProviderConfig,
  ProviderKind,
  UpdateProviderInput,
  UserProfile,
} from "../../shared/types.js";

export class AppDatabase {
  constructor(
    private readonly db: SqlDriver,
    private readonly masterKey: string | null,
    private readonly opts: { allowHttpLocalDev?: boolean } = {},
  ) {}

  get driver(): SqlDriver {
    return this.db;
  }

  /**
   * True when we can actually persist provider keys.
   *
   * The 32-byte floor matches the AES-256 key the value is used to derive: a
   * shorter `ROSA_ENCRYPTION_KEY` still "works", so accepting it would silently
   * weaken every stored credential instead of failing loudly at startup.
   */
  get canStoreKeys(): boolean {
    return typeof this.masterKey === "string" && this.masterKey.length >= 32;
  }

  /* ---------------------------------------------------------------- */
  /* Users & sessions                                                  */
  /* ---------------------------------------------------------------- */

  async upsertOAuthUser(args: {
    provider: string;
    providerAccountId: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  }): Promise<UserProfile> {
    const existing = await this.db
      .prepare<{ id: string; email: string | null; name: string | null; avatar_url: string | null; created_at: number }>(
        "SELECT * FROM users WHERE provider = ? AND provider_account_id = ?",
      )
      .bind(args.provider, args.providerAccountId)
      .first();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?`,
        )
        .bind(args.email, args.name, args.avatarUrl, existing.id)
        .run();
      return {
        id: existing.id,
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
        createdAt: existing.created_at,
      };
    }

    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO users (id, email, name, avatar_url, provider, provider_account_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, args.email, args.name, args.avatarUrl, args.provider, args.providerAccountId, Date.now())
      .run();

    return {
      id,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      createdAt: Date.now(),
    };
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    const row = await this.db
      .prepare<{ id: string; email: string | null; name: string | null; avatar_url: string | null; created_at: number }>(
        "SELECT * FROM users WHERE id = ?",
      )
      .bind(id)
      .first();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    };
  }

  async createSession(args: {
    tokenHash: string;
    userId: string;
    ttlMs: number;
    userAgent: string | null;
    ip: string | null;
  }): Promise<{ token: string; expiresAt: number }> {
    const now = Date.now();
    const expiresAt = now + args.ttlMs;
    await this.db
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, ip)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(args.tokenHash, args.userId, now, expiresAt, args.userAgent, args.ip)
      .run();
    return { token: args.tokenHash, expiresAt };
  }

  async resolveSession(tokenHash: string): Promise<{ userId: string; expiresAt: number } | null> {
    const row = await this.db
      .prepare<{ user_id: string; expires_at: number }>(
        "SELECT user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?",
      )
      .bind(tokenHash, Date.now())
      .first();
    if (!row) return null;
    return { userId: row.user_id, expiresAt: row.expires_at };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  }

  async deleteUserAndData(userId: string): Promise<void> {
    // ON DELETE CASCADE handles providers, conversations, messages, favourites.
    await this.db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  }

  /* ---------------------------------------------------------------- */
  /* Providers                                                         */
  /* ---------------------------------------------------------------- */

  async createProvider(
    userId: string,
    input: CreateProviderInput,
    opts?: { allowHttpLocalDev?: boolean },
  ): Promise<ProviderConfig> {
    const verdict = validateProviderBaseUrl(input.baseUrl, {
      allowHttpLocalDev: opts?.allowHttpLocalDev ?? this.opts.allowHttpLocalDev,
    });
    if (!verdict.ok) {
      throw new Error(verdict.message);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const hint = input.apiKey ? keyHint(input.apiKey) : null;
    let enc: string | null = null;

    if (input.apiKey) {
      if (!this.canStoreKeys) {
        throw new Error(
          "Server-side key storage is unavailable because ROSA_ENCRYPTION_KEY is not configured. Use session-only mode instead of saving the key.",
        );
      }
      enc = await encryptSecret(input.apiKey, this.masterKey!);
    }

    await this.db
      .prepare(
        `INSERT INTO providers
           (id, user_id, kind, display_name, base_url, api_key_enc, api_key_hint,
            organization_id, status, connection_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'unknown', ?, ?)`,
      )
      .bind(
        id,
        userId,
        input.kind,
        input.displayName.trim() || "Provider",
        verdict.normalized,
        enc,
        hint,
        input.organizationId ?? null,
        now,
        now,
      )
      .run();

    return this.getProvider(userId, id) as Promise<ProviderConfig>;
  }

  async updateProvider(
    userId: string,
    id: string,
    input: UpdateProviderInput,
    opts?: { allowHttpLocalDev?: boolean },
  ): Promise<void> {
    const existing = await this.getProviderRow(userId, id);
    if (!existing) throw new Error("Provider not found.");

    const sets: string[] = [];
    const args: BindValue[] = [];

    if (input.displayName !== undefined) {
      sets.push("display_name = ?");
      args.push(input.displayName.trim() || "Provider");
    }
    if (input.baseUrl !== undefined) {
      const verdict = validateProviderBaseUrl(input.baseUrl, {
        allowHttpLocalDev: opts?.allowHttpLocalDev ?? this.opts.allowHttpLocalDev,
      });
      if (!verdict.ok) throw new Error(verdict.message);
      sets.push("base_url = ?");
      args.push(verdict.normalized);
    }
    if (input.organizationId !== undefined) {
      sets.push("organization_id = ?");
      args.push(input.organizationId);
    }
    if (input.status !== undefined) {
      sets.push("status = ?");
      args.push(input.status ? 1 : 0);
    }
    if (input.apiKey !== undefined) {
      if (input.apiKey === "") {
        // Explicit "clear the stored key".
        sets.push("api_key_enc = ?", "api_key_hint = ?");
        args.push(null, null);
      } else {
        if (!this.canStoreKeys) {
          throw new Error(
            "Server-side key storage is unavailable because ROSA_ENCRYPTION_KEY is not configured.",
          );
        }
        sets.push("api_key_enc = ?", "api_key_hint = ?");
        args.push(await encryptSecret(input.apiKey, this.masterKey!), keyHint(input.apiKey));
      }
    }

    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    args.push(Date.now(), userId, id);
    await this.db.prepare(`UPDATE providers SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`).bind(...args).run();
  }

  async deleteProvider(userId: string, id: string): Promise<void> {
    const row = await this.getProviderRow(userId, id);
    if (!row) throw new Error("Provider not found.");
    if (row.api_key_enc) {
      // Models cascade; explicitly remove favourites so nothing dangles.
      await this.db.prepare("DELETE FROM models WHERE provider_id = ?").bind(id).run();
    }
    await this.db.prepare("DELETE FROM providers WHERE user_id = ? AND id = ?").bind(userId, id).run();
  }

  async getProviderRow(userId: string, id: string): Promise<ProviderRow | null> {
    return this.db
      .prepare<ProviderRow>("SELECT * FROM providers WHERE user_id = ? AND id = ?")
      .bind(userId, id)
      .first();
  }

  async getProvider(userId: string, id: string): Promise<ProviderConfig | null> {
    const row = await this.getProviderRow(userId, id);
    return row ? this.toProvider(row) : null;
  }

  async listProviders(userId: string): Promise<ProviderConfig[]> {
    const { results } = await this.db
      .prepare<ProviderRow>(
        "SELECT * FROM providers WHERE user_id = ? ORDER BY created_at ASC",
      )
      .bind(userId)
      .all();
    return results.map((r) => this.toProvider(r));
  }

  /** Retrieve the plaintext key. Server-side only — never call from a client path. */
  async getProviderApiKey(userId: string, id: string): Promise<string | null> {
    const row = await this.getProviderRow(userId, id);
    if (!row?.api_key_enc) return null;
    return decryptSecret(row.api_key_enc, this.masterKey!);
  }

  private toProvider(row: ProviderRow): ProviderConfig {
    return {
      id: row.id,
      userId: row.user_id,
      // The column is TEXT; the value is constrained to a known ProviderKind
      // at the API boundary, so the cast is safe here.
      kind: row.kind as ProviderKind,
      displayName: row.display_name,
      baseUrl: row.base_url,
      hasApiKey: Boolean(row.api_key_enc),
      apiKeyHint: row.api_key_hint,
      organizationId: row.organization_id,
      status: row.status,
      connectionStatus: row.connection_status,
      connectionError: row.connection_error,
      lastConnectedAt: row.last_connected_at,
      lastModelDiscoveryAt: row.last_model_discovery_at,
      modelCount: row.model_count,
      lastErrorCode: row.last_error_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async setProviderConnection(
    userId: string,
    id: string,
    patch: {
      connectionStatus: "ok" | "error";
      connectionError?: string | null;
      lastErrorCode?: string | null;
    },
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE providers
            SET connection_status = ?, connection_error = ?, last_error_code = ?,
                last_connected_at = ?, updated_at = ?
          WHERE user_id = ? AND id = ?`,
      )
      .bind(
        patch.connectionStatus,
        patch.connectionError ?? null,
        patch.lastErrorCode ?? null,
        patch.connectionStatus === "ok" ? Date.now() : null,
        Date.now(),
        userId,
        id,
      )
      .run();
  }

  async setModelDiscovery(userId: string, id: string, count: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE providers SET last_model_discovery_at = ?, model_count = ?, updated_at = ?
          WHERE user_id = ? AND id = ?`,
      )
      .bind(Date.now(), count, Date.now(), userId, id)
      .run();
  }

  /* ---------------------------------------------------------------- */
  /* Models                                                            */
  /* ---------------------------------------------------------------- */

  async replaceModels(providerId: string, records: ModelRecord[]): Promise<number> {
    // Delete-then-insert keeps the table exactly in sync with the provider's
    // listing while preserving favourites, which reference the string ref.
    await this.db.prepare("DELETE FROM models WHERE provider_id = ?").bind(providerId).run();
    for (const r of records) {
      await this.db
        .prepare(
          `INSERT INTO models
             (id, provider_id, model_id, display_name, description, context_window,
              max_output_tokens, capabilities, sources, discovered_at, verified,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          r.id,
          r.providerId,
          r.modelId,
          r.displayName,
          r.description,
          r.contextWindow,
          r.maxOutputTokens,
          JSON.stringify(r.capabilities),
          JSON.stringify(r.sources),
          r.discoveredAt,
          r.verified ? 1 : 0,
          r.createdAt,
          r.updatedAt,
        )
        .run();
    }
    return records.length;
  }

  async listModels(userId: string): Promise<ModelWithProvider[]> {
    const { results } = await this.db
      .prepare<ModelRow & { p_display_name: string; p_kind: string; p_base_url: string; p_connection: string }>(
        `SELECT m.*, p.display_name AS p_display_name, p.kind AS p_kind,
                p.base_url AS p_base_url, p.connection_status AS p_connection
           FROM models m
           JOIN providers p ON p.id = m.provider_id
          WHERE p.user_id = ?
          ORDER BY p.display_name ASC, m.display_name ASC`,
      )
      .bind(userId)
      .all();

    const favs = await this.listFavourites(userId);
    const pinned = await this.listPinned(userId);

    return results.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      modelId: row.model_id,
      displayName: row.display_name,
      description: row.description,
      contextWindow: row.context_window,
      maxOutputTokens: row.max_output_tokens,
      capabilities: parseJson(row.capabilities, defaultCapabilities()),
      sources: parseJson(row.sources, defaultSources()),
      discoveredAt: row.discovered_at,
      verified: Boolean(row.verified),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: {
        id: row.provider_id,
        displayName: row.p_display_name,
        kind: row.p_kind as ProviderKind,
        baseUrl: row.p_base_url,
        connectionStatus: row.p_connection as "unknown" | "ok" | "error",
      },
      favourite: favs.has(row.id),
      pinned: pinned.has(row.id),
    }));
  }

  async getModel(userId: string, providerId: string, modelId: string): Promise<ModelWithProvider | null> {
    const all = await this.listModels(userId);
    return all.find((m) => m.providerId === providerId && m.modelId === modelId) ?? null;
  }

  /* ---------------------------------------------------------------- */
  /* Favourites                                                        */
  /* ---------------------------------------------------------------- */

  async listFavourites(userId: string): Promise<Set<string>> {
    const { results } = await this.db
      .prepare<{ model_ref: string }>(
        "SELECT model_ref FROM model_favourites WHERE user_id = ?",
      )
      .bind(userId)
      .all();
    return new Set(results.map((r) => r.model_ref));
  }

  async setFavourite(userId: string, modelRef: string, on: boolean): Promise<void> {
    if (on) {
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO model_favourites (user_id, model_ref, pinned, created_at) VALUES (?, ?, 0, ?)",
        )
        .bind(userId, modelRef, Date.now())
        .run();
    } else {
      await this.db
        .prepare("DELETE FROM model_favourites WHERE user_id = ? AND model_ref = ?")
        .bind(userId, modelRef)
        .run();
    }
  }

  async setPinned(userId: string, modelRef: string, on: boolean): Promise<void> {
    const exists = await this.db
      .prepare("SELECT 1 AS ok FROM model_favourites WHERE user_id = ? AND model_ref = ?")
      .bind(userId, modelRef)
      .first();
    if (!exists && on) {
      await this.db
        .prepare(
          "INSERT OR REPLACE INTO model_favourites (user_id, model_ref, pinned, created_at) VALUES (?, ?, 1, ?)",
        )
        .bind(userId, modelRef, Date.now())
        .run();
      return;
    }
    await this.db
      .prepare("UPDATE model_favourites SET pinned = ? WHERE user_id = ? AND model_ref = ?")
      .bind(on ? 1 : 0, userId, modelRef)
      .run();
  }

  async listPinned(userId: string): Promise<Set<string>> {
    const { results } = await this.db
      .prepare<{ model_ref: string }>(
        "SELECT model_ref FROM model_favourites WHERE user_id = ? AND pinned = 1",
      )
      .bind(userId)
      .all();
    return new Set(results.map((r) => r.model_ref));
  }

  /** Remove favourites pointing at models that no longer exist. */
  async pruneFavourites(userId: string): Promise<number> {
    const favs = await this.listFavourites(userId);
    const models = await this.listModels(userId);
    const alive = new Set(models.map((m) => m.id));
    let removed = 0;
    for (const ref of favs) {
      if (!alive.has(ref)) {
        await this.db
          .prepare("DELETE FROM model_favourites WHERE user_id = ? AND model_ref = ?")
          .bind(userId, ref)
          .run();
        removed++;
      }
    }
    return removed;
  }

  /* ---------------------------------------------------------------- */
  /* Folders                                                           */
  /* ---------------------------------------------------------------- */

  async listFolders(userId: string): Promise<Folder[]> {
    const { results } = await this.db
      .prepare<FolderRow>("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at ASC")
      .bind(userId)
      .all();
    return results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      parentId: r.parent_id,
      createdAt: r.created_at,
    }));
  }

  async createFolder(userId: string, name: string, parentId: string | null = null): Promise<Folder> {
    const id = crypto.randomUUID();
    await this.db
      .prepare("INSERT INTO folders (id, user_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, name.trim() || "New folder", parentId, Date.now())
      .run();
    return { id, userId, name: name.trim() || "New folder", parentId, createdAt: Date.now() };
  }

  async renameFolder(userId: string, id: string, name: string): Promise<void> {
    await this.db
      .prepare("UPDATE folders SET name = ? WHERE user_id = ? AND id = ?")
      .bind(name.trim(), userId, id)
      .run();
  }

  async deleteFolder(userId: string, id: string): Promise<void> {
    // Conversations keep their history; they just become unfiled.
    await this.db
      .prepare("UPDATE conversations SET folder_id = NULL WHERE user_id = ? AND folder_id = ?")
      .bind(userId, id)
      .run();
    await this.db.prepare("DELETE FROM folders WHERE user_id = ? AND id = ?").bind(userId, id).run();
  }

  /* ---------------------------------------------------------------- */
  /* Conversations                                                     */
  /* ---------------------------------------------------------------- */

  async createConversation(args: {
    userId: string;
    title?: string;
    paneCount?: 1 | 2 | 3 | 4;
    paneModels?: Array<{ providerId: string; modelId: string } | null>;
    folderId?: string | null;
  }): Promise<Conversation> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO conversations
           (id, user_id, title, folder_id, pinned, favourite, pane_count, pane_models, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        args.userId,
        args.title?.trim() || "New chat",
        args.folderId ?? null,
        args.paneCount ?? 1,
        JSON.stringify(args.paneModels ?? []),
        now,
        now,
      )
      .run();
    return (await this.getConversation(args.userId, id))!;
  }

  async getConversation(userId: string, id: string): Promise<Conversation | null> {
    const row = await this.db
      .prepare<ConversationRow>("SELECT * FROM conversations WHERE user_id = ? AND id = ?")
      .bind(userId, id)
      .first();
    return row ? this.toConversation(row) : null;
  }

  async listConversations(args: {
    userId: string;
    limit?: number;
    offset?: number;
    query?: string;
    folderId?: string | null;
  }): Promise<{ items: Conversation[]; total: number }> {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const offset = Math.max(args.offset ?? 0, 0);

    const where: string[] = ["user_id = ?"];
    const params: BindValue[] = [args.userId];

    if (typeof args.query === "string" && args.query.trim()) {
      // Search titles and also messages that belong to the user.
      where.push(
        `(title LIKE ? OR id IN (
            SELECT DISTINCT conversation_id FROM messages
             WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)
               AND content LIKE ?
         ))`,
      );
      const needle = `%${escapeLike(args.query.trim())}%`;
      params.push(needle, args.userId, needle);
    }
    if (args.folderId !== undefined) {
      if (args.folderId === null) where.push("folder_id IS NULL");
      else {
        where.push("folder_id = ?");
        params.push(args.folderId);
      }
    }

    const whereSql = where.join(" AND ");

    const countRow = await this.db
      .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM conversations WHERE ${whereSql}`)
      .bind(...params)
      .first();

    const { results } = await this.db
      .prepare<ConversationRow>(
        `SELECT * FROM conversations WHERE ${whereSql}
          ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, limit, offset)
      .all();

    return {
      items: results.map((r) => this.toConversation(r)),
      total: Number(countRow?.n ?? 0),
    };
  }

  async updateConversation(
    userId: string,
    id: string,
    patch: {
      title?: string;
      pinned?: boolean;
      favourite?: boolean;
      folderId?: string | null;
      paneCount?: 1 | 2 | 3 | 4;
      paneModels?: Array<{ providerId: string; modelId: string } | null>;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const args: BindValue[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title.trim().slice(0, 200) || "Untitled");
    }
    if (patch.pinned !== undefined) {
      sets.push("pinned = ?");
      args.push(patch.pinned ? 1 : 0);
    }
    if (patch.favourite !== undefined) {
      sets.push("favourite = ?");
      args.push(patch.favourite ? 1 : 0);
    }
    if (patch.folderId !== undefined) {
      sets.push("folder_id = ?");
      args.push(patch.folderId);
    }
    if (patch.paneCount !== undefined) {
      sets.push("pane_count = ?");
      args.push(patch.paneCount);
    }
    if (patch.paneModels !== undefined) {
      sets.push("pane_models = ?");
      args.push(JSON.stringify(patch.paneModels));
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    args.push(Date.now(), userId, id);
    await this.db
      .prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`)
      .bind(...args)
      .run();
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM messages WHERE conversation_id = ?")
      .bind(id)
      .run();
    await this.db
      .prepare("DELETE FROM conversations WHERE user_id = ? AND id = ?")
      .bind(userId, id)
      .run();
  }

  async deleteAllConversations(userId: string): Promise<number> {
    const convs = await this.listConversations({ userId, limit: 100, offset: 0 });
    let n = 0;
    for (const c of convs.items) {
      await this.deleteConversation(userId, c.id);
      n++;
    }
    if (convs.total > convs.items.length) {
      await this.db
        .prepare(
          `DELETE FROM messages WHERE conversation_id IN
             (SELECT id FROM conversations WHERE user_id = ?)`,
        )
        .bind(userId)
        .run();
      await this.db.prepare("DELETE FROM conversations WHERE user_id = ?").bind(userId).run();
      n = convs.total;
    }
    return n;
  }

  private toConversation(row: ConversationRow): Conversation {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      folderId: row.folder_id,
      pinned: Boolean(row.pinned),
      favourite: Boolean(row.favourite),
      paneCount: (row.pane_count as 1 | 2 | 3 | 4) ?? 1,
      paneModels: parseJson(row.pane_models, [] as Conversation["paneModels"]),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Message counts for a set of conversations, keyed by conversation id. */
  async countMessagesByConversation(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const id of ids) {
      const row = await this.db
        .prepare<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?")
        .bind(id)
        .first();
      out.set(id, Number(row?.n ?? 0));
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Messages                                                          */
  /* ---------------------------------------------------------------- */

  async appendMessage(msg: {
    id: string;
    conversationId: string;
    role: "system" | "user" | "assistant";
    content: string;
    providerId?: string | null;
    modelId?: string | null;
    modelLabel?: string | null;
    status?: string | null;
    metrics?: unknown;
    error?: unknown;
    parentMessageId?: string | null;
    paneIndex?: number | null;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO messages
           (id, conversation_id, role, content, provider_id, model_id, model_label,
            status, metrics, error, parent_message_id, pane_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        msg.id,
        msg.conversationId,
        msg.role,
        msg.content,
        msg.providerId ?? null,
        msg.modelId ?? null,
        msg.modelLabel ?? null,
        msg.status ?? null,
        msg.metrics ? JSON.stringify(msg.metrics) : null,
        msg.error ? JSON.stringify(msg.error) : null,
        msg.parentMessageId ?? null,
        msg.paneIndex ?? null,
        Date.now(),
      )
      .run();
    await this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .bind(Date.now(), msg.conversationId)
      .run();
  }

  async updateMessage(
    id: string,
    patch: { content?: string; status?: string | null; metrics?: unknown; error?: unknown },
  ): Promise<void> {
    const sets: string[] = [];
    const args: BindValue[] = [];
    if (patch.content !== undefined) {
      sets.push("content = ?");
      args.push(patch.content);
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      args.push(patch.status);
    }
    if (patch.metrics !== undefined) {
      sets.push("metrics = ?");
      args.push(patch.metrics ? JSON.stringify(patch.metrics) : null);
    }
    if (patch.error !== undefined) {
      sets.push("error = ?");
      args.push(patch.error ? JSON.stringify(patch.error) : null);
    }
    if (sets.length === 0) return;
    args.push(id);
    await this.db.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
  }

  async deleteMessage(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
  }

  async listMessages(conversationId: string, limit = 500): Promise<ChatMessageRow[]> {
    const { results } = await this.db
      .prepare<ChatMessageRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?",
      )
      .bind(conversationId, limit)
      .all();
    return results;
  }

  /* ---------------------------------------------------------------- */
  /* Preferences                                                       */
  /* ---------------------------------------------------------------- */

  async getPrefs(userId: string): Promise<{ theme: string; sidebarWidth: number | null; directBrowser: boolean; preferences: Record<string, unknown> }> {
    const row = await this.db
      .prepare<{ theme: string; sidebar_width: number | null; direct_browser: number; preferences: string | null }>(
        "SELECT * FROM user_prefs WHERE user_id = ?",
      )
      .bind(userId)
      .first();
    return {
      theme: row?.theme ?? "light",
      sidebarWidth: row?.sidebar_width ?? null,
      directBrowser: Boolean(row?.direct_browser),
      preferences: parseJson(row?.preferences ?? null, {} as Record<string, unknown>),
    };
  }

  async savePrefs(
    userId: string,
    patch: { theme?: string; sidebarWidth?: number | null; directBrowser?: boolean; preferences?: Record<string, unknown> },
  ): Promise<void> {
    const existing = await this.db
      .prepare<{ user_id: string }>("SELECT user_id FROM user_prefs WHERE user_id = ?")
      .bind(userId)
      .first();

    if (existing) {
      const sets: string[] = [];
      const args: BindValue[] = [];
      if (patch.theme !== undefined) {
        sets.push("theme = ?");
        args.push(patch.theme);
      }
      if (patch.sidebarWidth !== undefined) {
        sets.push("sidebar_width = ?");
        args.push(patch.sidebarWidth);
      }
      if (patch.directBrowser !== undefined) {
        sets.push("direct_browser = ?");
        args.push(patch.directBrowser ? 1 : 0);
      }
      if (patch.preferences !== undefined) {
        sets.push("preferences = ?");
        args.push(JSON.stringify(patch.preferences));
      }
      if (sets.length === 0) return;
      sets.push("updated_at = ?");
      args.push(Date.now(), userId);
      await this.db
        .prepare(`UPDATE user_prefs SET ${sets.join(", ")} WHERE user_id = ?`)
        .bind(...args)
        .run();
      return;
    }

    await this.db
      .prepare(
        `INSERT INTO user_prefs (user_id, theme, sidebar_width, direct_browser, preferences, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        patch.theme ?? "light",
        patch.sidebarWidth ?? null,
        patch.directBrowser ? 1 : 0,
        JSON.stringify(patch.preferences ?? {}),
        Date.now(),
      )
      .run();
  }

  /* ---------------------------------------------------------------- */
  /* OAuth state & rate limiting                                       */
  /* ---------------------------------------------------------------- */

  async saveOAuthState(args: {
    state: string;
    provider: string;
    codeVerifier: string | null;
    redirectTo: string | null;
    ttlMs: number;
  }): Promise<void> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO oauth_states (state, provider, code_verifier, redirect_to, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(args.state, args.provider, args.codeVerifier, args.redirectTo, now, now + args.ttlMs)
      .run();
  }

  async consumeOAuthState(
    state: string,
  ): Promise<{ provider: string; codeVerifier: string | null; redirectTo: string | null } | null> {
    const row = await this.db
      .prepare<{ provider: string; code_verifier: string | null; redirect_to: string | null }>(
        "SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?",
      )
      .bind(state, Date.now())
      .first();
    if (!row) return null;
    await this.db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
    return { provider: row.provider, codeVerifier: row.code_verifier, redirectTo: row.redirect_to };
  }

  async pruneOAuthStates(): Promise<void> {
    await this.db
      .prepare("DELETE FROM oauth_states WHERE expires_at <= ?")
      .bind(Date.now())
      .run();
  }

  /**
   * Fixed-window rate limiter. Returns true when the request is allowed.
   * Buckets are per (action, subject) so a single abusive session cannot lock
   * out a whole account.
   */
  async rateLimit(bucket: string, subject: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const row = await this.db
      .prepare<{ window_start: number; count: number }>(
        "SELECT * FROM rate_limits WHERE bucket = ? AND subject = ?",
      )
      .bind(bucket, subject)
      .first();

    if (!row || now - row.window_start >= windowMs) {
      await this.db
        .prepare(
          `INSERT OR REPLACE INTO rate_limits (bucket, subject, window_start, count)
           VALUES (?, ?, ?, 1)`,
        )
        .bind(bucket, subject, Math.floor(now / windowMs) * windowMs)
        .run();
      return true;
    }

    if (row.count >= limit) return false;

    await this.db
      .prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket = ? AND subject = ?")
      .bind(bucket, subject)
      .run();
    return true;
  }
}

/* ---------------------------------------------------------------- */
/* Row types & helpers                                               */
/* ---------------------------------------------------------------- */

export interface ProviderRow {
  id: string;
  user_id: string;
  kind: string;
  display_name: string;
  base_url: string;
  api_key_enc: string | null;
  api_key_hint: string | null;
  organization_id: string | null;
  status: number;
  connection_status: "unknown" | "ok" | "error";
  connection_error: string | null;
  last_error_code: string | null;
  last_connected_at: number | null;
  last_model_discovery_at: number | null;
  model_count: number | null;
  settings: string | null;
  created_at: number;
  updated_at: number;
}

interface ModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  description: string | null;
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: string;
  sources: string;
  discovered_at: number;
  verified: number;
  created_at: number;
  updated_at: number;
}

interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  folder_id: string | null;
  pinned: number;
  favourite: number;
  pane_count: number;
  pane_models: string | null;
  created_at: number;
  updated_at: number;
}

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  provider_id: string | null;
  model_id: string | null;
  model_label: string | null;
  status: string | null;
  metrics: string | null;
  error: string | null;
  parent_message_id: string | null;
  pane_index: number | null;
  created_at: number;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function defaultCapabilities() {
  return {
    vision: "unavailable" as const,
    tools: "unavailable" as const,
    structuredOutput: "unavailable" as const,
    streaming: "unavailable" as const,
    inputModalities: ["text" as const],
    outputModalities: ["text" as const],
  };
}

function defaultSources() {
  return {
    contextWindow: "unavailable" as const,
    maxOutputTokens: "unavailable" as const,
    description: "unavailable" as const,
    capabilities: "unavailable" as const,
  };
}

/** Escape LIKE wildcards so user search text is literal. */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}
