import { describe, expect, it, vi } from "vitest";
import { D1RestDriver, splitSqlStatements } from "../server/db/d1rest.js";
import { LibsqlHttpDriver } from "../server/db/libsql.js";

/**
 * Driver tests against stubbed HTTP endpoints.
 *
 * These are MOCKED transport tests: they prove Rosa builds the correct wire
 * request and interprets the documented response shape. They do not prove that
 * a live Cloudflare or Turso account works — see docs/DEPLOYMENT.md for the
 * smoke test that does that against a real project.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/* SQL statement splitting                                             */
/* ------------------------------------------------------------------ */

describe("splitSqlStatements", () => {
  it("splits on top-level semicolons", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("keeps a semicolon inside a string literal", () => {
    const sql = `INSERT INTO t (v) VALUES ('a;b'); SELECT 1`;
    expect(splitSqlStatements(sql)).toEqual([
      `INSERT INTO t (v) VALUES ('a;b')`,
      "SELECT 1",
    ]);
  });

  it("handles an escaped quote inside a literal", () => {
    // '' is an escaped quote, not the end of the literal.
    const sql = `INSERT INTO t (v) VALUES ('it''s; fine'); SELECT 2`;
    expect(splitSqlStatements(sql)).toEqual([
      `INSERT INTO t (v) VALUES ('it''s; fine')`,
      "SELECT 2",
    ]);
  });

  it("ignores semicolons in line and block comments", () => {
    const sql = `SELECT 1 -- trailing; comment\n; /* block ; comment */ SELECT 2;`;
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("SELECT 1");
    expect(parts[1]).toContain("SELECT 2");
  });

  it("handles a real migration-shaped script", () => {
    const sql = [
      `CREATE TABLE IF NOT EXISTS a (id TEXT PRIMARY KEY, note TEXT DEFAULT 'x;y');`,
      `CREATE INDEX IF NOT EXISTS i ON a(id);`,
      `ALTER TABLE a ADD COLUMN z INTEGER;`,
    ].join("\n");
    expect(splitSqlStatements(sql)).toHaveLength(3);
  });

  it("returns no statements for only comments and whitespace", () => {
    expect(splitSqlStatements("-- just a comment\n  \n")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* D1 over HTTP                                                        */
/* ------------------------------------------------------------------ */

describe("D1RestDriver", () => {
  function driver(fetchImpl: typeof fetch) {
    return new D1RestDriver({
      accountId: "acct-1",
      databaseId: "db-1",
      apiToken: "test-token",
      baseUrl: "https://d1.test/client/v4",
      fetchImpl,
    });
  }

  it("sends one POST with all statements and the bearer token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: [{ results: [], meta: {} }],
      });
    }) as unknown as typeof fetch;

    await driver(fetchImpl)
      .prepare("SELECT 1")
      .bind("a")
      .all();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://d1.test/client/v4/accounts/acct-1/d1/database/db-1/query",
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(calls[0].init.body))).toEqual([
      { sql: "SELECT 1", params: ["a"] },
    ]);
  });

  it("maps result rows onto objects", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: [{ results: [{ id: "1", name: "m" }], meta: {} }],
      })) as unknown as typeof fetch;

    const rows = await driver(fetchImpl)
      .prepare<{ id: string; name: string }>("SELECT id, name FROM models")
      .all();
    expect(rows.results).toEqual([{ id: "1", name: "m" }]);
  });

  it("reads run() metadata", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: [{ results: [], meta: { changes: 3, last_row_id: 42 } }],
      })) as unknown as typeof fetch;

    const { meta } = await driver(fetchImpl).prepare("UPDATE t SET x = 1").bind().run();
    expect(meta.changes).toBe(3);
    expect(meta.last_row_id).toBe(42);
  });

  it("returns null from first() when there are no rows", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: [{ results: [], meta: {} }],
      })) as unknown as typeof fetch;

    expect(await driver(fetchImpl).prepare("SELECT 1 WHERE 0").first()).toBeNull();
  });

  it("batches every statement in a single round trip", async () => {
    let requests = 0;
    let body: unknown = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      requests += 1;
      body = JSON.parse(String(init.body));
      return jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: [{ results: [], meta: {} }, { results: [], meta: { changes: 1 } }],
      });
    }) as unknown as typeof fetch;

    const d = driver(fetchImpl);
    await d.batch([
      d.prepare("INSERT INTO a VALUES (?)").bind(1),
      d.prepare("UPDATE b SET x = ?").bind(2),
    ]);

    expect(requests).toBe(1);
    expect(body).toEqual([
      { sql: "INSERT INTO a VALUES (?)", params: [1] },
      { sql: "UPDATE b SET x = ?", params: [2] },
    ]);
  });

  it("splits multi-statement DDL for exec()", async () => {
    let body: unknown = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: [{ results: [], meta: {} }, { results: [], meta: {} }],
      });
    }) as unknown as typeof fetch;

    await driver(fetchImpl).exec("CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);");
    expect((body as unknown[]).length).toBe(2);
  });

  it("never leaks the API token in an auth failure message", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 403 })) as unknown as typeof fetch;

    await expect(driver(fetchImpl).prepare("SELECT 1").all()).rejects.toThrow(
      /rejected the D1 API token/,
    );
    try {
      await driver(fetchImpl).prepare("SELECT 1").all();
    } catch (err) {
      expect((err as Error).message).not.toContain("test-token");
    }
  });

  it("reports a malformed JSON body without echoing it", async () => {
    const fetchImpl = (async () =>
      new Response("<html>gateway error</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    await expect(driver(fetchImpl).prepare("SELECT 1").all()).rejects.toThrow(
      /malformed JSON/,
    );
  });

  it("surfaces a D1 error message", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        success: false,
        errors: [{ code: 7500, message: "no such table: missing" }],
        messages: [],
        result: [],
      })) as unknown as typeof fetch;

    await expect(driver(fetchImpl).prepare("SELECT * FROM missing").all()).rejects.toThrow(
      /no such table: missing/,
    );
  });

  it("wraps a network failure in an actionable message", async () => {
    const fetchImpl = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;

    await expect(driver(fetchImpl).prepare("SELECT 1").all()).rejects.toThrow(
      /Could not reach the Cloudflare D1 API/,
    );
  });

  it("refuses to batch a statement from another driver", async () => {
    const fetchImpl = (async () => jsonResponse({ success: true, errors: [], messages: [], result: [] })) as unknown as typeof fetch;
    const foreign = {
      bind: () => foreign,
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
    };
    await expect(driver(fetchImpl).batch([foreign])).rejects.toThrow(/foreign statement/);
  });
});

