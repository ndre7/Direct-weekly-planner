import { auth } from '../lib/firebase.ts';
import { detectProvider, PROVIDERS, ProviderId } from '../shared/providers.ts';

export interface CustomApiKey {
  id: string;            // "key_" + Date.now() + "_" + random 5 char string
  name: string;          // if empty: Persian provider name + last 4 digits of timestamp
  key: string;           // actual key value, trimmed
  provider: string;      // one of 12 provider IDs
  providerName?: string; // only for custom
  modelMode?: 'exact' | 'cascade';
  model?: string;        // empty = automatic waterfall or user-specified exact model
  baseUrl?: string;      // only for custom
  enabled: boolean;      // new key always true
  tokenUsage: number;    // cumulative token usage
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  errorMessage?: string; // sanitized, no HTML, max 300 chars
  lastChecked?: number;
  lastUsed?: number;
  createdAt: number;
}

export interface CompactKeyPayload {
  id: string;
  key: string;
  provider: string;
  providerName?: string;
  modelMode?: 'exact' | 'cascade';
  model?: string;
  baseUrl?: string;
}

const STORAGE_KEY = 'planner_custom_api_keys';

export function maskKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length > 12) {
    return `${trimmed.slice(0, 6)}.....${trimmed.slice(-4)}`;
  }
  return `........${trimmed.slice(-2)}`;
}

