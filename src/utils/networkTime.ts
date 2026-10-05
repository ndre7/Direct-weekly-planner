/**
 * networkTime.ts
 * Real internet network time with seamless offline continuation.
 *
 * Safe implementation: No window.fetch monkey-patching (avoids read-only getter errors).
 * Uses standalone timeSyncFetch wrapper and dedicated event listeners.
 *
 * Limitation note (G6):
 * While offline, time advances naturally via the device hardware clock combined with the persisted offset.
 * If the user intentionally manipulates the system device clock while in offline mode,
 * the browser runtime cannot detect or verify the skew until a network connection is re-established.
 */

const STORAGE_OFFSET_KEY = 'planner_time_offset_ms';
const STORAGE_SYNCED_KEY = 'planner_time_synced';

let cachedOffsetMs: number = 0;
let isReliable: boolean = false;
let isInitialized: boolean = false;

// Initialize from localStorage immediately upon module evaluation
if (typeof window !== 'undefined') {
  try {
    const storedOffset = localStorage.getItem(STORAGE_OFFSET_KEY);
    const storedSynced = localStorage.getItem(STORAGE_SYNCED_KEY);
    if (storedOffset !== null) {
      const parsed = parseInt(storedOffset, 10);
      if (!Number.isNaN(parsed)) {
        cachedOffsetMs = parsed;
      }
    }
    if (storedSynced === 'true') {
      isReliable = true;
    }
  } catch {
    // localStorage might be unavailable
  }
}

/**
 * Updates offset from an HTTP Date header.
 * Uses (serverDate + half RTT) to measure network time against local device clock.
 * Applies a 5000ms threshold to prevent unnecessary jitter.
 */
export function updateNetworkTimeFromDateHeader(dateHeader: string, requestStartTime?: number): void {
  try {
    const serverTimestamp = Date.parse(dateHeader);
    if (Number.isNaN(serverTimestamp)) return;

    const deviceNow = Date.now();
    const rtt = (requestStartTime && requestStartTime <= deviceNow) ? (deviceNow - requestStartTime) : 0;
    const estimatedServerNow = serverTimestamp + Math.round(rtt / 2);
    const calculatedOffset = estimatedServerNow - deviceNow;

    // Apply offset only if deviation exceeds 5000ms, or reset to 0 if within normal 5s drift
    if (Math.abs(calculatedOffset) > 5000) {
      cachedOffsetMs = calculatedOffset;
    } else {
      cachedOffsetMs = 0;
    }

    isReliable = true;

    try {
      localStorage.setItem(STORAGE_OFFSET_KEY, String(cachedOffsetMs));
      localStorage.setItem(STORAGE_SYNCED_KEY, 'true');
    } catch {
      // Ignore localStorage write error
    }
  } catch (err) {
    console.warn('Failed to parse network time Date header:', err);
  }
}

/**
 * Inspects a fetch Response object for the standard Date header.
 */
export function updateNetworkTimeFromResponse(response: Response, requestStartTime?: number): void {
  try {
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      updateNetworkTimeFromDateHeader(dateHeader, requestStartTime);
    }
  } catch {
    // Ignore header read error
  }
}

/**
 * Safe standalone fetch wrapper that intercepts Date headers without touching window.fetch.
 */
export async function timeSyncFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startTime = Date.now();
  const resp = await fetch(input, init);
  try {
    const dateHeader = resp.headers.get('date');
    if (dateHeader) {
      updateNetworkTimeFromDateHeader(dateHeader, startTime);
    }
  } catch {
    // Ignore header inspection failure
  }
  return resp;
}

/**
 * Actively triggers a lightweight request to refresh network time from server headers.
 */
export async function refreshNetworkTime(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  try {
    await timeSyncFetch('/api/auth/validate', {
      method: 'HEAD',
      cache: 'no-store'
    }).catch(async () => {
      // Fallback: simple fetch to root
      return await timeSyncFetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
    });
  } catch {
    // Offline or network error - offline time continues naturally
  }
}

/**
 * Initializes network time synchronization safely:
 * - Hooks into the 'online' event to refresh time upon reconnection.
 * - Triggers an initial background sync via timeSyncFetch.
 * - Never touches or rewrites window.fetch!
 */
export function initNetworkTime(): void {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Listen for online event
  window.addEventListener('online', () => {
    refreshNetworkTime();
  });

  // Initial background sync
  if (navigator.onLine) {
    refreshNetworkTime();
  }
}

/**
 * Returns current Date adjusted by network time offset.
 * Continues naturally offline.
 */
export function getNow(): Date {
  return new Date(Date.now() + cachedOffsetMs);
}

/**
 * Returns label indicating whether current time is verified from network or relying purely on device clock.
 */
export function getTimeSourceLabel(): 'network' | 'device' {
  return isReliable ? 'network' : 'device';
}

/**
 * Returns true if network time has been verified at least once.
 */
export function isTimeReliable(): boolean {
  return isReliable;
}

/**
 * Returns current offset in milliseconds between network time and device clock.
 */
export function getOffsetMs(): number {
  return cachedOffsetMs;
}