/* ------------------------------------------------------------------ */
/* libsql / Turso over HTTP                                            */
/* ------------------------------------------------------------------ */

describe("LibsqlHttpDriver", () => {
  function driver(fetchImpl: typeof fetch, url = "libsql://db-1.turso.io") {
    return new LibsqlHttpDriver({ url, authToken: "turso-token", fetchImpl });
  }

  function pipeline(rows: unknown[][], cols = ["id"]) {
    return jsonResponse({
      results: [
        {
          cols: cols.map((name) => ({ name })),
          rows: rows,
        },
      ],
    });
  }

  it("rewrites the libsql scheme to https and hits /v2/pipeline", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return pipeline([[{ type: "text", value: "1" }]]);
    }) as unknown as typeof fetch;

    await driver(fetchImpl).prepare("SELECT 1").all();
    expect(calls[0]).toBe("https://db-1.turso.io/v2/pipeline");
  });

  it("keeps an https URL as-is", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return pipeline([[{ type: "integer", value: 1 }]]);
    }) as unknown as typeof fetch;

    await driver(fetchImpl, "https://db.example.com").prepare("SELECT 1").all();
    expect(calls[0]).toBe("https://db.example.com/v2/pipeline");
  });

  it("encodes parameters into libsql's tagged format", async () => {
    let body: { requests: Array<{ stmt: { args: unknown[] } }> } | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return pipeline([]);
    }) as unknown as typeof fetch;

    await driver(fetchImpl)
      .prepare("INSERT INTO t (a, b, c) VALUES (?, ?, ?)")
      .bind("text", 7, null)
      .run();

    expect(body!.requests[0].stmt.args).toEqual([
      { type: "text", value: "text" },
      { type: "integer", value: 7 },
      { type: "null" },
    ]);
  });

  it("decodes every column type", async () => {
    const fetchImpl = (async () =>
      pipeline(
        [
          [
            { type: "text", value: "hello" },
            { type: "integer", value: 42 },
            { type: "float", value: 1.5 },
            { type: "null" },
          ],
        ],
        ["s", "i", "f", "n"],
      )) as unknown as typeof fetch;

    const rows = await driver(fetchImpl).prepare("SELECT 1").all();
    expect(rows.results[0]).toEqual({ s: "hello", i: 42, f: 1.5, n: null });
  });

  it("reports affected rows and last insert id", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        results: [{ cols: [], rows: [], affected_row_count: 2, last_insert_rowid: "9" }],
      })) as unknown as typeof fetch;

    const { meta } = await driver(fetchImpl).prepare("UPDATE t SET a = 1").run();
    expect(meta.changes).toBe(2);
    expect(meta.last_row_id).toBe(9);
  });

  it("sends a batch as one pipeline request", async () => {
    let requests = 0;
    const fetchImpl = (async () => {
      requests += 1;
      return jsonResponse({ results: [{ cols: [], rows: [] }, { cols: [], rows: [] }] });
    }) as unknown as typeof fetch;

    const d = driver(fetchImpl);
    await d.batch([d.prepare("A").bind(1), d.prepare("B").bind(2)]);
    expect(requests).toBe(1);
  });

  it("never leaks the auth token on a 401", async () => {
    const fetchImpl = (async () =>
      new Response("denied", { status: 401 })) as unknown as typeof fetch;

    try {
      await driver(fetchImpl).prepare("SELECT 1").all();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toMatch(/rejected the credentials/);
      expect((err as Error).message).not.toContain("turso-token");
    }
  });

  it("surfaces a libsql error payload", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: { message: "table t has no column z" } })) as unknown as typeof fetch;

    await expect(driver(fetchImpl).prepare("SELECT z FROM t").all()).rejects.toThrow(
      /no column z/,
    );
  });

  it("omits the authorization header when no token is set", async () => {
    let headers: Record<string, string> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return pipeline([]);
    }) as unknown as typeof fetch;

    const d = new LibsqlHttpDriver({ url: "https://db.example.com", fetchImpl });
    await d.prepare("SELECT 1").all();
    expect(headers.authorization).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Driver selection                                                    */
