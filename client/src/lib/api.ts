const API_BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:4000";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

export const apiBase = API_BASE;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          setAccessToken(null);
          return null;
        }
        const data = await res.json();
        setAccessToken(data.accessToken);
        return data.accessToken as string;
      } catch {
        setAccessToken(null);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const { method = "GET", body, formData } = options;
  let token = accessToken;

  const headers: Record<string, string> = {};
  if (!formData && body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
  });

  // 401: coba refresh sekali lalu retry
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        credentials: "include",
        body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      });
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiUrl = (path: string) => `${API_BASE}${path}`;