export function sanitizeErrorMessage(msg: string, keyToScrub?: string): string {
  if (!msg || typeof msg !== 'string') return 'خطای نامشخص در اعتبارسنجی کلید';
  let clean = msg.replace(/<[^>]*>/g, ' ');
  if (keyToScrub && keyToScrub.length >= 4) {
    clean = clean.split(keyToScrub).join('***');
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.slice(0, 300);
}

export function getKeys(): CustomApiKey[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Legacy migration from planner_gemini_keys
      try {
        const legacyRaw = localStorage.getItem('planner_gemini_keys');
        if (legacyRaw) {
          const parsedLegacy = JSON.parse(legacyRaw);
          if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
            const migrated: CustomApiKey[] = parsedLegacy
              .map((k: any) => String(k).trim())
              .filter(Boolean)
              .map((k: string, idx: number) => ({
                id: `key_${Date.now()}_${idx}`,
                name: `گوگل جمینای ${idx + 1}`,
                key: k,
                provider: 'gemini',
                modelMode: 'cascade' as const,
                enabled: true,
                tokenUsage: 0,
                status: 'idle',
                createdAt: Date.now()
              }));
            if (migrated.length > 0) {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
              return migrated;
            }
          }
        }
      } catch {}
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => {
      const keyVal = typeof item.key === 'string' ? item.key.trim() : '';
      const prov = item.provider || detectProvider(keyVal);
      return {
        id: item.id || `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: item.name || '',
        key: keyVal,
        provider: prov,
        providerName: item.providerName || undefined,
        modelMode: (item.modelMode === 'exact' ? 'exact' : 'cascade') as 'exact' | 'cascade',
        model: typeof item.model === 'string' ? item.model.trim() || undefined : undefined,
        baseUrl: item.baseUrl || undefined,
        enabled: item.enabled !== false,
        tokenUsage: typeof item.tokenUsage === 'number' ? item.tokenUsage : 0,
        status: (['idle', 'checking', 'valid', 'invalid'].includes(item.status) ? item.status : 'idle') as CustomApiKey['status'],
        errorMessage: item.errorMessage || undefined,
        lastChecked: typeof item.lastChecked === 'number' ? item.lastChecked : undefined,
        lastUsed: typeof item.lastUsed === 'number' ? item.lastUsed : undefined,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
      };
    });
  } catch {
    return [];
  }
}

function saveKeys(keys: CustomApiKey[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    window.dispatchEvent(new CustomEvent('planner-custom-api-keys-updated'));
    return true;
  } catch (e: any) {
    const isQuota =
      e?.name === 'QuotaExceededError' ||
      e?.code === 22 ||
      e?.code === 1014 ||
      (typeof e?.message === 'string' && e.message.toLowerCase().includes('quota'));

    if (isQuota) {
      window.dispatchEvent(new CustomEvent('planner-custom-api-keys-storage-error', { detail: e }));
    }
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      window.dispatchEvent(new CustomEvent('planner-custom-api-keys-updated'));
      window.dispatchEvent(new CustomEvent('planner-custom-api-keys-updated-from-other-tab'));
    }
  });
}

export function addKey(data: Partial<CustomApiKey>): { success: boolean; key?: CustomApiKey; error?: string } {
  const trimmedKey = (data.key || '').trim();
  if (!trimmedKey) {
    return { success: false, error: 'کلید نمی‌تواند خالی باشد.' };
  }
  if (trimmedKey.length < 5) {
    return { success: false, error: 'طول کلید باید حداقل ۵ کاراکتر باشد.' };
  }

  const existing = getKeys();
  const isDuplicate = existing.some((k) => k.key.trim() === trimmedKey);
  if (isDuplicate) {
    return { success: false, error: 'این کلید قبلاً ثبت شده است.' };
  }

  const provider = data.provider || detectProvider(trimmedKey);
  const provDef = PROVIDERS.find((p) => p.id === provider);
  const fallbackName = `${provDef?.nameFa || 'ارائه‌دهنده'} ${String(Date.now()).slice(-4)}`;
  const finalName = data.name?.trim() || fallbackName;

  const newKey: CustomApiKey = {
    id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: finalName,
    key: trimmedKey,
    provider,
    providerName: data.providerName?.trim() || undefined,
    modelMode: data.modelMode === 'exact' ? 'exact' : 'cascade',
    model: data.model?.trim() || undefined,
    baseUrl: data.baseUrl?.trim() || undefined,
    enabled: true,
    tokenUsage: 0,
    status: 'idle',
    createdAt: Date.now()
  };

  const updated = [newKey, ...existing];
  const saved = saveKeys(updated);
  if (!saved) {
    return { success: false, error: 'خطا در ذخیره‌سازی در حافظه مرورگر.' };
  }

  return { success: true, key: newKey };
}

export function updateKey(id: string, updates: Partial<CustomApiKey>): boolean {
  const existing = getKeys();
  const index = existing.findIndex((k) => k.id === id);
  if (index === -1) return false;

  const current = existing[index];
  existing[index] = {
    ...current,
    ...updates,
    key: updates.key !== undefined ? updates.key.trim() : current.key,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    modelMode: updates.modelMode !== undefined ? updates.modelMode : current.modelMode,
    model: updates.model !== undefined ? updates.model.trim() || undefined : current.model
  };

  return saveKeys(existing);
}

export function removeKey(id: string): boolean {
  const existing = getKeys();
  const filtered = existing.filter((k) => k.id !== id);
  return saveKeys(filtered);
}

export function toggleEnabled(id: string): boolean {
  const existing = getKeys();
  const target = existing.find((k) => k.id === id);
  if (!target) return false;
  target.enabled = !target.enabled;
  return saveKeys(existing);
}

export function resetUsage(id: string): boolean {
  const existing = getKeys();
  const target = existing.find((k) => k.id === id);
  if (!target) return false;
  target.tokenUsage = 0;
  return saveKeys(existing);
}

export function resetAllUsage(): boolean {
  const existing = getKeys();
  existing.forEach((k) => {
    k.tokenUsage = 0;
  });
  return saveKeys(existing);
}

export function setStatus(id: string, status: CustomApiKey['status'], errorMessage?: string): boolean {
  const existing = getKeys();
  const target = existing.find((k) => k.id === id);
  if (!target) return false;
  target.status = status;
  if (errorMessage !== undefined) {
    target.errorMessage = sanitizeErrorMessage(errorMessage, target.key);
  }
  target.lastChecked = Date.now();
  return saveKeys(existing);
}

export function recordUsage(id: string, tokens: number): void {
  if (!tokens || tokens <= 0) return;
  const existing = getKeys();
  const target = existing.find((k) => k.id === id);
  if (!target) return;
  target.tokenUsage = (target.tokenUsage || 0) + tokens;
  target.lastUsed = Date.now();
  saveKeys(existing);
}

export async function testKey(id: string): Promise<{ valid: boolean; workingModel?: string; error?: string }> {
  const existing = getKeys();
  const target = existing.find((k) => k.id === id);
  if (!target) return { valid: false, error: 'کلید یافت نشد' };

  setStatus(id, 'checking');

  try {
    const token = await auth.currentUser?.getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/gemini/validate-key', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        apiKey: target.key,
        provider: target.provider,
        baseUrl: target.baseUrl,
        model: target.model,
        modelMode: target.modelMode || 'cascade'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.valid) {
      setStatus(id, 'valid');
      return { valid: true, workingModel: data.workingModel || data.model };
    }

    const err = data.error || `خطا در اعتبارسنجی (کد ${res.status})`;
    setStatus(id, 'invalid', err);
    return { valid: false, error: err };
  } catch (e: any) {
    const err = e?.message || 'خطای شبکه در اتصال به سرور اعتبارسنجی';
    setStatus(id, 'invalid', err);
    return { valid: false, error: err };
  }
}

export async function checkAllKeys(): Promise<void> {
  const keys = getKeys().filter((k) => k.enabled);
  for (const k of keys) {
    await testKey(k.id);
  }
}

export function buildKeyHeaderPayload(): CompactKeyPayload[] {
  const keys = getKeys();
  const active = keys.filter((k) => k.enabled && k.key && k.key.length > 5);

  active.sort((a, b) => {
    if (a.status === 'valid' && b.status !== 'valid') return -1;
    if (b.status === 'valid' && a.status !== 'valid') return 1;
    return (b.lastChecked || 0) - (a.lastChecked || 0);
  });

  return active.slice(0, 10).map((k) => ({
    id: k.id,
    key: k.key,
    provider: k.provider,
    providerName: k.providerName,
    modelMode: k.modelMode || 'cascade',
    model: k.modelMode === 'exact' ? (k.model || '') : '',
    baseUrl: k.baseUrl
  }));
}

export async function listProviderModels(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ success: boolean; models: string[]; error?: string }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/gemini/list-models', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider,
        apiKey,
        baseUrl
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.models)) {
      return { success: true, models: data.models };
    }
    return { success: false, models: [], error: data.error || 'خطا در دریافت لیست مدل‌ها' };
  } catch (e: any) {
    return { success: false, models: [], error: e?.message || 'خطای شبکه' };
  }
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string | undefined;
  try {
    token = await auth.currentUser?.getIdToken();
  } catch {}

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const payload = buildKeyHeaderPayload();
  if (payload.length > 0) {
    defaultHeaders['x-custom-api-keys'] = JSON.stringify(payload);
  }

  const userHeaders: Record<string, string> = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        userHeaders[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        userHeaders[key] = value;
      });
    } else {
      Object.assign(userHeaders, options.headers);
    }
  }

  const mergedHeaders: Record<string, string> = {
    ...defaultHeaders,
    ...userHeaders
  };

  const response = await fetch(url, {
    ...options,
    headers: mergedHeaders
  });

  try {
    const usedKeyId = response.headers.get('x-used-custom-key-id');
    const usedTokens = response.headers.get('x-used-token-count');
    if (usedKeyId) {
      const tokens = parseInt(usedTokens || '0', 10);
      recordUsage(usedKeyId, isNaN(tokens) ? 0 : tokens);
    }
  } catch {}

  return response;
}
