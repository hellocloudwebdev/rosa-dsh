# ROSA — Multi-Model AI Chat & Comparison Workspace

ROSA is a production-quality, web-based BYOK (Bring Your Own Key) AI chat and model-comparison platform. It allows users to manage their own AI provider accounts, discover models automatically, and run prompts against up to **four models simultaneously** in an interactive comparison workspace with real-time streaming, independent pane control, and monotonic performance metrics.

---

## Table of Contents

1. [Features & Capabilities](#features--capabilities)
2. [Architecture Overview](#architecture-overview)
3. [Security Architecture & Controls](#security-architecture--controls)
4. [Storage & Database Drivers](#storage--database-drivers)
5. [Local Development](#local-development)
6. [Deployment: Vercel with Cloudflare D1 (Primary Target)](#deployment-vercel-with-cloudflare-d1-primary-target)
7. [Deployment: Cloudflare Workers (Secondary Target)](#deployment-cloudflare-workers-secondary-target)
8. [OAuth & Authentication Setup](#oauth--authentication-setup)
9. [Verification & Test Results](#verification--test-results)
10. [Known Limitations & Operational Notes](#known-limitations--operational-notes)

---

## Features & Capabilities

### BYOK Provider Management
- **Zero Central Key Burden**: Users configure their own API keys and custom Base URLs. Inference is billed directly by their provider, not by the application host.
- **Supported Providers**: OpenAI, OpenAI-Compatible (Ollama, LM Studio, vLLM, DeepSeek, LocalAI), Anthropic, Google Gemini, Azure OpenAI, Groq, Mistral, Cohere, and OpenRouter.
- **Model Discovery & Catalog**: Automatic model listing via upstream provider endpoints (`/models`), with manual model addition fallback.
- **Favourites & Defaults**: Pin favourite models, set defaults per workspace or pane, and filter by capabilities (vision, reasoning, context size).

### Multi-Model Comparison Workspace
- **Up to 4 Simultaneous Models**: Compare outputs side-by-side in responsive multi-column layouts (desktop) or a tabbed view (mobile).
- **Independent Streaming**: Genuine Server-Sent Events (SSE) streaming per pane with zero blocking. One slow model never delays others.
- **Pane Isolation**: Independent `AbortController` and `requestId` per pane. Cancelling or retrying one pane never aborts or corrupts sibling panes.
- **Dynamic Pane Layout**: Add panes (up to 4) and remove individual panes on the fly (`pane/remove`).

### Honest, Real-Time Performance Metrics
- **Monotonic Clock**: Timing measured via high-resolution `performance.now()`, preventing skew from wall-clock adjustments.
- **Metrics Tracked**:
  - **TTFT (Time to First Token)**: Measured from request dispatch until the first content delta arrives.
  - **First Response Time**: Measured from dispatch until HTTP response headers are received.
  - **Tokens Per Second**: Accurately reported when upstream providers supply token usage; explicitly marked with an `Estimated` badge when computed via heuristics.
  - **Total Generation Time**: Pure streaming duration.
  - **Token Counts & Context Window**: Input/output tokens shown directly from upstream metadata; marked `unknown` when unavailable rather than fabricated.

### Full Conversation Lifecycle
- **Persistence**: Messages, turns, pane configurations, and metrics saved to database.
- **Management**: Search conversations, create new chats, inline rename conversations, and delete conversations with cascading cleanup.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │          React 19 Frontend             │
                      │  (Vite 6 + Tailwind CSS + Lucide Icons)│
                      └──────────────────┬─────────────────────┘
                                         │ JSON / SSE
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    Web-Standard Request/Response API   │
                      │           (server/api.ts)              │
                      └──────┬───────────┼───────────┬─────────┘
                             │           │           │
           ┌─────────────────┘           │           └─────────────────┐
           ▼                             ▼                             ▼
┌────────────────────┐        ┌────────────────────┐        ┌────────────────────┐
│   Vercel Function  │        │ Cloudflare Worker  │        │   Local Node CLI   │
│   (api/chat.ts)    │        │ (server/worker.ts) │        │ (localServer.ts)   │
└──────────┬─────────┘        └──────────┬─────────┘        └──────────┬─────────┘
           │                             │                             │
           ▼                             ▼                             ▼
┌────────────────────┐        ┌────────────────────┐        ┌────────────────────┐
│  D1 over HTTP REST │        │   D1 Worker Bind   │        │ node:sqlite / WAL  │
│  (server/db/       │        │  (server/db/d1.ts) │        │ (server/db/        │
│   d1rest.ts)       │        │                    │        │  sqlite.ts)        │
└────────────────────┘        └────────────────────┘        └────────────────────┘
```

The server layer implements a Web-standard `(req: Request) => Promise<Response>` router. All three entry points share the identical router and repository interfaces, ensuring zero behavioural drift across hosting platforms.

---

## Security Architecture & Controls

1. **SSRF Mitigation (`shared/urlGuard.ts`, `server/dns.ts`)**:
   - **Structural Normalization**: Strips single-label hosts, userinfo, credentials, non-HTTP(S) schemes, single trailing dots, and wildcards (`nip.io`, `sslip.io`, etc.).
   - **Post-Resolution IP Classification (`assertPublicHost`)**: Resolves the hostname via `node:dns/promises` (`nodeLookup`) and verifies every returned address. Loopback (`127.0.0.1`, `::1`), private LAN (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/cloud metadata (`169.254.169.254`), and IPv4-mapped IPv6 loopbacks (`::ffff:127.0.0.1`) are strictly rejected.
   - Loopback provider URLs (`http://localhost:11434`) are permitted **only** when running the local CLI server (`allowLocalhost: true`), never in serverless deployments.
2. **Credential Protection at Rest**:
   - API keys are encrypted using AES-256-GCM.
   - Keys are derived from `ROSA_ENCRYPTION_KEY` using HKDF-SHA256 (`salt: "rosa-envelope-v1"`).
   - If `ROSA_ENCRYPTION_KEY` is not set or is under 32 characters, keys are kept strictly in memory for the session ("session-only" mode).
3. **Secret Redaction (`shared/providers.ts`)**:
   - Live credentials and regex-identified API keys (`sk-*`, `Bearer *`, etc.) are automatically stripped and replaced with `[redacted]` before error strings reach the client or database logs.
4. **Session Security & PKCE S256 (`server/auth.ts`)**:
   - Sessions are 256-bit cryptographically secure random tokens. Only their SHA-256 hash is persisted in the database.
   - OAuth flows implement PKCE with `code_challenge_method=S256` (RFC 7636) to prevent authorization code interception attacks.
   - Session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` (in production).
5. **Rate Limiting & DoS Protection (`server/api.ts`)**:
   - `/chat`: 20 requests / 60 seconds per user id.
   - Provider probe/discovery endpoints (`/providers/:id/test`, `/providers/:id/models`): 30 requests / 60 seconds per user.
   - OAuth initialization: 20 requests / 300 seconds per client.
   - Request bodies are capped in bytes (`readCappedText`) while streaming, avoiding memory exhaustion.
6. **Strict Security Headers (`server/env.ts`, `vercel.json`)**:
   - HSTS (`Strict-Transport-Security: max-age=63072000; includeSubDomains`).
   - Content-Security-Policy: `default-src 'none'; frame-ancestors 'none'` for API responses; tailored strict CSP for the static HTML application shell.

---

## Storage & Database Drivers

ROSA defines a universal `SqlDriver` interface (`prepare`, `bind`, `first`, `all`, `run`, `batch`, `exec`) targeting SQLite dialect.

| Driver | Target Environment | How it connects |
| --- | --- | --- |
| `d1-rest` | **Vercel Functions** | Cloudflare D1 HTTP API via `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` |
| `sqlite` | **Local Node Server** | Node.js built-in `node:sqlite` (Node 22.5+) with WAL mode enabled |
| `d1` | **Cloudflare Workers** | Native D1 Worker binding (`env.rosa_db`) |
| `http` | **Turso / libsql** | Libsql HTTP pipeline protocol via `DATABASE_URL` and `DATABASE_AUTH_TOKEN` |

Database migrations are tracked in `schema_migrations` and execute idempotently on boot.

---

## Local Development

### Prerequisites
- Node.js >= 22.5.0
- npm >= 10

### 1. Clone & Install
```bash
git clone <repo-url>
cd rosa
npm install
```

### 2. Quick Run on PC (Single Command)
```bash
# Start the full application (frontend + backend + local SQLite):
npm start
```
Open **`http://localhost:8787`** in your browser.
- Click **"Continue as Local User (Offline)"** to instantly enter the workspace without needing to configure external OAuth keys.
- You can add your provider API keys or connect directly to local inference like Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`).
- All chats, models, and settings are saved to `./data/rosa.sqlite`.

### 3. Interactive Development Mode (with Hot Reloading)
```bash
# Terminal 1: Start local backend API server (port 8787)
npm run dev:api

# Terminal 2: Start Vite frontend server with HMR (port 5173)
npm run dev
```
Open **`http://localhost:5173`** in your browser. Vite automatically proxies API calls to port 8787.

---

## Deployment: Vercel with Cloudflare D1 (Primary Target)

This architecture uses **Vercel's free serverless functions** backed by **Cloudflare D1 as the free-tier database**, communicating over Cloudflare's D1 HTTP API.

### 1. Provision Cloudflare D1
```bash
# Log in to Cloudflare
npx wrangler login

# Create the D1 database
npx wrangler d1 create rosa-db
```
Note the printed `database_id` and your Cloudflare `account_id`.

Create a Cloudflare API token at `https://dash.cloudflare.com/profile/api-tokens` with the **D1:Edit** permission.

### 2. Configure Vercel Project
In your Vercel Project Settings → **Environment Variables**, set:

| Variable | Description |
| --- | --- |
| `ROSA_PUBLIC_APP_URL` | Your production URL, e.g. `https://rosa.vercel.app` (no trailing slash) |
| `ROSA_ENCRYPTION_KEY` | 32-byte base64url string (generate with `npm run keys:generate`) |
| `ROSA_SESSION_SECRET` | 32+ character random secret |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | The D1 Database UUID from step 1 |
| `CLOUDFLARE_API_TOKEN` | The Cloudflare API Token with D1 Edit permissions |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |

### 3. Deploy
Push to GitHub connected to Vercel, or deploy directly with the Vercel CLI:
```bash
npx vercel --prod
```
The included `vercel.json` automatically rewrites `/api/*` to `api/chat.ts` and applies strict caching and security headers.

---

## Deployment: Cloudflare Workers (Secondary Target)

To run the entire app as a Cloudflare Worker using native D1 bindings:

```bash
# Build frontend assets and deploy worker
npm run deploy:cf

# Apply migrations to remote D1
npm run db:cf:migrate
```

---

## OAuth & Authentication Setup

ROSA uses standard OAuth 2.0 with PKCE S256. At least one provider must be configured.

### GitHub OAuth App
1. Go to `https://github.com/settings/developers` → **OAuth Apps** → **New OAuth App**.
2. **Homepage URL**: `https://your-domain.com` (or `http://localhost:5173` in dev).
3. **Authorization callback URL**: `https://your-domain.com/api/auth/github/callback`.
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### Google Cloud OAuth Client
1. Go to Google Cloud Console → **APIs & Services** → **Credentials**.
2. Create an **OAuth client ID** of type **Web application**.
3. **Authorised redirect URI**: `https://your-domain.com/api/auth/google/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Full walkthrough and security checklist available in [`docs/OAUTH_SETUP.md`](docs/OAUTH_SETUP.md).

---

## Verification & Test Results

The suite executes 275 automated tests across both Node.js server environments and jsdom browser environments.

```bash
npm run verify
```

### Verified Suite Execution:
- **TypeScript Typecheck (`tsc -b --force`)**: Clean across both root, server, and API projects.
- **ESLint (`eslint . --max-warnings=0`)**: 0 errors, 0 warnings.
- **Vitest (`vitest run`)**: **15 test files passed, 275 tests passed**.
  - `tests/ssrf.test.ts` (35 tests): IPv4/IPv6 classification, dotted-quad normalisation, wildcard domains, loopback/private host rejection, mock DNS resolution.
  - `tests/security.test.ts` (28 tests): /health fingerprinting prevention, client IP header trust verification, probe rate limits, byte-level body caps, cross-user cancel isolation, live secret redaction, PKCE S256 verification, master key 32-byte floor.
  - `tests/drivers.test.ts` (32 tests): SQLite driver transactions, batch executions, D1-REST HTTP driver protocol, statement splitting.
  - `tests/repository.test.ts` (35 tests): User session upsert, OAuth state lifecycle, encrypted provider storage, messages and conversations.
  - `tests/models.test.ts` (22 tests): Model metadata parsing, context window inference, modality extraction, capability detection.
  - `tests/api.test.ts` (23 tests): Handler-level integration tests through `handleApiRequest`.
  - `tests/adapters.test.ts` (19 tests): Adapter normalization, streaming chunk handling, HTTP error translation across all provider kinds.
  - `tests/sse.test.ts` (16 tests): SSE parser framing, multiline data lines, BOM stripping, trailing flushes.
  - `tests/urlGuard.test.ts` (15 tests): Canonical hostnames, IP address filters, SSRF prevention.
  - `tests/crypto.test.ts` (15 tests): AES-256-GCM encryption/decryption, HKDF key derivation, envelope security.
  - `tests/errorTaxonomy.test.ts` (15 tests): HTTP status code classification, retry-after header parsing, provider failure normalization, user-facing error formatting.
  - `tests/clerk-supabase.test.ts` (9 tests): Clerk JWT authentication verification, Supabase PostgreSQL persistence integration.
  - `tests/chatRun.test.ts` (7 tests): Streaming execution, truncated stream detection, inactivity-based timeouts, steady streaming re-arming, cancellation abort propagation.
  - `tests/ui/comparisonPane.dom.test.tsx` (2 tests): Per-pane scroll isolation, independent scroll-to-latest button.
  - `tests/ui/emptyStateCta.dom.test.tsx` (2 tests): Empty workspace state CTA to configure providers when zero models exist.
- **Production Build (`vite build`)**: Complete client assets compiled cleanly into `dist/`.

---

## Known Limitations & Operational Notes

1. **DNS TOCTOU on Custom Provider URLs**: The server validates provider hostnames against DNS before making outbound fetch calls (`assertPublicHost`). However, because Node's native `fetch` performs its own internal DNS resolution, a theoretical Time-of-Check to Time-of-Use window exists if an attacker controls a split-horizon authoritative DNS server with sub-millisecond TTLs. Full protection against this requires custom socket connection pinning, which web-standard `fetch` does not currently expose.
2. **Serverless Active Runs Memory Map**: Active streaming runs are tracked in-memory (`activeRuns` Map in `server/api.ts`). In serverless environments (like Vercel), `/chat/cancel` will only reach the running request if the cancellation request lands on the identical warm serverless container instance.
3. **Database Latency on Vercel**: Using Cloudflare D1 over HTTP REST from Vercel Functions introduces ~40–80ms HTTP round-trip latency per batch query compared to co-located SQLite. This is an expected trade-off of combining free-tier compute with free-tier edge storage.
