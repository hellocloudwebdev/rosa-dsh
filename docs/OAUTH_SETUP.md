# OAuth setup

ROSA has no sign-up form and no password database. Every account is created by
an OAuth provider, so **at least one provider must be configured** before
anyone can sign in.

Until one is configured, `GET /api/health` returns an empty `auth` array and the
sign-in screen shows this message instead of a button that would go nowhere:

> This deployment has no OAuth sign-in configured. Set `GITHUB_CLIENT_ID` /
> `GITHUB_CLIENT_SECRET` or `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the
> server environment. See `docs/OAUTH_SETUP.md`.

## How the flow works

1. The sign-in screen reads `/api/health` and renders only the providers that
   are configured.
2. Clicking a provider does a real form `POST` to
   `/api/auth/<provider>/start`.
3. The server mints a random 256-bit `state`, stores it in a short-lived
   `rosa_oauth_state` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in
   production) and redirects to the provider.
4. The provider redirects back to
   `{ROSA_PUBLIC_APP_URL}/api/auth/<provider>/callback`.
5. The server compares the returned `state` with the cookie, **consumes it so
   it can never be replayed**, exchanges the `code` for an access token, reads
   the profile, upserts the user and sets the `rosa_session` cookie.
6. The browser lands on `{ROSA_PUBLIC_APP_URL}/app`.

If anything fails, the user is redirected to
`{ROSA_PUBLIC_APP_URL}/?error=<code>` and the sign-in screen shows the code.

### Cookies

| Cookie | Lifetime | Purpose |
| --- | --- | --- |
| `rosa_oauth_state` | 10 minutes | CSRF protection for the OAuth handshake |
| `rosa_session` | 30 days | Session token; only its SHA-256 hash is stored |

`ROSA_PUBLIC_APP_URL` must be the exact origin the browser uses, because the
provider compares the redirect URI character for character.

---

## GitHub

1. Go to <https://github.com/settings/developers> → **OAuth Apps** →
   **New OAuth App**.
2. Fill in:
   - **Homepage URL**: `http://localhost:5173` (dev) or your deployed origin.
   - **Authorization callback URL**:
     `http://localhost:5173/api/auth/github/callback`
3. Copy the **Client ID**, generate a **Client Secret**, and set:

   ```env
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```

The app requests `read:user` and `user:email` so it can read
`id`, `login`, `name`, `primary email` and `avatar_url`. It cannot touch
repositories, issues or anything else.

---

## Google

1. Go to <https://console.cloud.google.com/apis/credentials> → **Create
   Credentials** → **OAuth client ID** → application type **Web application**.
2. Add the **Authorised redirect URI**:
   `http://localhost:5173/api/auth/google/callback`
3. Copy the client ID and secret:

   ```env
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```

The scopes requested are `openid`, `email` and `profile`. The server reads
`sub`, `email`, `name` and `picture` only.

If the consent screen shows an "app isn't verified" warning during
development, add your account under **Test users** — that warning is Google's,
not ROSA's, and does not affect the token exchange.

---

## Both providers at once

Configure both if you like. `GET /api/health` lists both in its `auth` array
and the sign-in screen shows both buttons. Each is an independent button; a
user is matched to an existing account by **provider + subject**, never by
email, so the same person signing in with GitHub and then Google gets two
separate accounts (this is deliberate: unverified email matching would let
anyone who controls an OAuth app claim someone else's account).

---

## Production checklist

- [ ] `ROSA_SESSION_SECRET` is at least 32 random characters and is **not** the
      dev fallback. The server refuses to start in production without it.
- [ ] `ROSA_ENCRYPTION_KEY` is a fresh base64url-encoded 32-byte key.
      Without it, provider keys cannot be stored and `/api/health` reports
      `keyStorage: "session-only"`.
- [ ] `ROSA_PUBLIC_APP_URL` is the real origin (https, no trailing slash).
- [ ] Callback URLs registered with each provider match that origin exactly.
- [ ] `ROSA_ALLOW_LOCAL_HTTP` is **unset** — otherwise users can point a
      provider at internal addresses.
- [ ] `ROSA_DEV_MODE` is unset.

## Rotating `ROSA_ENCRYPTION_KEY`

Provider keys are encrypted with AES-256-GCM using a key derived from
`ROSA_ENCRYPTION_KEY` via HKDF-SHA256. Changing the key makes every stored
provider key undecryptable: users would see their provider listed but would
have to re-enter the key. There is currently no bulk re-encryption command, so
plan the rotation as a re-authentication event rather than an in-place
rotation.
