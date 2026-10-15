import { handleApiRequest, type ApiDeps } from "./api.js";
import { AppDatabase } from "./db/repository.js";
import { D1Driver, type D1Like } from "./db/d1.js";
import type { ApiEnv } from "./env.js";

export interface WorkerEnv {
  rosa_db: D1Like;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  ROSA_SESSION_SECRET?: string;
  ROSA_ENCRYPTION_KEY?: string;
  ROSA_PUBLIC_APP_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ROSA_API_PREFIX?: string;
  ROSA_ALLOW_LOCAL_HTTP?: string;
  NODE_ENV?: string;
  ROSA_DEV_MODE?: string;
  [key: string]: unknown;
}

const startedAt = Date.now();

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    // Route /api/* to Rosa's unified API router
    if (url.pathname.startsWith("/api")) {
      const app = new AppDatabase(new D1Driver(env.rosa_db), env.ROSA_ENCRYPTION_KEY ?? null);
      const apiEnv: ApiEnv = {
        ...(env as unknown as ApiEnv),
        ROSA_API_PREFIX: "/api",
      };
      const deps: ApiDeps = {
        app,
        env: apiEnv,
        startedAt,
      };
      return handleApiRequest(request, deps);
    }

    // Serve static frontend assets from Vite build in ./dist
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