/* ------------------------------------------------------------------ */

describe("resolveNodeDriver", () => {
  it("prefers an injected driver", async () => {
    const { resolveNodeDriver } = await import("../server/db/factory.js");
    const fake = {
      name: "sqlite" as const,
      prepare: vi.fn(),
      batch: vi.fn(),
      exec: vi.fn(),
    };
    const resolved = await resolveNodeDriver({}, { injected: fake as never });
    expect(resolved.kind).toBe("injected");
    expect(resolved.driver).toBe(fake);
  });

  it("selects D1 over HTTP when all three Cloudflare vars are present", async () => {
    const { resolveNodeDriver } = await import("../server/db/factory.js");
    const resolved = await resolveNodeDriver({
      CLOUDFLARE_ACCOUNT_ID: "a",
      CLOUDFLARE_D1_DATABASE_ID: "b",
      CLOUDFLARE_API_TOKEN: "c",
    });
    expect(resolved.kind).toBe("d1-rest");
    expect(resolved.needsMigrate).toBe(true);
  });

  it("selects libsql when DATABASE_URL is a libsql endpoint", async () => {
    const { resolveNodeDriver } = await import("../server/db/factory.js");
    const resolved = await resolveNodeDriver({ DATABASE_URL: "libsql://x.turso.io" });
    expect(resolved.kind).toBe("libsql-http");
  });

  it("explains that Postgres URLs are not supported by the portable schema", async () => {
    const { resolveNodeDriver } = await import("../server/db/factory.js");
    await expect(
      resolveNodeDriver({ DATABASE_URL: "postgres://user:pw@host/db" }),
    ).rejects.toThrow(/SQLite dialect/);
  });

  it("refuses a missing database when a remote one is required", async () => {
    const { resolveNodeDriver, NoDatabaseConfiguredError } = await import(
      "../server/db/factory.js"
    );
    await expect(resolveNodeDriver({}, { requireRemote: true })).rejects.toBeInstanceOf(
      NoDatabaseConfiguredError,
    );
  });

  it("does not treat a partial Cloudflare config as D1", async () => {
    const { resolveNodeDriver } = await import("../server/db/factory.js");
    const resolved = await resolveNodeDriver(
      { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_D1_DATABASE_ID: "b" },
      { requireRemote: true },
    ).catch((err: Error) => err);
    // Falls through to the local branch and then refuses because remote is required.
    expect(resolved).toBeInstanceOf(Error);
  });
});
