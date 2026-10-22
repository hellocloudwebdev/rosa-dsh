import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `apiFetch` retries a rejected request once, as the development "local" user.
 * These tests pin the two rules that keep a signed-out production page quiet:
 * the dev sign-in is only attempted when the server advertises it, and a
 * refused attempt is not repeated.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch local sign-in fallback", () => {
  const calls: string[] = [];
  let handler: (url: string, init?: RequestInit) => Response | Promise<Response>;

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        return handler(url, init);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const localSignIns = () => calls.filter((c) => c.includes("/api/auth/local/start"));
  const healthProbes = () => calls.filter((c) => c.includes("/api/health"));

  it("never asks for the dev sign-in when the deployment does not offer it", async () => {
    handler = (url) =>
      url === "/api/health" ? json({ ok: true, auth: ["clerk"] }) : json({ error: "unauthorized" }, 401);
    const { apiFetch } = await import("./api");

    await apiFetch("/api/prefs");
    await apiFetch("/api/providers");
    const res = await apiFetch("/api/models");

    expect(res.status).toBe(401);
    expect(localSignIns()).toHaveLength(0);
    // The probe is cached: one health check for the whole session.
    expect(healthProbes()).toHaveLength(1);
  });

  it("signs in once and retries when the server advertises a local user", async () => {
    let prefsCalls = 0;
    handler = (url, init) => {
      if (url === "/api/health") return json({ ok: true, auth: ["clerk", "local"] });
      if (url === "/api/auth/local/start") {
        expect(init?.method).toBe("POST");
        return json({ token: "dev-token" });
      }
      prefsCalls += 1;
      return prefsCalls === 1 ? json({ error: "unauthorized" }, 401) : json({ ok: true });
    };
    const { apiFetch } = await import("./api");

    const res = await apiFetch("/api/prefs");

    expect(res.status).toBe(200);
    expect(localSignIns()).toHaveLength(1);
    expect(prefsCalls).toBe(2);
  });

  it("stops asking after a refused attempt", async () => {
    handler = (url) => {
      if (url === "/api/health") return json({ ok: true, auth: ["local"] });
      if (url === "/api/auth/local/start") return json({ error: "forbidden" }, 403);
      return json({ error: "unauthorized" }, 401);
    };
    const { apiFetch } = await import("./api");

    await apiFetch("/api/prefs");
    await apiFetch("/api/providers");

    expect(localSignIns()).toHaveLength(1);
    expect(healthProbes()).toHaveLength(1);
  });

  it("reuses the health payload the app already loaded", async () => {
    handler = (url) =>
      url === "/api/health"
        ? json({ ok: true, auth: [], oauthConfigured: false, keyStorage: "encrypted-server-side" })
        : json({ error: "unauthorized" }, 401);
    const { apiFetch, getHealth } = await import("./api");

    await getHealth();
    await apiFetch("/api/prefs");

    expect(healthProbes()).toHaveLength(1);
    expect(localSignIns()).toHaveLength(0);
  });
});
