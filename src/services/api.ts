import { openDB } from 'idb';

const TOKEN_KEY = 'uniflow_token';
const API_BASE = '/api';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Offline IndexedDB Queue Setup
async function getOfflineDb() {
  try {
    return await openDB('uniflow-offline-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('scan_queue')) {
          db.createObjectStore('scan_queue', { keyPath: 'idempotencyKey' });
        }
      }
    });
  } catch {
    return null;
  }
}

export async function queueOfflineScan(scanPayload: { endpoint: string; body: any; idempotencyKey: string }) {
  const db = await getOfflineDb();
  if (!db) return;
  await db.put('scan_queue', {
    ...scanPayload,
    queuedAt: new Date().toISOString()
  });
}

export async function syncOfflineQueue() {
  if (!navigator.onLine) return;
  const db = await getOfflineDb();
  if (!db) return;
  const queue = await db.getAll('scan_queue');
  if (queue.length === 0) return;

  for (const item of queue) {
    try {
      await apiFetch(item.endpoint, { method: 'POST', body: JSON.stringify(item.body) });
      await db.delete('scan_queue', item.idempotencyKey);
    } catch (err) {
      console.warn('Sync pending for item:', item.idempotencyKey, err);
    }
  }
}

// Auto-sync listener when coming online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineQueue();
  });
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Sanitize endpoint to prevent /api/api duplication
  let cleanEndpoint = endpoint;
  if (cleanEndpoint.startsWith('/api/')) {
    cleanEndpoint = cleanEndpoint.substring(4);
  } else if (!cleanEndpoint.startsWith('/')) {
    cleanEndpoint = `/${cleanEndpoint}`;
  }

  const url = `${API_BASE}${cleanEndpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 401) {
      if (!cleanEndpoint.includes('/auth/login')) {
        setStoredToken(null);
        localStorage.removeItem('uniflow_user');
        localStorage.removeItem('uniflow_role');
        localStorage.removeItem('uniflow_active_job');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('uniflow_unauthorized'));
        }
      }
    }

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}`);
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }

    return data as T;
  } catch (err: any) {
    if (!navigator.onLine && options.method === 'POST' && endpoint.includes('/scans')) {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const idempotencyKey = body.idempotencyKey || `off-${Date.now()}`;
      await queueOfflineScan({ endpoint, body, idempotencyKey });
      throw new Error('OFFLINE_QUEUED');
    }
    throw err;
  }
}

export async function login(username: string, password_hash: string) {
  const res = await apiFetch<{ token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password: password_hash }),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function getPendingSyncCount(): Promise<number> {
  try {
    const db = await getOfflineDb();
    if (!db) return 0;
    const all = await db.getAll('scan_queue');
    return all.length;
  } catch {
    return 0;
  }
}

export async function flushPendingScans(): Promise<void> {
  await syncOfflineQueue();
}
