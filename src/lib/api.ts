/**
 * Authenticated API client for Cloudflare Worker & Supabase.
 * Attaches Clerk JWT bearer tokens to requests for end-to-end zero-trust security.
 */

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
  getToken?: () => Promise<string | null>,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Proceed without token if not signed in
    }
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

/** Check health and current authenticated session. */
export async function getSession(getToken?: () => Promise<string | null>) {
  const res = await fetchWithAuth("/api/session", undefined, getToken);
  if (!res.ok) return null;
  return res.json();
}
