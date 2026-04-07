/**
 * Centralized fetch wrapper that prepends the API base URL
 * and attaches the JWT token from localStorage.
 */

const getBaseUrl = () =>
  typeof window !== "undefined"
    ? "" // Client-side: relative URL, nginx proxies /api/ to backend
    : (process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"); // Server-side: Docker internal

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getBaseUrl();
  const url = `${base}${path}`;

  const headers = new Headers(options.headers);

  // Attach JWT if available
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers });

  // Handle 401 — redirect to login
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: string | unknown[] }).detail;
    let message: string;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail.map((d: any) => d.msg || String(d)).join("; ");
    } else {
      message = `API error: ${res.status} ${res.statusText}`;
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
