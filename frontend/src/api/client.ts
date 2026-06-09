const BASE = '/api/v1';

let accessToken: string | null = localStorage.getItem('vcp_access');
let refreshToken: string | null = localStorage.getItem('vcp_refresh');

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('vcp_access', access);
  else localStorage.removeItem('vcp_access');
  if (refresh) localStorage.setItem('vcp_refresh', refresh);
  else localStorage.removeItem('vcp_refresh');
}

export function getAccessToken() {
  return accessToken;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    setTokens(null, null);
    return false;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !retried && (await tryRefresh())) {
    return api(path, options, true);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new ApiError(res.status, msg ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
