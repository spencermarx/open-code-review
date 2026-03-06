/**
 * Client-side auth token management.
 *
 * In production, the server injects the token into index.html as:
 *   <script>window.__OCR_TOKEN__="...";</script>
 *
 * In development, the Vite dev server serves a plain index.html so the
 * token is fetched once from the /auth/token bootstrap endpoint.
 */

declare global {
  interface Window {
    __OCR_TOKEN__?: string
  }
}

let cachedToken: string | null = null
let fetchPromise: Promise<string> | null = null

/**
 * Retrieve the auth token. Returns synchronously if already available
 * (production mode or after first fetch in dev mode).
 */
export function getAuthToken(): string | null {
  if (cachedToken) return cachedToken
  if (window.__OCR_TOKEN__) {
    cachedToken = window.__OCR_TOKEN__
    return cachedToken
  }
  return null
}

/**
 * Ensure the auth token is loaded. In production this resolves immediately.
 * In development, it fetches from /auth/token on first call.
 */
export async function ensureAuthToken(): Promise<string> {
  // Check synchronous sources first
  const sync = getAuthToken()
  if (sync) return sync

  // Dev mode: fetch from the bootstrap endpoint (deduplicated)
  if (!fetchPromise) {
    fetchPromise = fetch('/auth/token')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch auth token: ${res.status}`)
        return res.json()
      })
      .then((data: { token: string }) => {
        cachedToken = data.token
        window.__OCR_TOKEN__ = data.token
        return data.token
      })
  }

  return fetchPromise
}

/**
 * Build the Authorization header value for fetch requests.
 * Returns undefined if the token is not yet available.
 */
export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}
