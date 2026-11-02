import { PlannerData } from '../types';
import { jalaliToGregorian } from '../utils/jalali';
import { sanitizeGCalEventId } from '../components/GoogleCalendarSync';

// Helper to convert date to RFC3339 offset-safe ISO string
function formatLocalISO(date: Date): string {
  const pad = (num: number) => String(num).padStart(2, '0');
  const tzo = -date.getTimezoneOffset();
  const dif = tzo >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(tzo) / 60));
  const minutes = pad(Math.abs(tzo) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${dif}${hours}:${minutes}`;
}

// Convert Persian digits to English
function toAsciiDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

// Simple Persian date string/object to Date
function resolveDate(dateInput: any, defaultYear: number = 1405): Date | null {
  if (!dateInput) return null;
  try {
    if (typeof dateInput === 'string') {
      const clean = toAsciiDigits(dateInput.trim());
      const match = clean.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
      if (match) {
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const d = parseInt(match[3], 10);
        if (y && m && d) return jalaliToGregorian(y, m, d);
      }
    } else if (typeof dateInput === 'object') {
      const d = typeof dateInput.day === 'number' ? dateInput.day : parseInt(dateInput.day, 10);
      let m: number | null = null;
      if (typeof dateInput.month === 'number') m = dateInput.month;
      const y = dateInput.year || defaultYear;
      if (d && m && y) return jalaliToGregorian(y, m, d);
    }
  } catch (_) {}
  return null;
}

// ----------------------------------------------------------------------------
// Quota and Backoff Helpers (W4)
// ----------------------------------------------------------------------------

export function getTodayGCalUsageKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `gcal_api_req_used_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getTodayGCalUsage(): number {
  try {
    const val = localStorage.getItem(getTodayGCalUsageKey());
    return val ? parseInt(val, 10) || 0 : 0;
  } catch (_) {
    return 0;
  }
}

export function incrementTodayGCalUsage(by: number = 1): number {
  try {
    const key = getTodayGCalUsageKey();
    const current = getTodayGCalUsage();
    const updated = current + by;
    localStorage.setItem(key, String(updated));
    return updated;
  } catch (_) {
    return 0;
  }
}

export function isDailyQuotaExceeded(cap: number = 400): boolean {
  return getTodayGCalUsage() >= cap;
}

export function getQuotaBackoffUntil(): number {
  try {
    return Number(localStorage.getItem('gcal_quota_backoff_until') || 0);
  } catch (_) {
    return 0;
  }
}

export function setQuotaBackoff(attempt: number = 1): number {
  // Backoff ladder: 60s -> 300s (5m) -> 900s (15m) -> 3600s (60m)
  const steps = [60, 300, 900, 3600];
  const idx = Math.min(Math.max(attempt - 1, 0), steps.length - 1);
  const backoffSec = steps[idx];
  const until = Date.now() + backoffSec * 1000;
  try {
    localStorage.setItem('gcal_quota_backoff_until', String(until));
    localStorage.setItem('gcal_quota_backoff_attempt', String(attempt));
    window.dispatchEvent(new CustomEvent('app-sync-status', { detail: { status: 'offline' } }));
  } catch (_) {}
  return until;
}

export function clearQuotaBackoff(): void {
  try {
    localStorage.removeItem('gcal_quota_backoff_until');
    localStorage.removeItem('gcal_quota_backoff_attempt');
  } catch (_) {}
}

// ----------------------------------------------------------------------------
// Fingerprint Helpers (W3 & W4)
// ----------------------------------------------------------------------------

export function computeCalendarItemFingerprint(item: {
  summary: string;
  description: string;
  start: Date;
  end: Date;
}): string {
  return `${item.summary}:::${item.description}:::${formatLocalISO(item.start)}:::${formatLocalISO(item.end)}`;
}

export function computeCalendarContentFingerprint(data: PlannerData): string {
  const parts: string[] = [];
  (data.coreTasks || []).forEach(ct => {
    if (!ct.title || ct.status === 'completed' || ct.status === 'failed') return;
    parts.push(`ct:${ct.id}:${ct.title}:${ct.deadline || ''}`);
  });
  (data.secondaryTasks || []).forEach(st => {
    if (!st.textFa || st.status === 'completed' || st.status === 'failed') return;
    parts.push(`st:${st.id}:${st.textFa}:${st.deadline || ''}`);
  });
  (data.detailsColumns || []).forEach(c => {
    (c.items || []).forEach(it => {
      if (!it.text || it.completed) return;
      parts.push(`det:${it.id}:${it.text}:${it.date || it.deadline || ''}`);
    });
  });
  (data.examColumns || []).forEach(c => {
    (c.items || []).forEach(it => {
      if (!it.text || it.completed) return;
      parts.push(`ex:${it.id}:${it.text}:${it.date || it.deadline || ''}`);
    });
  });
  (data.todoList || []).forEach(td => {
    if (!td.text || td.completed) return;
    parts.push(`td:${td.id}:${td.text}:${(td as any).date || (td as any).deadline || ''}`);
  });
  return parts.sort().join('|');
}

// ----------------------------------------------------------------------------
// Main Auto Sync Engine
// ----------------------------------------------------------------------------

export interface SyncResult {
  updatedMap: Record<string, string>;
  updatedFingerprints: Record<string, string>;
  upsertedCount: number;
  deletedCount: number;
  errors: string[];
  skipped?: boolean;
  quotaExceeded?: boolean;
  quotaBackoff?: boolean;
}

export async function runGoogleCalendarAutoSync(
  data: PlannerData,
  token: string,
  calendarId: string = 'primary',
  options: { isManual?: boolean } = {}
): Promise<SyncResult> {
  const existingMap: Record<string, string> = { ...(data.plannerCalendarMap || {}) };
  const existingFingerprints: Record<string, string> = { ...(data.plannerCalendarFingerprints || {}) };
  const updatedMap: Record<string, string> = { ...existingMap };
  const updatedFingerprints: Record<string, string> = { ...existingFingerprints };

  // 1. Quota Backoff Check
  const backoffUntil = getQuotaBackoffUntil();
  if (Date.now() < backoffUntil) {
    return {
      updatedMap,
      updatedFingerprints,
      upsertedCount: 0,
      deletedCount: 0,
      errors: ['Google Calendar API quota backoff active'],
      skipped: true,
      quotaBackoff: true
    };
  }

  // 2. Daily Request Cap Check (Manual sync allowed with warning)
  const dailyCap = data.gcalDailyRequestCap || 400;
  if (!options.isManual && isDailyQuotaExceeded(dailyCap)) {
    return {
      updatedMap,
      updatedFingerprints,
      upsertedCount: 0,
      deletedCount: 0,
      errors: ['Daily Google Calendar API quota cap reached'],
      skipped: true,
      quotaExceeded: true
    };
  }

  const currentYear = data.weekYear || 1405;
  const timezone = 'Asia/Tehran';
  const itemsToSync: { id: string; summary: string; description: string; start: Date; end: Date }[] = [];

  // Core Tasks
  (data.coreTasks || []).forEach(ct => {
    if (!ct.title || ct.status === 'completed' || ct.status === 'failed') return;
    const gDate = resolveDate(ct.deadline, currentYear);
    if (gDate) {
      const start = new Date(gDate);
      start.setHours(9, 0, 0, 0);
      const end = new Date(gDate);
      end.setHours(10, 0, 0, 0);
      itemsToSync.push({
        id: `core-${ct.id}`,
        summary: `🎯 ${ct.title}`,
        description: ct.description || 'کار اصلی برنامه‌ریزی هفتگی',
        start,
        end
      });
    }
  });

  // Secondary Tasks
  (data.secondaryTasks || []).forEach(st => {
    if (!st.textFa || st.status === 'completed' || st.status === 'failed') return;
    const gDate = resolveDate(st.deadline, currentYear);
    if (gDate) {
      const start = new Date(gDate);
      start.setHours(11, 0, 0, 0);
      const end = new Date(gDate);
      end.setHours(12, 0, 0, 0);
      itemsToSync.push({
        id: `sec-${st.id}`,
        summary: `📌 ${st.textFa}`,
        description: st.description || 'کار فرعی برنامه‌ریزی',
        start,
        end
      });
    }
  });

  // Details Columns (Deadlines)
  (data.detailsColumns || []).forEach(col => {
    (col.items || []).forEach(it => {
      if (!it.text || it.completed) return;
      const gDate = resolveDate(it.date || it.deadline, currentYear);
      if (gDate) {
        const start = new Date(gDate);
        start.setHours(14, 0, 0, 0);
        const end = new Date(gDate);
        end.setHours(15, 0, 0, 0);
        itemsToSync.push({
          id: `det-${col.id}-${it.id}`,
          summary: `⏰ [${col.titleFa}] ${it.text}`,
          description: it.description || 'ددلاین ستون جزئیات',
          start,
          end
        });
      }
    });
  });

  // Exam Columns
  (data.examColumns || []).forEach(col => {
    (col.items || []).forEach(it => {
      if (!it.text || it.completed) return;
      const gDate = resolveDate(it.date || it.deadline, currentYear);
      if (gDate) {
        const start = new Date(gDate);
        start.setHours(9, 0, 0, 0);
        const end = new Date(gDate);
        end.setHours(11, 0, 0, 0);
        itemsToSync.push({
          id: `exam-${col.id}-${it.id}`,
          summary: `🎓 [${it.type || 'امتحان'}] ${col.titleFa}: ${it.text}`,
          description: it.description || 'امتحان یا ارائه دانشگاهی',
          start,
          end
        });
      }
    });
  });

  // Todo List
  (data.todoList || []).forEach(td => {
    if (!td.text || td.completed) return;
    const gDate = resolveDate((td as any).date || (td as any).deadline, currentYear);
    if (gDate) {
      const start = new Date(gDate);
      start.setHours(16, 0, 0, 0);
      const end = new Date(gDate);
      end.setHours(17, 0, 0, 0);
      itemsToSync.push({
        id: `todo-${td.id}`,
        summary: `📝 ${td.text}`,
        description: 'کار در لیست تودو',
        start,
        end
      });
    }
  });

  const activeItemIds = new Set(itemsToSync.map(it => it.id));

  // 3. Item-level Diff (W4-1)
  const itemsNeedingUpsert = itemsToSync.filter(item => {
    const newFp = computeCalendarItemFingerprint(item);
    const existingFp = existingFingerprints[item.id];
    const isMapped = !!existingMap[item.id];
    // If mapped and fingerprint matches, item is unchanged -> skip
    return !isMapped || existingFp !== newFp;
  });

  const itemsNeedingDelete = Object.entries(existingMap).filter(([prevItemId]) => {
    return !activeItemIds.has(prevItemId);
  });

  // If nothing changed and nothing to delete -> 0 HTTP requests!
  if (itemsNeedingUpsert.length === 0 && itemsNeedingDelete.length === 0) {
    return {
      updatedMap,
      updatedFingerprints,
      upsertedCount: 0,
      deletedCount: 0,
      errors: [],
      skipped: true
    };
  }

  let upsertedCount = 0;
  let deletedCount = 0;
  const errors: string[] = [];
  let currentAttempt = Number(localStorage.getItem('gcal_quota_backoff_attempt') || 1);

  // A. Upsert changed or new items
  for (const item of itemsNeedingUpsert) {
    if (!options.isManual && isDailyQuotaExceeded(dailyCap)) {
      errors.push('Daily quota cap reached during sync batch');
      break;
    }

    const gcalEventId = sanitizeGCalEventId(item.id);
    const itemFp = computeCalendarItemFingerprint(item);
    const body = JSON.stringify({
      id: gcalEventId,
      summary: item.summary,
      description: item.description,
      start: { dateTime: formatLocalISO(item.start), timeZone: timezone },
      end: { dateTime: formatLocalISO(item.end), timeZone: timezone }
    });

    try {
      incrementTodayGCalUsage(1);
      const putRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${gcalEventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body
      });

      if (putRes.ok) {
        upsertedCount++;
        updatedMap[item.id] = gcalEventId;
        updatedFingerprints[item.id] = itemFp;
        clearQuotaBackoff();
      } else if (putRes.status === 404) {
        // Fallback POST
        incrementTodayGCalUsage(1);
        const postRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body
        });
        if (postRes.ok) {
          upsertedCount++;
          updatedMap[item.id] = gcalEventId;
          updatedFingerprints[item.id] = itemFp;
          clearQuotaBackoff();
        } else {
          const errText = await postRes.text().catch(() => '');
          if (postRes.status === 403 || postRes.status === 429) {
            setQuotaBackoff(currentAttempt + 1);
            errors.push('Quota limit exceeded on POST');
            break;
          }
          errors.push(`Failed to POST event ${item.id}: ${errText.slice(0, 80)}`);
        }
      } else {
        const errText = await putRes.text().catch(() => '');
        if (putRes.status === 403 || putRes.status === 429) {
          setQuotaBackoff(currentAttempt + 1);
          errors.push('Quota limit exceeded on PUT');
          break;
        }
        errors.push(`PUT returned status ${putRes.status} for ${item.id}`);
      }
    } catch (e: any) {
      errors.push(`Network error on event ${item.id}: ${e?.message || e}`);
    }
  }

  // B. Delete items that were removed from the app
  for (const [prevItemId, gcalId] of itemsNeedingDelete) {
    if (!options.isManual && isDailyQuotaExceeded(dailyCap)) break;

    try {
      incrementTodayGCalUsage(1);
      const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${gcalId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (delRes.ok || delRes.status === 404 || delRes.status === 410) {
        deletedCount++;
        delete updatedMap[prevItemId];
        delete updatedFingerprints[prevItemId];
      } else if (delRes.status === 403 || delRes.status === 429) {
        setQuotaBackoff(currentAttempt + 1);
        errors.push('Quota limit exceeded on DELETE');
        break;
      }
    } catch (_) {
      // Soft fail on delete, keep map
    }
  }

  return { updatedMap, updatedFingerprints, upsertedCount, deletedCount, errors };
}
