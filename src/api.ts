// Tiny client for the Worker. Paths are relative (/api/...); Vite proxies them
// to wrangler in dev and the Worker serves them in production.

export interface Api {
  post<T = unknown>(path: string, body: unknown): Promise<T>;
  get<T = unknown>(path: string): Promise<T>;
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data) ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export const api: Api = {
  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handle(res);
  },
  async get(path) {
    return handle(await fetch(path));
  },
};
