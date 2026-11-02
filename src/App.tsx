import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Plus,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  FileText,
  ListTodo,
  CalendarDays,
  Activity,
  Award,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Sliders,
  Check,
  BookOpen,
  Frown,
  HelpCircle,
  TrendingDown,
  CheckSquare,
  Link2,
  ArrowUpDown,
  BarChart3,
  GraduationCap,
  Mail,
  Bell,
  Send,
  Archive
} from 'lucide-react';

import { PlannerData, ClassSlot, DailyTask, Category, SecondaryTask, ReminderItem, ReminderFrequency, NoteItem, DetailsColumn, DetailsItem, CoreTask, PostponedEvent, User, ArchiveWeek, NotesArchiveEntry, APP_VERSION } from './types';
import { INITIAL_PLANNER_DATA } from './initialData';
import { TRANSLATIONS, DAYS_OF_WEEK } from './translations';
import { getIdToken } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase.ts';
import { safeParseJson, getCachedGmailToken, connectGmail, clientSignOut, clientDeleteAccount, onAuthStateChanged, isGmailTokenExpired, getCachedGoogleCalendarToken, isCalendarTokenExpired } from './lib/auth.ts';
import { 
  subscribeToPlannerSubcollections,
  savePlannerSubcollections,
  queuePendingSync,
  hasPendingSync,
  migratePlannerDataToSubcollections,
  flushPendingSyncQueue,
  pruneOldSnapshots,
  cleanupLeakedParentFields,
  addCoreTask, 
  addSecondaryTask, 
  addTodo, 
  addDailyThought 
} from './lib/firestoreSync.ts';
import {
  getOrCreateMirror,
  hashContent,
  deepStripUndefined,
  sanitizePhaseForStorage
} from './lib/plannerSyncEngine.ts';
import { sendGmailEmail, buildReminderEmailHtml, parseItemDeadlineMs, getOffsetMs, getOffsetLabelFa, REMINDER_OFFSET_OPTIONS, ReminderOffset } from './lib/gmailReminders';
import { 
  runGoogleCalendarAutoSync, 
  computeCalendarContentFingerprint, 
  getQuotaBackoffUntil, 
  isDailyQuotaExceeded 
} from './lib/gcalAutoSyncEngine';

// Modular Sub-components
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ClassSlotModal from './components/ClassSlotModal';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import DailyTaskModal from './components/DailyTaskModal';
import AnalyticsTab from './components/AnalyticsTab';
import GoalsTab from './components/GoalsTab';
import UserProfileModal from './components/UserProfileModal';
import { 
  YEARS_1400_TO_1430, 
  JALALI_WEEKDAYS, 
  JALALI_MONTHS, 
  getJalaliWeekday, 
  getDaysInJalaliMonth, 
  getCurrentJalaliWeekRange, 
  getTodayJalali, 
  getNextWeekRangeFromEnd, 
  addJalaliDays, 
  getTodayTehranISO, 
  getTehranDateParts, 
  getDeadlineOverdueStatus, 
  parseAndFormatJalaliDeadline,
  isWeekRangeValid
} from './utils/jalali';
import { initNetworkTime, getNow, refreshNetworkTime, timeSyncFetch } from './utils/networkTime';
import SettingsPage from './components/SettingsPage';
import { SessionManager, verifyAndRepairPlannerData } from './components/SessionManager';
import DayInspectorModal from './components/DayInspectorModal';
import { DateTimeSelect } from './components/DateTimeSelect';

console.info(`[DirectPlanner] build ${APP_VERSION}`);

// Month-to-Number map for exact date formatting
const MONTHS_MAP: { [key: string]: string } = {
  'فروردین': '01',
  'اردیبهشت': '02',
  'خرداد': '03',
  'تیر': '04',
  'مرداد': '05',
  'شهریور': '06',
  'مهر': '07',
  'آبان': '08',
  'آذر': '09',
  'دی': '10',
  'بهمن': '11',
  'اسفند': '12',
};

const toPersianDigits = (num: number | string) => {
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return num.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x)]);
};

const getInterpolatedColor = (pct: number) => {
  if (pct <= 0) return '#f8fafc';
  const rStart = 239, gStart = 68, bStart = 68;
  const rEnd = 5, gEnd = 150, bEnd = 105;
  
  const r = Math.round(rStart + (rEnd - rStart) * pct);
  const g = Math.round(gStart + (gEnd - gStart) * pct);
  const b = Math.round(bStart + (bEnd - bStart) * pct);
  
  return `rgb(${r}, ${g}, ${b})`;
};

const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

// Jalali to Gregorian converter (Jalaali algorithm)
function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  let gy: number;
  if (jy > 979) {
    gy = 1600;
    jy -= 979;
  } else {
    gy = 621;
  }
  let days = (365 * jy) + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += Math.floor((days - 1) / 36524); // safely divide days
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  let d = gd;
  for (let i = 0; i < sal_a.length; i++) {
    gm = i;
    if (d <= sal_a[i]) break;
    d -= sal_a[i];
  }
  return new Date(gy, gm - 1, d);
}

const isPersianText = (text: string): boolean => {
  if (!text) return true;
  const persianRegex = /[\u0600-\u06FF]/;
  return persianRegex.test(text);
};

const NORMALIZED_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سهشنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه'
];

const normalizeWeekday = (w: string): string => {
  if (!w) return '';
  return w.replace(/\s+/g, '').replace('‌', '').replace('‌', ''); // remove spaces and zero-width non-joiners
};

const parsePersianDate = (dateStr: string): { day: number; month: string } | null => {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    const day = parseInt(parts[0], 10);
    const month = parts[1];
    if (!isNaN(day) && month) {
      return { day, month };
    }
  }
  return null;
};

// F1: Centralized completion date formatting: formatCompletionDate(day, monthName, year) -> 'YYYY/MM/DD'
export const formatCompletionDate = (day: number, monthName: string, year: number): string => {
  const mIndex = JALALI_MONTHS.indexOf(monthName);
  const m = mIndex !== -1 ? mIndex + 1 : 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${year}/${mm}/${dd}`;
};

const getDaysInMonthStatic = (monthName: string, year: number = getTodayJalali().year): number => {
  return getDaysInJalaliMonth(monthName, year);
};

const getWeekDatesForData = (plannerData: PlannerData): string[] => {
  const list = [];
  const start = plannerData.weekStartDay || 1;
  const end = plannerData.weekEndDay || 7;
  const startMonth = plannerData.weekMonth || 'خرداد';
  const endMonth = plannerData.weekEndMonth || startMonth;
  const year = plannerData.weekYear || getTodayJalali().year;

  const daysInStartMonth = getDaysInJalaliMonth(startMonth, year);

  const absStart = start;
  const absEnd = startMonth === endMonth ? end : (daysInStartMonth + end);

  for (let i = 0; i < 7; i++) {
    const clampedAbs = Math.min(absStart + i, absEnd);
    if (clampedAbs <= daysInStartMonth) {
      list.push(`${clampedAbs} ${startMonth}`);
    } else {
      list.push(`${clampedAbs - daysInStartMonth} ${endMonth}`);
    }
  }
  return list;
};

// F2: Real Jalali weekday calculation using getJalaliWeekday (UTC-safe, no timezone shift)
const getWeekdayOfPersianDate = (year: number, monthName: string, day: number): string => {
  const mIndex = JALALI_MONTHS.indexOf(monthName);
  if (mIndex === -1) return '';
  const jm = mIndex + 1;
  const jw = getJalaliWeekday(year, jm, day);
  return jw.weekday.fa;
};

const getTaskDeadlineCompleteDisplay = (deadline: any, weekDates: string[], year: number): string => {
  if (!deadline) return '';
  const { day, month, weekday, year: deadlineYear } = deadline;
  const effectiveYear = deadlineYear || year;
  
  if (day && month) {
    const calculatedWeekday = getWeekdayOfPersianDate(effectiveYear, month, day);
    const wd = calculatedWeekday || weekday || '';
    const yearSuffix = deadlineYear ? ` ${deadlineYear}` : '';
    if (wd) {
      return `${wd}، ${day} ${month}${yearSuffix}`;
    }
    return `${day} ${month}${yearSuffix}`;
  }
  
  if (weekday) {
    const norm = normalizeWeekday(weekday);
    const idx = NORMALIZED_WEEKDAYS.indexOf(norm);
    if (idx !== -1 && weekDates[idx]) {
      const parsed = parsePersianDate(weekDates[idx]);
      if (parsed) {
        return `${weekday} (${parsed.day} ${parsed.month})`;
      }
    }
    return weekday;
  }
  
  return '';
};

const toEnglishDigits = (str: string): string => {
  return str
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632));
};

// Helper: check if a task completionDate falls within the current displayed planner week
const isDateInCurrentPlannerWeek = (completionDate: string | undefined, plannerData: PlannerData): boolean => {
  if (!completionDate || !completionDate.trim()) return false;
  const start = plannerData.weekStartDay || 1;
  const end = plannerData.weekEndDay || 7;
  const startMonth = plannerData.weekMonth || 'خرداد';
  const endMonth = plannerData.weekEndMonth || startMonth;
  const year = plannerData.weekYear || getTodayJalali().year;
  const startMIdx = JALALI_MONTHS.indexOf(startMonth);
  const endMIdx = JALALI_MONTHS.indexOf(endMonth);
  if (startMIdx === -1) return false;

  const daysInStartMonth = getDaysInJalaliMonth(startMonth, year);
  const absEnd = startMonth === endMonth ? end : (daysInStartMonth + end);

  for (let i = 0; i < 7; i++) {
    const clampedAbs = Math.min(start + i, absEnd);
    let dayNum: number;
    let mIdx: number;
    if (clampedAbs <= daysInStartMonth) {
      dayNum = clampedAbs;
      mIdx = startMIdx;
    } else {
      dayNum = clampedAbs - daysInStartMonth;
      mIdx = endMIdx !== -1 ? endMIdx : startMIdx;
    }
    const cd = toEnglishDigits(completionDate.trim());
    const jMonth = mIdx + 1;
    const jalaliPattern = new RegExp('^' + year + '[/-]0?' + jMonth + '[/-]0?' + dayNum + '$');
    if (jalaliPattern.test(cd)) return true;
    const targetMonthName = JALALI_MONTHS[mIdx];
    if (targetMonthName && cd.includes(targetMonthName)) {
      const leadingDay = cd.match(/^(\d{1,2})\s+/);
      const trailingDay = cd.match(/(\d{1,2})\s*$/);
      const matchedDay = leadingDay ? parseInt(leadingDay[1], 10) : trailingDay ? parseInt(trailingDay[1], 10) : NaN;
      if (matchedDay === dayNum) {
        const yearMatch = cd.match(/(\d{4})/);
        if (!yearMatch || parseInt(yearMatch[1], 10) === year) return true;
      }
    }
    try {
      const gDate = jalaliToGregorian(year, jMonth, dayNum);
      const gy = gDate.getUTCFullYear();
      const gm = String(gDate.getUTCMonth() + 1).padStart(2, '0');
      const gd = String(gDate.getUTCDate()).padStart(2, '0');
      if (cd.startsWith(`${gy}-${gm}-${gd}`)) return true;
    } catch (_) {}
  }
  return false;
};

const isTaskHiddenFromCurrentWeekUI = (t: { status?: string; completionDate?: string }, plannerData: PlannerData): boolean => {
  if (t.status !== 'completed' && t.status !== 'failed') return false;
  if (!t.completionDate) return false;
  return !isDateInCurrentPlannerWeek(t.completionDate, plannerData);
};

const parseJalaliDateStr = (str: string): { y: number; m: number; d: number } | null => {
  if (!str) return null;
  const clean = toEnglishDigits(str.trim());
  const match = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;
  return { y: parseInt(match[1], 10), m: parseInt(match[2], 10), d: parseInt(match[3], 10) };
};

const getConcreteDateForDayKey = (dayKey: string, plannerData: PlannerData): string => {
  const dayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const idx = dayKeys.indexOf(dayKey);
  if (idx === -1) return '';
  const start = plannerData.weekStartDay || 1;
  const end = plannerData.weekEndDay || 7;
  const startMonth = plannerData.weekMonth || 'خرداد';
  const endMonth = plannerData.weekEndMonth || startMonth;
  const year = plannerData.weekYear || getTodayJalali().year;
  const startMIdx = JALALI_MONTHS.indexOf(startMonth);
  const endMIdx = JALALI_MONTHS.indexOf(endMonth);
  if (startMIdx === -1) return '';
  const daysInStartMonth = getDaysInJalaliMonth(startMonth, year);
  const absEnd = startMonth === endMonth ? end : (daysInStartMonth + end);
  const clampedAbs = Math.min(start + idx, absEnd);
  let dayNum: number;
  let mIdx: number;
  if (clampedAbs <= daysInStartMonth) {
    dayNum = clampedAbs;
    mIdx = startMIdx;
  } else {
    dayNum = clampedAbs - daysInStartMonth;
    mIdx = endMIdx !== -1 ? endMIdx : startMIdx;
  }
  return `${year}/${String(mIdx + 1).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}`;
};

const isClassScheduledOnDate = (c: ClassSlot, dateISO: string, plannerData?: PlannerData): boolean => {
  const recurrence = c.recurrence || 'weekly';
  if (recurrence === 'weekly') return true;

  if (recurrence === 'manual') {
    if (!c.manualDates || !Array.isArray(c.manualDates) || c.manualDates.length === 0) return false;
    const cleanDate = toEnglishDigits(dateISO.trim()).replace(/[.-]/g, '/');
    return c.manualDates.some(d => toEnglishDigits(d.trim()).replace(/[.-]/g, '/') === cleanDate);
  }

  if (!c.anchorDate || !c.anchorDate.trim()) return true;
  const pDate = parseJalaliDateStr(dateISO);
  const pAnchor = parseJalaliDateStr(c.anchorDate);
  if (!pDate || !pAnchor) return true;

  if (recurrence === 'biweekly' || recurrence === 'quadweekly') {
    try {
      const gDate = jalaliToGregorian(pDate.y, pDate.m, pDate.d);
      const gAnchor = jalaliToGregorian(pAnchor.y, pAnchor.m, pAnchor.d);
      const diffDays = Math.round((gDate.getTime() - gAnchor.getTime()) / 86400000);
      const diffWeeks = Math.round(diffDays / 7);
      if (recurrence === 'biweekly') {
        return Math.abs(diffWeeks) % 2 === 0;
      }
      return Math.abs(diffWeeks) % 4 === 0;
    } catch (_) {
      return true;
    }
  }

  if (recurrence === 'monthly') {
    if (plannerData) {
      const start = plannerData.weekStartDay || 1;
      const end = plannerData.weekEndDay || 7;
      const startMonth = plannerData.weekMonth || 'خرداد';
      const endMonth = plannerData.weekEndMonth || startMonth;
      const year = plannerData.weekYear || getTodayJalali().year;
      const daysInStartMonth = getDaysInJalaliMonth(startMonth, year);
      const absEnd = startMonth === endMonth ? end : (daysInStartMonth + end);
      for (let i = 0; i < 7; i++) {
        const clampedAbs = Math.min(start + i, absEnd);
        const dayNum = clampedAbs <= daysInStartMonth ? clampedAbs : (clampedAbs - daysInStartMonth);
        if (dayNum === pAnchor.d) return true;
      }
      return false;
    }
    return Math.abs(pDate.d - pAnchor.d) <= 3;
  }

  return true;
};

const getClassOccurrenceState = (c: ClassSlot, dateISO: string, plannerData?: PlannerData): 'cancelled' | 'scheduled' | 'not-this-week' => {
  if (c.cancelledOccurrences && Array.isArray(c.cancelledOccurrences)) {
    const cleanDate = toEnglishDigits(dateISO.trim()).replace(/[.-]/g, '/');
    const isCancelled = c.cancelledOccurrences.some(
      co => co.date && toEnglishDigits(co.date.trim()).replace(/[.-]/g, '/') === cleanDate
    );
    if (isCancelled) return 'cancelled';
  }
  if (isClassScheduledOnDate(c, dateISO, plannerData)) {
    return 'scheduled';
  }
  return 'not-this-week';
};

const parseSingleTime = (str: string): number => {
  const match = str.trim().match(/^(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
};

const parseTimeRange = (timeStr: string | undefined): { start: number; end: number } => {
  if (!timeStr) return { start: 9999, end: 9999 };
  const normalized = toEnglishDigits(timeStr).toLowerCase();
  const parts = normalized.split(/تا|to|-|–/);
  if (parts.length < 2) {
    const start = parseSingleTime(normalized);
    return { start, end: start };
  }
  const start = parseSingleTime(parts[0]);
  const end = parseSingleTime(parts[1]);
  return { start, end };
};

const compareClassesByTime = (a: ClassSlot, b: ClassSlot): number => {
  const timeA = parseTimeRange(a.timeFa || a.timeEn);
  const timeB = parseTimeRange(b.timeFa || b.timeEn);
  if (timeA.start !== timeB.start) {
    return timeA.start - timeB.start;
  }
  return timeA.end - timeB.end;
};

// =====================================================================
// T164-R — Phase J: per-document (LWW) merge helpers
// Rule: server copy wins UNLESS the local copy carries an un-pushed change
// (i.e. its content hash differs from the sync mirror of the last push/sync).
// This preserves local edits that have not been uploaded yet, propagates
// remote deletions for clean copies, and never resurrects stale data.
// =====================================================================
const T164R_LWW_LIST_KEYS = [
  'categories', 'classesSchedule', 'coreTasks', 'secondaryTasks', 'secondaryTaskColumns',
  'reminders', 'detailsColumns', 'examColumns', 'todoList', 'weeklyEvents', 'dailyThoughts',
  'postponedEvents', 'timebox'
];

const t164rItemId = (it: any): string | undefined => {
  if (!it || typeof it !== 'object') return undefined;
  const id = it.id ?? it.goal_id;
  return id !== undefined && id !== null ? String(id) : undefined;
};

const t164rMergeList = (userId: string, colName: string, localList: any, serverList: any): any[] => {
  const mirror = getOrCreateMirror(userId);
  const colMirror = mirror.collections[colName];
  const lArr = Array.isArray(localList) ? localList : [];
  const sArr = Array.isArray(serverList) ? serverList : [];
  const lMap = new Map<string, any>();
  for (const it of lArr) { const id = t164rItemId(it); if (id) lMap.set(id, it); }
  const sMap = new Map<string, any>();
  for (const it of sArr) { const id = t164rItemId(it); if (id) sMap.set(id, it); }
  const isDirty = (item: any, id: string): boolean => {
    const cached = colMirror ? colMirror.get(id) : undefined;
    return cached === undefined || hashContent(deepStripUndefined(item)) !== cached;
  };
  const out: any[] = [];
  for (const it of sArr) {
    const id = t164rItemId(it);
    if (!id) { out.push(it); continue; }
    const loc = lMap.get(id);
    out.push(loc && isDirty(loc, id) ? loc : it);
  }
  for (const it of lArr) {
    const id = t164rItemId(it);
    if (!id || sMap.has(id)) continue;
    if (isDirty(it, id)) out.push(it);
  }
  return out;
};

const t164rMergeDailyTasks = (userId: string, localMap: any, serverMap: any): Record<string, any[]> => {
  const mirror = getOrCreateMirror(userId);
  const out: Record<string, any[]> = { saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] };
  const lObj = (localMap && typeof localMap === 'object') ? localMap : {};
  const sObj = (serverMap && typeof serverMap === 'object') ? serverMap : {};
  const keys = new Set<string>([...Object.keys(lObj), ...Object.keys(sObj)]);
  for (const dayKey of keys) {
    const locArr = Array.isArray(lObj[dayKey]) ? lObj[dayKey] : undefined;
    const srvArr = Array.isArray(sObj[dayKey]) ? sObj[dayKey] : undefined;
    const cached = mirror.dailyTasks.get(dayKey);
    const dirty = !!locArr && (cached === undefined || hashContent(deepStripUndefined(locArr)) !== cached);
    if (srvArr) out[dayKey] = dirty ? locArr! : srvArr;
    else if (locArr && dirty) out[dayKey] = locArr;
    // else: remote deletion of the whole day propagates (day stays [])
  }
  return out;
};

const t164rMergeGoals = (userId: string, localGoals: any, serverGoals: any): any[] => {
  const mirror = getOrCreateMirror(userId);
  const lArr = Array.isArray(localGoals) ? localGoals : [];
  const sArr = Array.isArray(serverGoals) ? serverGoals : [];
  const lMap = new Map<string, any>();
  for (const g of lArr) { if (g && g.goal_id) lMap.set(String(g.goal_id), g); }
  const sMap = new Map<string, any>();
  for (const g of sArr) { if (g && g.goal_id) sMap.set(String(g.goal_id), g); }
  const topDirty = (g: any, gid: string): boolean => {
    const colMirror = mirror.collections['goals'];
    const cached = colMirror ? colMirror.get(gid) : undefined;
    if (cached === undefined) return true;
    const { phases: _ph, ...top } = g;
    return hashContent(deepStripUndefined(top)) !== cached;
  };
  const phaseDirty = (gid: string, p: any): boolean => {
    const pm = mirror.goalPhases.get(gid);
    if (!pm) return true;
    const k = String(p.phase_number);
    const cached = pm.get(k);
    return cached === undefined || hashContent(deepStripUndefined(sanitizePhaseForStorage(p))) !== cached;
  };
  const out: any[] = [];
  for (const sg of sArr) {
    const gid = String(sg.goal_id);
    const lg = lMap.get(gid);
    if (!lg) { out.push(sg); continue; }
    const lTopDirty = topDirty(lg, gid);
    const lpMap = new Map<string, any>();
    for (const p of (Array.isArray(lg.phases) ? lg.phases : [])) { if (p) lpMap.set(String(p.phase_number), p); }
    const spMap = new Map<string, any>();
    for (const p of (Array.isArray(sg.phases) ? sg.phases : [])) { if (p) spMap.set(String(p.phase_number), p); }
    const phases: any[] = [];
    for (const p of (Array.isArray(sg.phases) ? sg.phases : [])) {
      const k = String(p.phase_number);
      const lp = lpMap.get(k);
      phases.push(lp && phaseDirty(gid, lp) ? lp : p);
    }
    for (const p of (Array.isArray(lg.phases) ? lg.phases : [])) {
      const k = String(p.phase_number);
      if (spMap.has(k)) continue;
      if (phaseDirty(gid, p)) phases.push(p);
    }
    out.push({ ...(lTopDirty ? lg : sg), phases });
  }
  for (const lg of lArr) {
    if (!lg || !lg.goal_id) continue;
    const gid = String(lg.goal_id);
    if (sMap.has(gid)) continue;
    const lDirty = topDirty(lg, gid) || (Array.isArray(lg.phases) ? lg.phases : []).some((p: any) => p && phaseDirty(gid, p));
    if (lDirty) out.push(lg);
  }
  return out;
};

export default function App() {
  // --- States ---
  const [editMode, setEditMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<number>(1); // 1: Weekly, 2: Details, 3: Secondary, 4: Habits, 5: Notes & To-Do
  const [showSettingsPage, setShowSettingsPage] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [detailsSortOrder, setDetailsSortOrder] = useState<'asc' | 'desc'>('asc');
  const [examSortOrder, setExamSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedArchiveWeekId, setSelectedArchiveWeekId] = useState<string | null>(null);

  const [newExamItem, setNewExamItem] = useState<{
    columnId: string;
    text: string;
    date: string;
    type: string;
    description: string;
    emailReminder: boolean;
    reminderOffset: ReminderOffset;
  }>({
    columnId: '',
    text: '',
    date: '',
    type: 'امتحان',
    description: '',
    emailReminder: true,
    reminderOffset: '1day',
  });

  const [newEvent, setNewEvent] = useState({
    title: '',
    type: 'کلاس',
    action: 'لغو شده',
    date: '',
    newDate: '',
    description: '',
    classSlotId: ''
  });

  const handleAddPostponedEvent = () => {
    if (!newEvent.title.trim()) {
      showToast('لطفاً عنوان را وارد کنید');
      return;
    }
    if (!newEvent.date.trim()) {
      showToast('لطفاً تاریخ را وارد کنید');
      return;
    }
    
    const created: PostponedEvent = {
      id: `pe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: newEvent.title.trim(),
      type: newEvent.type,
      action: newEvent.action,
      date: newEvent.date.trim(),
      ...(newEvent.action === 'به تعویق افتاده' && newEvent.newDate.trim() ? { newDate: newEvent.newDate.trim() } : {}),
      ...(newEvent.description.trim() ? { description: newEvent.description.trim() } : {})
    };
    
    // U3: If class cancellation, append or update { date, note } in cancelledOccurrences of the class
    if (newEvent.type === 'کلاس' && newEvent.classSlotId) {
      const targetDate = newEvent.date.trim();
      setData(prev => {
        const updatedClasses = (prev.classesSchedule || []).map(cs => {
          if (cs.id === newEvent.classSlotId) {
            const existingOccs = cs.cancelledOccurrences || [];
            const cleanTarget = toEnglishDigits(targetDate).replace(/[.-]/g, '/');
            const foundIdx = existingOccs.findIndex(
              co => co.date && toEnglishDigits(co.date).replace(/[.-]/g, '/') === cleanTarget
            );
            const noteTrim = newEvent.description.trim();
            let nextOccs: { date: string; note?: string }[];
            if (foundIdx !== -1) {
              nextOccs = existingOccs.map((co, idx) => {
                if (idx !== foundIdx) return co;
                const nextCo = { ...co };
                if (noteTrim) {
                  nextCo.note = noteTrim;
                } else {
                  delete nextCo.note;
                }
                return nextCo;
              });
            } else {
              nextOccs = noteTrim
                ? [...existingOccs, { date: targetDate, note: noteTrim }]
                : [...existingOccs, { date: targetDate }];
            }
            return {
              ...cs,
              cancelledOccurrences: nextOccs
            };
          }
          return cs;
        });
        return {
          ...prev,
          classesSchedule: updatedClasses,
          postponedEvents: [...(prev.postponedEvents || []), created]
        };
      });
    } else {
      setData(prev => ({
        ...prev,
        postponedEvents: [...(prev.postponedEvents || []), created]
      }));
    }
    
    setNewEvent({
      title: '',
      type: 'کلاس',
      action: 'لغو شده',
      date: '',
      newDate: '',
      description: '',
      classSlotId: ''
    });
    
    showToast('مورد با موفقیت اضافه شد');
  };

  const handleDeletePostponedEvent = (id: string) => {
    setData(prev => ({
      ...prev,
      postponedEvents: (prev.postponedEvents || []).filter(item => item.id !== id)
    }));
    showToast('مورد حذف شد');
  };
  
  const [data, setDataRaw] = useState<PlannerData>(() => {
    const saved = localStorage.getItem('planner_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Backward compatibility migration & ID uniqueness fix:
        if (parsed && Array.isArray(parsed.detailsColumns)) {
          const seenDeadlineIds = new Set<string>();
          parsed.detailsColumns = parsed.detailsColumns.map((col: any, colIdx: number) => {
            if (Array.isArray(col.items)) {
              col.items = col.items.map((item: any, idx: number) => {
                if (typeof item === 'string') {
                  const dateMatch = item.match(/\(([^)]+)\)/);
                  const date = dateMatch ? dateMatch[1] : undefined;
                  const text = item.replace(/\s*\([^)]+\)/, '').trim();
                  const newId = `mig_${col.id || colIdx}_${idx}_${Math.random().toString(36).substring(2, 8)}`;
                  seenDeadlineIds.add(newId);
                  return { id: newId, text, date };
                }
                if (item && typeof item === 'object') {
                  let uniqueId = item.id;
                  if (!uniqueId || seenDeadlineIds.has(uniqueId)) {
                    uniqueId = `dl_${col.id || colIdx}_${uniqueId || 'item'}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
                  }
                  seenDeadlineIds.add(uniqueId);
                  return { ...item, id: uniqueId };
                }
                return item;
              });
            }
            return col;
          });
        }
        if (parsed && !parsed.coreTasks) {
          parsed.coreTasks = INITIAL_PLANNER_DATA.coreTasks;
        }
        if (parsed && !parsed.coreTasksTitle) {
          parsed.coreTasksTitle = INITIAL_PLANNER_DATA.coreTasksTitle;
        }
        if (parsed && Array.isArray(parsed.categories)) {
          parsed.categories = parsed.categories.map((cat: any) => {
            if (cat.id === 'language') {
              return { ...cat, color: 'bg-emerald-100 border-emerald-350 text-emerald-950 hover:bg-emerald-200/80' };
            }
            if (cat.id === 'done') {
              return { ...cat, color: 'bg-green-100 border-green-400 text-green-950 hover:bg-green-200' };
            }
            return cat;
          });
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse saved planner data', e);
      }
    }
    return INITIAL_PLANNER_DATA;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('planner_user');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      return (parsed && typeof parsed === 'object' && parsed.id) ? parsed : null;
    } catch (e) {
      localStorage.removeItem('planner_user');
      return null;
    }
  });

  const [lang, setLang] = useState<'fa' | 'en'>(() => {
    return (localStorage.getItem('planner_lang') as 'fa' | 'en') || 'fa';
  });

  const [authFailureStatus, setAuthFailureStatus] = useState<'401' | '403' | null>(null);
  const [pendingSyncData, setPendingSyncData] = useState<PlannerData | null>(null);
  const [isCriticalAuthFailure, setIsCriticalAuthFailure] = useState<boolean>(false);
  const [isDayInspectorOpen, setIsDayInspectorOpen] = useState(false);

  // Load and apply theme and initialize real-time network clock on startup
  useEffect(() => {
    initNetworkTime();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Core & Secondary Task deadlines sync to Tab 2 (Details & Deadlines)
  const syncAllTasksToDetails = useCallback((prev: PlannerData): PlannerData => {
    // Create a copy of detailsColumns
    const updatedColumns = (prev.detailsColumns || []).map((col) => {
      return { ...col, items: [...(col.items || [])] };
    });

    const year = prev.weekYear || getTodayJalali().year;

    // Set of active synced item IDs
    const activeSyncedIds = new Set<string>();

    // Helper to get or create target column for a category
    const getTargetColumn = (categoryId?: string) => {
      let targetColId = 'dl_none';
      let titleFa = 'بدون دسته';
      let titleEn = 'Uncategorized';

      if (categoryId) {
        const cat = (prev.categories || []).find(c => c.id === categoryId);
        if (cat) {
          targetColId = `dl_cat_${categoryId}`;
          titleFa = `ددلاین‌های ${cat.nameFa}`;
          titleEn = `Deadlines: ${cat.nameEn || cat.nameFa}`;
        }
      }

      let col = updatedColumns.find(c => c.id === targetColId);
      if (!col) {
        col = {
          id: targetColId,
          titleFa,
          titleEn,
          items: []
        };
        updatedColumns.push(col);
      }
      return col;
    };

    // Helper to get formatted date string for any task deadline
    const getFormattedDeadlineDate = (deadline: any): string | undefined => {
      if (!deadline) return undefined;
      const { day, month, weekday } = deadline;
      const effectiveYear = deadline.year || year;
      
      // If we have day and month
      if (day && month) {
        const monthNum = MONTHS_MAP[month] || '01';
        return `${effectiveYear}/${monthNum}/${String(day).padStart(2, '0')}`;
      }
      
      // If we only have weekday
      if (weekday) {
        const norm = normalizeWeekday(weekday);
        const idx = NORMALIZED_WEEKDAYS.indexOf(norm);
        if (idx !== -1) {
          const weekDates = getWeekDatesForData(prev);
          const dateStr = weekDates[idx];
          const parsed = parsePersianDate(dateStr);
          if (parsed) {
            const monthNum = MONTHS_MAP[parsed.month] || '01';
            return `${effectiveYear}/${monthNum}/${String(parsed.day).padStart(2, '0')}`;
          }
        }
      }
      return undefined;
    };

    // 1. Process Core Tasks
    (prev.coreTasks || []).forEach((task) => {
      const hasDeadline = task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday);
      if (hasDeadline) {
        const synId = `task_core_${task.id}`;
        activeSyncedIds.add(synId);

        const targetCol = getTargetColumn(task.categoryId);
        const formattedDate = getFormattedDeadlineDate(task.deadline);
        const descPart = task.description ? ` - ${task.description}` : '';
        const synText = `${task.title}${descPart}`;
        const syncedDeadline = task.deadline ? { ...task.deadline, year: task.deadline.year || year } : undefined;

        // Remove from any other column if it previously lived there
        updatedColumns.forEach(c => {
          if (c !== targetCol) {
            c.items = c.items.filter(item => item.id !== synId && item.id !== `task_${task.id}`);
          }
        });

        const existingIdx = targetCol.items.findIndex(item => item.id === synId || item.id === `task_${task.id}`);
        if (existingIdx >= 0) {
          targetCol.items[existingIdx] = {
            ...targetCol.items[existingIdx],
            id: synId,
            text: synText,
            date: formattedDate || targetCol.items[existingIdx].date,
            deadline: syncedDeadline
          };
        } else {
          targetCol.items.push({
            id: synId,
            text: synText,
            date: formattedDate,
            deadline: syncedDeadline
          });
        }
      }
    });

    // 2. Process Secondary Tasks
    (prev.secondaryTasks || []).forEach((task) => {
      const hasDeadline = task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday);
      if (hasDeadline) {
        const synId = `task_sec_${task.id}`;
        activeSyncedIds.add(synId);

        const targetCol = getTargetColumn(task.categoryId);
        const formattedDate = getFormattedDeadlineDate(task.deadline);
        const descPart = task.description ? ` - ${task.description}` : '';
        const synText = `${task.textFa}${descPart}`;
        const syncedDeadline = task.deadline ? { ...task.deadline, year: task.deadline.year || year } : undefined;

        // Remove from any other column if it previously lived there
        updatedColumns.forEach(c => {
          if (c !== targetCol) {
            c.items = c.items.filter(item => item.id !== synId && item.id !== `task_${task.id}`);
          }
        });

        const existingIdx = targetCol.items.findIndex(item => item.id === synId || item.id === `task_${task.id}`);
        if (existingIdx >= 0) {
          targetCol.items[existingIdx] = {
            ...targetCol.items[existingIdx],
            id: synId,
            text: synText,
            date: formattedDate || targetCol.items[existingIdx].date,
            deadline: syncedDeadline
          };
        } else {
          targetCol.items.push({
            id: synId,
            text: synText,
            date: formattedDate,
            deadline: syncedDeadline
          });
        }
      }
    });

    // 3. Remove any synced details items whose task deadline was cleared or task was deleted
    updatedColumns.forEach((col) => {
      col.items = col.items.filter((item) => {
        if (item.id && (item.id.startsWith('task_') || item.id.startsWith('task_core_') || item.id.startsWith('task_sec_'))) {
          const legacyIdMatched = item.id.startsWith('task_') && !item.id.startsWith('task_core_') && !item.id.startsWith('task_sec_');
          if (legacyIdMatched) {
            const baseId = item.id.replace('task_', '');
            const isCoreActive = activeSyncedIds.has(`task_core_${baseId}`);
            const isSecActive = activeSyncedIds.has(`task_sec_${baseId}`);
            return isCoreActive || isSecActive;
          }
          return activeSyncedIds.has(item.id);
        }
        return true;
      });
    });

    // 4. Remove empty auto-generated deadline columns
    const finalColumns = updatedColumns.filter(c => 
      !(c.id.startsWith('dl_cat_') || c.id === 'dl_none') || c.items.length > 0
    );

    return {
      ...prev,
      detailsColumns: finalColumns
    };
  }, []);

  // Success alert toast message & once-per-session offline notification (H3 & Point 4)
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const hasNotifiedOfflineThisSessionRef = useRef<boolean>(false);
  const resetGuardUntilRef = useRef<number>(0);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);
  const hasRepairedWeekRangeRef = useRef<boolean>(false);
  const lastAutoSyncRunAtRef = useRef<number>(0);
  const lastCalendarSyncFpRef = useRef<string>('');
  const lastCalendarErrorToastAtRef = useRef<number>(0);
  const calendarErrorCountRef = useRef<number>(0);

  const showToast = useCallback((message: string, type?: 'success' | 'error') => {
    setSuccessMessage(message);
    const isError = type === 'error' ||
                    message.includes('خطا') ||
                    message.includes('اشتباه') ||
                    message.includes('ناموفق') ||
                    message.includes('fail') ||
                    message.includes('error') ||
                    message.includes('⚠️');
    setToastType(isError ? 'error' : 'success');
    setTimeout(() => setSuccessMessage(''), 3000);
  }, []);

  // 6-state sync indicator state ('synced' | 'syncing' | 'offline' | 'saving' | 'saved' | 'error')
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'saving' | 'saved' | 'error'>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
    try {
      const raw = localStorage.getItem('planner_pending_sync');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.payload && Object.keys(parsed.payload).length > 0) return 'syncing';
      }
    } catch (_) {}
    return 'synced';
  });

  // Global custom toast listener for decoupled components and auth flows
  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type?: 'success' | 'error' }>;
      if (customEvent.detail?.message) {
        showToast(customEvent.detail.message, customEvent.detail.type);
      }
    };
    window.addEventListener('app-toast', handleCustomToast);
    return () => window.removeEventListener('app-toast', handleCustomToast);
  }, [showToast]);

  const notifyOfflineSyncThrottled = useCallback(() => {
    if (!hasNotifiedOfflineThisSessionRef.current) {
      hasNotifiedOfflineThisSessionRef.current = true;
      showToast('آفلاین هستید؛ تغییرها به صورت محلی ذخیره و بعداً همگام می‌شوند', 'success');
    }
  }, [showToast]);

  const handleSyncData = async (user: User, customData?: PlannerData) => {
    try {
      setSyncStatus('saving');
      const dataToSync = customData || data;
      try {
        localStorage.setItem('planner_data', JSON.stringify(dataToSync));
        if (user && user.id) {
          localStorage.setItem('planner_user', JSON.stringify({
            id: user.id,
            email: user.email || '',
            username: user.username || ''
          }));
        }
      } catch (lsErr) {
        console.warn('LocalStorage error:', lsErr);
      }

      if (user && user.id) {
        try {
          // Save planner data into Firestore subcollections under /planners/{userId}
          await savePlannerSubcollections(user.id, dataToSync);
        } catch (syncErr) {
          console.warn('[Planner Sync Warning] save failed, re-queuing:', syncErr);
          queuePendingSync(user.id, dataToSync);
          setSyncStatus('error');
          showToast('خطا در ذخیره پایگاه داده؛ تغییرات در صف همگام‌سازی ذخیره شد', 'error');
        }
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus('offline');
        notifyOfflineSyncThrottled();
        return;
      }

      if (auth.currentUser) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        let activeToken = user.token;
        if (auth.currentUser) {
          try {
            activeToken = await getIdToken(auth.currentUser);
          } catch (tokenErr) {
            console.warn("Could not dynamically refresh token:", tokenErr);
          }
        }
        if (activeToken) {
          headers['Authorization'] = `Bearer ${activeToken}`;
        }
        const res = await timeSyncFetch('/api/planner/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: dataToSync
          })
        });
        if (!res.ok) {
          const errData = await safeParseJson(res);
          if (res.status === 401 || res.status === 403) {
            setAuthFailureStatus(res.status === 401 ? '401' : '403');
            setPendingSyncData(dataToSync);
          }
          throw new Error(errData.error || 'Sync failed');
        }
      }
      const hasPending = !!localStorage.getItem('planner_pending_sync');
      setSyncStatus(hasPending ? 'syncing' : 'saved');
      setTimeout(() => {
        setSyncStatus(prev => prev === 'saved' ? 'synced' : prev);
      }, 2000);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (
        isOffline ||
        errMsg.includes('offline') ||
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('network') ||
        errMsg.includes('Failed to execute')
      ) {
        setSyncStatus('offline');
        console.warn('Network offline during cloud sync, changes safely cached and queued.');
        notifyOfflineSyncThrottled();
        return;
      }
      console.error('Failed to sync data with cloud:', err);
      setSyncStatus('error');
      showToast('خطا در همگام‌سازی ابری؛ داده‌ها محلی نگهداری می‌شوند', 'error');
      throw err;
    }
  };

  const handleLoadData = async (user: User): Promise<PlannerData | null> => {
    try {
      const headers: Record<string, string> = {};
      let activeToken = user.token;
      if (auth.currentUser) {
        try {
          activeToken = await getIdToken(auth.currentUser);
        } catch (tokenErr) {
          console.warn("Could not dynamically refresh token:", tokenErr);
        }
      }
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }
      const res = await timeSyncFetch(`/api/planner/load`, {
        headers
      });
      if (!res.ok) {
        const errData = await safeParseJson(res);
        if (res.status === 401 || res.status === 403) {
          setAuthFailureStatus(res.status === 401 ? '401' : '403');
        }
        throw new Error(errData.error || 'Load failed');
      }
      const resData = await safeParseJson(res);
      return resData.data;
    } catch (err) {
      console.error('Failed to load cloud data:', err);
      return null;
    }
  };

  const [firebaseUserUid, setFirebaseUserUid] = useState<string | null>(() => auth.currentUser?.uid || null);
  const isRemoteUpdateRef = useRef<boolean>(false);
  // T164-R Phase B: blocks all cloud pushes until the first FULL remote snapshot has been
  // merged (mirror = server truth). Prevents the stale-local-state boot race from
  // overwriting newer server data when the first snapshot is slower than the 2.5s debounce.
  const firstRemoteSyncDoneRef = useRef<boolean>(false);
  const lastSavedDataJsonRef = useRef<string>('');
  const hasMigratedRef = useRef<Record<string, boolean>>({});
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Global Firebase Authentication Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setFirebaseUserUid(firebaseUser.uid);
        // T164-R Phase B: the offline queue is NO LONGER flushed at auth time.
        // It is deferred until the first full remote snapshot (onReady), so a stale
        // queued payload can never be diffed against an empty mirror.
        try {
          const token = await getIdToken(firebaseUser);
          const storedProfileStr = localStorage.getItem('user_profile') || localStorage.getItem('planner_user');
          let username = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
          if (storedProfileStr) {
            try {
              const p = JSON.parse(storedProfileStr);
              if (p.username) username = p.username;
            } catch (e) {}
          }
          const userObj: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            username,
            token
          };
          setCurrentUser(userObj);
          try {
            localStorage.setItem('planner_user', JSON.stringify({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              username
            }));
          } catch (lsErr) {
            console.warn('LocalStorage write planner_user error:', lsErr);
          }
        } catch (err) {
          console.error("Auth state listener error:", err);
        }
      } else {
        setFirebaseUserUid(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-save & sync effect on data change
  useEffect(() => {
    try {
      localStorage.setItem('planner_data', JSON.stringify(data));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }

    if (!currentUser || !currentUser.id) return;

    // T164-R Phase B: no cloud push until the first full remote snapshot has been merged.
    // (localStorage persistence above still happens, so nothing is lost locally.)
    if (!firstRemoteSyncDoneRef.current) return;

    // Guard 1: Skip auto-sync if change came from Firestore remote listener
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      lastSavedDataJsonRef.current = JSON.stringify(data);
      return;
    }

    // Guard 2: Skip auto-sync if data hasn't actually changed from last saved state
    const currentDataJson = JSON.stringify(data);
    if (lastSavedDataJsonRef.current === currentDataJson) {
      return;
    }

    const timer = setTimeout(() => {
      lastSavedDataJsonRef.current = currentDataJson;
      handleSyncData(currentUser, data).catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [data, currentUser?.id]);

  // Flush-on-close: persist unsynced edits into the offline queue synchronously
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        const currentData = dataRef.current;
        const currentJson = JSON.stringify(currentData);
        localStorage.setItem('planner_data', currentJson);
        if (currentUser?.id) {
          if (lastSavedDataJsonRef.current !== currentJson) {
            queuePendingSync(currentUser.id, currentData);
          }
          flushPendingSyncQueue(currentUser.id).catch(() => {});
        }
      } catch (_) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser?.id]);

  // Periodic pending-queue retry
  useEffect(() => {
    if (!currentUser?.id) return;
    const timer = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      flushPendingSyncQueue(currentUser.id).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [currentUser?.id]);

  // Network Reconnection & Offline Listener (H4 & H5 & Point 4)
  useEffect(() => {
    const handleOnline = async () => {
      hasNotifiedOfflineThisSessionRef.current = false;
      // T164-R Phase B: wait for first full remote sync before reconnect-sync
      if (!firstRemoteSyncDoneRef.current) return;
      if (currentUser && currentUser.id) {
        try {
          const flushed = await flushPendingSyncQueue(currentUser.id);
          // H5: Conflict resolution on reconnect:
          // If local data changed while offline (dataRef.current != lastSavedDataJsonRef.current)
          // -> local wins (upload local state to server & subcollections).
          // Otherwise, Firestore listener will deliver remote updates.
          const hasLocalEdits = lastSavedDataJsonRef.current !== JSON.stringify(dataRef.current);
          if (hasLocalEdits) {
            await handleSyncData(currentUser, dataRef.current);
          }
          if (flushed || hasLocalEdits) {
            showToast('همگام‌سازی پس از اتصال انجام شد', 'success');
          }
          const hasPending = !!localStorage.getItem('planner_pending_sync');
          setSyncStatus(hasPending ? 'syncing' : 'synced');
        } catch (err) {
          console.warn('[Reconnect Sync Warning]:', err);
          setSyncStatus('offline');
        }
      } else {
        const hasPending = !!localStorage.getItem('planner_pending_sync');
        setSyncStatus(hasPending ? 'syncing' : 'synced');
      }
    };

    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser?.id, showToast]);

  // Periodic Sync Retry with Exponential Backoff + Window Focus Flush (Request #3)
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;

    let retryDelay = 15000; // Start at 15s
    let timeoutId: any = null;
    let isCancelled = false;

    const attemptFlush = async () => {
      if (isCancelled) return;
      // T164-R2: Guard 1 — no cloud push before first FULL server snapshot
      if (!firstRemoteSyncDoneRef.current) {
        timeoutId = setTimeout(attemptFlush, retryDelay);
        return;
      }
      try {
        const flushed = await flushPendingSyncQueue(userId);
        const hasLocalEdits = lastSavedDataJsonRef.current !== JSON.stringify(dataRef.current);
        if (hasLocalEdits && currentUser) {
          setSyncStatus('syncing');
          await handleSyncData(currentUser, dataRef.current);
        }
        if (flushed) {
          showToast('همگام‌سازی پس از اتصال انجام شد', 'success');
        }
        if (flushed || hasLocalEdits) {
          const hasPending = !!localStorage.getItem('planner_pending_sync');
          setSyncStatus(hasPending ? 'syncing' : 'synced');
          retryDelay = 15000;
        } else {
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            const hasPending = !!localStorage.getItem('planner_pending_sync');
            setSyncStatus(hasPending ? 'syncing' : 'synced');
          }
          retryDelay = 15000;
        }
      } catch (err) {
        console.warn('[Periodic Sync Retry]:', err);
        // Exponential backoff capped at 60s
        retryDelay = Math.min(retryDelay * 2, 60000);
      } finally {
        if (!isCancelled) {
          timeoutId = setTimeout(attemptFlush, retryDelay);
        }
      }
    };

    const handleFocus = async () => {
      retryDelay = 15000;
      if (timeoutId) clearTimeout(timeoutId);
      await attemptFlush();
    };

    window.addEventListener('focus', handleFocus);
    timeoutId = setTimeout(attemptFlush, retryDelay);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser?.id, showToast]);

  // Real-time Firestore document & subcollections listener
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    if (!firebaseUserUid || firebaseUserUid !== userId) {
      return;
    }

    // Trigger one-time idempotent subcollection migration, cleanup of leaked parent fields & monthly snapshot pruning
    if (!hasMigratedRef.current[userId]) {
      const runMigrationAndPrune = (targetUid: string) => {
        if (auth.currentUser?.uid === targetUid) {
          hasMigratedRef.current[targetUid] = true;
          migratePlannerDataToSubcollections(targetUid).catch(() => {});
          cleanupLeakedParentFields(targetUid).catch(() => {});
          pruneOldSnapshots(targetUid).catch(() => {});
        } else {
          setTimeout(() => {
            if (auth.currentUser?.uid === targetUid && !hasMigratedRef.current[targetUid]) {
              hasMigratedRef.current[targetUid] = true;
              migratePlannerDataToSubcollections(targetUid).catch(() => {});
              cleanupLeakedParentFields(targetUid).catch(() => {});
              pruneOldSnapshots(targetUid).catch(() => {});
            }
          }, 3000);
        }
      };
      runMigrationAndPrune(userId);
    }

    let isInitial = true;
    // T164-R Phase B: fallback — if the readiness signal never arrives (e.g. a listener
    // exhausted retries), open the push gate after 30s so the app is not permanently muted.
    const gateFallbackTimer = setTimeout(() => {
      if (!firstRemoteSyncDoneRef.current) {
        firstRemoteSyncDoneRef.current = true;
        console.warn('[T164-R] Push-gate fallback opened after 30s without full readiness.');
      }
    }, 30000);
    const unsub = subscribeToPlannerSubcollections(userId, (combinedData) => {
      // W1: Check reset guard to avoid old server echo overwriting resetData
      const guardUntil = Math.max(resetGuardUntilRef.current || 0, Number(localStorage.getItem('reset_guard_until') || 0));
      if (Date.now() < guardUntil) {
        console.log('[ResetGuard] Skipping incoming cloud data during active reset guard window');
        return;
      }

      if (isInitial) {
        isInitial = false;
        // Helper: Check if week range is invalid or ended before today in Tehran (F-1)
        const isWeekRangeEndedOrInvalid = (d: PlannerData) => {
          if (!isWeekRangeValid(d)) return true;
          const endMName = d.weekEndMonth || d.weekMonth || '';
          const endMIdx = JALALI_MONTHS.indexOf(endMName);
          if (endMIdx === -1) return true;
          const ey = d.weekEndYear || d.weekYear || getTodayJalali(getNow()).year;
          const ed = d.weekEndDay || 0;
          const today = getTodayJalali(getNow());
          return (
            ey < today.year ||
            (ey === today.year && endMIdx < today.monthIdx) ||
            (ey === today.year && endMIdx === today.monthIdx && ed < today.day)
          );
        };

        // Initial merge: compare updatedAt timestamps to protect newer local edits
        setDataRaw((prev) => {
          const localTime = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
          const remoteTime = (combinedData as any).updatedAt ? new Date((combinedData as any).updatedAt).getTime() : 0;

          // If local data is newer than incoming remote data, keep local and additively merge missing fields only
          if (localTime > remoteTime && remoteTime > 0) {
            console.log('[T164-R] Local data is newer than cloud boot data. Preserving local edits.');
            const merged = { ...prev };
            for (const [key, val] of Object.entries(combinedData)) {
              if (val !== undefined && ((merged as any)[key] === undefined || (merged as any)[key] === null)) {
                (merged as any)[key] = val;
              }
            }
            if (isWeekRangeEndedOrInvalid(merged) && !hasRepairedWeekRangeRef.current) {
              hasRepairedWeekRangeRef.current = true;
              if ((merged.notes || '').trim() !== '') {
                merged.notesArchive = upsertNotesArchiveEntry(merged.notesArchive || [], buildNotesArchiveEntry(merged.weekYear || getTodayJalali(getNow()).year, merged.weekMonth || '', merged.weekStartDay || 1, merged.weekEndYear || merged.weekYear || getTodayJalali(getNow()).year, merged.weekEndMonth || merged.weekMonth || '', merged.weekEndDay || 7, merged.notes));
              }
              const curWeek = getCurrentJalaliWeekRange(getNow());
              merged.weekYear = curWeek.startYear;
              merged.weekMonth = curWeek.startMonth;
              merged.weekStartDay = curWeek.startDay;
              merged.weekEndYear = curWeek.endYear;
              merged.weekEndMonth = curWeek.endMonth;
              merged.weekEndDay = curWeek.endDay;
              merged.month = curWeek.month;
              showToast('بازهٔ هفته به هفتهٔ جاری اصلاح شد', 'info');
            }
            return merged;
          }

          const merged = { ...prev };
          for (const [key, val] of Object.entries(combinedData)) {
            if (val !== undefined) (merged as any)[key] = val;
          }
          if (isWeekRangeEndedOrInvalid(merged) && !hasRepairedWeekRangeRef.current) {
            hasRepairedWeekRangeRef.current = true;
            if ((merged.notes || '').trim() !== '') {
              merged.notesArchive = upsertNotesArchiveEntry(merged.notesArchive || [], buildNotesArchiveEntry(merged.weekYear || getTodayJalali(getNow()).year, merged.weekMonth || '', merged.weekStartDay || 1, merged.weekEndYear || merged.weekYear || getTodayJalali(getNow()).year, merged.weekEndMonth || merged.weekMonth || '', merged.weekEndDay || 7, merged.notes));
            }
            const curWeek = getCurrentJalaliWeekRange(getNow());
            merged.weekYear = curWeek.startYear;
            merged.weekMonth = curWeek.startMonth;
            merged.weekStartDay = curWeek.startDay;
            merged.weekEndYear = curWeek.endYear;
            merged.weekEndMonth = curWeek.endMonth;
            merged.weekEndDay = curWeek.endDay;
            merged.month = curWeek.month;
            showToast('بازهٔ هفته به هفتهٔ جاری اصلاح شد', 'info');
          }
          const updated = syncAllTasksToDetails(merged);
          isRemoteUpdateRef.current = true;
          lastSavedDataJsonRef.current = JSON.stringify(updated);
          try {
            localStorage.setItem('planner_data', JSON.stringify(updated));
            if (currentUser) {
              localStorage.setItem('planner_user', JSON.stringify({
                id: currentUser.id,
                email: currentUser.email || '',
                username: currentUser.username || ''
              }));
            }
          } catch (lsErr) {
            console.warn('LocalStorage write error during initial subcollection sync:', lsErr);
          }
          return updated;
        });
      } else {
        // T164-R Phase J: per-document LWW merge — server wins unless the local copy
        // carries an un-pushed change (differs from the sync mirror).
        setDataRaw((prev) => {
          const merged: any = { ...prev };
          let keptLocalDirty = false;
          for (const [key, val] of Object.entries(combinedData)) {
            if (val === undefined) continue;
            if (key === 'dailyTasks') {
              const m = t164rMergeDailyTasks(userId, (prev as any).dailyTasks, val);
              if (JSON.stringify(m) !== JSON.stringify(val)) keptLocalDirty = true;
              merged.dailyTasks = m;
            } else if (key === 'goals') {
              const m = t164rMergeGoals(userId, (prev as any).goals, val);
              if (JSON.stringify(m) !== JSON.stringify(val)) keptLocalDirty = true;
              merged.goals = m;
            } else if (T164R_LWW_LIST_KEYS.includes(key)) {
              const m = t164rMergeList(userId, key, (prev as any)[key], val);
              if (JSON.stringify(m) !== JSON.stringify(val)) keptLocalDirty = true;
              merged[key] = m;
            } else {
              merged[key] = val;
            }
          }
          const updated = syncAllTasksToDetails(merged);
          const updatedJson = JSON.stringify(updated);
          if (JSON.stringify(prev) !== updatedJson || keptLocalDirty) {
            if (keptLocalDirty) {
              // Local un-pushed work survived the merge — isRemoteUpdateRef stays false
              // so the auto-save effect treats this as a local edit and pushes it.
            } else {
              isRemoteUpdateRef.current = true;
              lastSavedDataJsonRef.current = updatedJson;
            }
            try {
              localStorage.setItem('planner_data', updatedJson);
              if (currentUser) {
                localStorage.setItem('planner_user', JSON.stringify({
                  id: currentUser.id,
                  email: currentUser.email || '',
                  username: currentUser.username || ''
                }));
              }
            } catch (lsErr) {
              console.warn('LocalStorage write error during subcollection sync:', lsErr);
            }
            return updated;
          }
          return prev;
        });
      }
    }, (subErr) => {
      console.warn('[Firestore Subscription Error]', subErr);
    }, () => {
      // T164-R Phase B: first FULL snapshot set has been merged (mirror = server truth).
      firstRemoteSyncDoneRef.current = true;
      clearTimeout(gateFallbackTimer);
      flushPendingSyncQueue(userId).catch(() => {});
    });

    return () => {
      clearTimeout(gateFallbackTimer);
      unsub();
    };
  }, [currentUser?.id, firebaseUserUid, syncAllTasksToDetails]);

  // Automated Gmail Reminder Checker Loop with Stable Interval and 7-Source Coverage
  const isCheckingRemindersRef = useRef(false);
  useEffect(() => {
    if (data.emailRemindersGlobalEnabled === false) return;
    const email = currentUser?.email;
    if (!email) return;

    const checkAndSendReminders = async () => {
      if (isCheckingRemindersRef.current) return;
      const token = getCachedGmailToken();
      if (!token || isGmailTokenExpired()) return;

      const currentData = dataRef.current;
      if (currentData.emailRemindersGlobalEnabled === false) return;

      isCheckingRemindersRef.current = true;
      try {
        const now = getNow().getTime();
        const todayISO = getTodayTehranISO();
        const currentYear = currentData.weekYear || getTodayJalali().year;
        const targetEmail = (currentData.reminderEmailTargetType === 'custom' && currentData.reminderCustomEmail && currentData.reminderCustomEmail.trim())
          ? currentData.reminderCustomEmail.trim()
          : email;
        if (!targetEmail) return;

        // Track items that successfully sent an email this tick
        const sentExamItemIds = new Set<string>();
        const sentDetailsItemIds = new Set<string>();
        const sentReminderIds = new Set<string>();
        const sentCoreTaskIds = new Set<string>();
        const sentSecTaskIds = new Set<string>();
        const sentTodoIds = new Set<string>();
        const sentGoalTaskIds = new Set<string>();

        // 1. Exam Columns
        for (const col of currentData.examColumns || []) {
          for (const item of col.items || []) {
            if (item.emailReminder && !item.completed && item.lastSentDate !== todayISO) {
              const deadlineMs = parseItemDeadlineMs(item, currentYear);
              if (deadlineMs) {
                const offsetMs = getOffsetMs(item.reminderOffset || currentData.emailReminderDefaultOffset || '1day');
                const reminderTime = deadlineMs - offsetMs;
                if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                  const isLate = now > deadlineMs;
                  const lateSuffix = isLate ? ' (با تأخیر)' : '';
                  const deadlineDisplay = (item.date || 'سررسید قریب‌الوقوع') + lateSuffix;
                  const html = buildReminderEmailHtml(item.text, `امتحانات و ارائه‌ها (${col.titleFa})`, deadlineDisplay, item.description);
                  try {
                    await sendGmailEmail(token, targetEmail, `⏰ یادآوری امتحان / ارائه: ${item.text}${lateSuffix}`, html);
                    sentExamItemIds.add(item.id);
                    showToast(`ایمیل یادآوری برای "${item.text}" ارسال شد`, 'success');
                  } catch (sendErr) {
                    console.warn('Reminder email send failed for exam item:', sendErr);
                    showToast(`خطا در ارسال ایمیل یادآوری "${item.text}"`, 'error');
                  }
                }
              }
            }
          }
        }

        // 2. Details Columns
        for (const col of currentData.detailsColumns || []) {
          for (const item of col.items || []) {
            if (item.emailReminder && !item.completed && item.lastSentDate !== todayISO) {
              const deadlineMs = parseItemDeadlineMs(item, currentYear);
              if (deadlineMs) {
                const offsetMs = getOffsetMs(item.reminderOffset || currentData.emailReminderDefaultOffset || '1day');
                const reminderTime = deadlineMs - offsetMs;
                if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                  const isLate = now > deadlineMs;
                  const lateSuffix = isLate ? ' (با تأخیر)' : '';
                  const deadlineDisplay = (item.date || 'سررسید ددلاین') + lateSuffix;
                  const html = buildReminderEmailHtml(item.text, `ددلاین‌ها (${col.titleFa})`, deadlineDisplay);
                  try {
                    await sendGmailEmail(token, targetEmail, `⏰ یادآوری ددلاین: ${item.text}${lateSuffix}`, html);
                    sentDetailsItemIds.add(item.id);
                    showToast(`ایمیل یادآوری برای "${item.text}" ارسال شد`, 'success');
                  } catch (sendErr) {
                    console.warn('Reminder email send failed for detail item:', sendErr);
                    showToast(`خطا در ارسال ایمیل ددلاین "${item.text}"`, 'error');
                  }
                }
              }
            }
          }
        }

        // 3. Reminders / Habits
        for (const item of currentData.reminders || []) {
          if (item.emailReminder && !item.isCompleted && item.lastSentDate !== todayISO) {
            const deadlineMs = parseItemDeadlineMs(item, currentYear);
            if (deadlineMs) {
              const offsetMs = getOffsetMs(item.reminderOffset || currentData.emailReminderDefaultOffset || '1day');
              const reminderTime = deadlineMs - offsetMs;
              if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                const isLate = now > deadlineMs;
                const lateSuffix = isLate ? ' (با تأخیر)' : '';
                const deadlineDisplay = (item.time ? `ساعت ${item.time}` : (item.date || 'امروز')) + lateSuffix;
                const html = buildReminderEmailHtml(item.textFa, `یادآوری‌ها (${currentData.remindersTitle || 'پیگیری عادت‌ها'})`, deadlineDisplay);
                try {
                  await sendGmailEmail(token, targetEmail, `⏰ یادآوری کار / عادت: ${item.textFa}${lateSuffix}`, html);
                  sentReminderIds.add(item.id);
                  showToast(`ایمیل یادآوری برای "${item.textFa}" ارسال شد`, 'success');
                } catch (sendErr) {
                  console.warn('Reminder email send failed for reminder item:', sendErr);
                  showToast(`خطا در ارسال ایمیل برای "${item.textFa}"`, 'error');
                }
              }
            }
          }
        }

        // 4. Core Tasks
        for (const ct of currentData.coreTasks || []) {
          if (ct.status !== 'completed' && ct.status !== 'failed' && (ct as any).emailReminder && ct.lastSentDate !== todayISO) {
            const deadlineMs = parseItemDeadlineMs(ct, currentYear);
            if (deadlineMs) {
              const offsetMs = getOffsetMs((ct as any).reminderOffset || currentData.emailReminderDefaultOffset || '1day');
              const reminderTime = deadlineMs - offsetMs;
              if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                const isLate = now > deadlineMs;
                const lateSuffix = isLate ? ' (با تأخیر)' : '';
                const dStatus = getDeadlineOverdueStatus(ct.deadline);
                const deadlineDisplay = (dStatus.deadlineDisplay || 'سررسید کار اصلی') + lateSuffix;
                const html = buildReminderEmailHtml(ct.title, 'کارهای اصلی هفتگی', deadlineDisplay, ct.description);
                try {
                  await sendGmailEmail(token, targetEmail, `🎯 یادآوری کار اصلی: ${ct.title}${lateSuffix}`, html);
                  sentCoreTaskIds.add(ct.id);
                  showToast(`ایمیل یادآوری برای کار اصلی "${ct.title}" ارسال شد`, 'success');
                } catch (sendErr) {
                  console.warn('Reminder email send failed for core task:', sendErr);
                  showToast(`خطا در ارسال ایمیل کار اصلی "${ct.title}"`, 'error');
                }
              }
            }
          }
        }

        // 5. Secondary Tasks
        for (const st of currentData.secondaryTasks || []) {
          if (st.status !== 'completed' && st.status !== 'failed' && (st as any).emailReminder && st.lastSentDate !== todayISO) {
            const deadlineMs = parseItemDeadlineMs(st, currentYear);
            if (deadlineMs) {
              const offsetMs = getOffsetMs((st as any).reminderOffset || currentData.emailReminderDefaultOffset || '1day');
              const reminderTime = deadlineMs - offsetMs;
              if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                const isLate = now > deadlineMs;
                const lateSuffix = isLate ? ' (با تأخیر)' : '';
                const dStatus = getDeadlineOverdueStatus(st.deadline);
                const deadlineDisplay = (dStatus.deadlineDisplay || 'سررسید کار فرعی') + lateSuffix;
                const html = buildReminderEmailHtml(st.textFa, 'کارهای فرعی و فکری', deadlineDisplay, st.description);
                try {
                  await sendGmailEmail(token, targetEmail, `📌 یادآوری کار فرعی: ${st.textFa}${lateSuffix}`, html);
                  sentSecTaskIds.add(st.id);
                  showToast(`ایمیل یادآوری برای کار فرعی "${st.textFa}" ارسال شد`, 'success');
                } catch (sendErr) {
                  console.warn('Reminder email send failed for secondary task:', sendErr);
                  showToast(`خطا در ارسال ایمیل کار فرعی "${st.textFa}"`, 'error');
                }
              }
            }
          }
        }

        // 6. Todo List
        for (const todo of currentData.todoList || []) {
          if (!todo.completed && (todo as any).emailReminder && (todo as any).lastSentDate !== todayISO) {
            const deadlineMs = parseItemDeadlineMs(todo, currentYear);
            if (deadlineMs) {
              const offsetMs = getOffsetMs((todo as any).reminderOffset || currentData.emailReminderDefaultOffset || '1day');
              const reminderTime = deadlineMs - offsetMs;
              if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                const isLate = now > deadlineMs;
                const lateSuffix = isLate ? ' (با تأخیر)' : '';
                const deadlineDisplay = ((todo as any).date || 'سررسید تسک') + lateSuffix;
                const html = buildReminderEmailHtml(todo.text, 'لیست کارهای روزمره', deadlineDisplay);
                try {
                  await sendGmailEmail(token, targetEmail, `📝 یادآوری چک‌لیست: ${todo.text}${lateSuffix}`, html);
                  sentTodoIds.add(todo.id);
                  showToast(`ایمیل یادآوری برای "${todo.text}" ارسال شد`, 'success');
                } catch (sendErr) {
                  console.warn('Reminder email send failed for todo item:', sendErr);
                  showToast(`خطا در ارسال ایمیل چک‌لیست "${todo.text}"`, 'error');
                }
              }
            }
          }
        }

        // 7. Active Goal Tasks
        for (const goal of currentData.goals || []) {
          for (const task of goal.active_week_tasks || []) {
            if (!task.completed && (task as any).emailReminder && (task as any).lastSentDate !== todayISO) {
              const deadlineMs = parseItemDeadlineMs(task, currentYear);
              if (deadlineMs) {
                const offsetMs = getOffsetMs((task as any).reminderOffset || currentData.emailReminderDefaultOffset || '1day');
                const reminderTime = deadlineMs - offsetMs;
                if (now >= reminderTime && now <= deadlineMs + 24 * 60 * 60 * 1000) {
                  const isLate = now > deadlineMs;
                  const lateSuffix = isLate ? ' (با تأخیر)' : '';
                  const deadlineDisplay = (task.deadline_note || 'سررسید هدف') + lateSuffix;
                  const html = buildReminderEmailHtml(task.title, `هدف: ${goal.title}`, deadlineDisplay, task.description);
                  try {
                    await sendGmailEmail(token, targetEmail, `🎯 یادآوری تسک هدف: ${task.title}${lateSuffix}`, html);
                    sentGoalTaskIds.add(task.id);
                    showToast(`ایمیل یادآوری برای تسک هدف "${task.title}" ارسال شد`, 'success');
                  } catch (sendErr) {
                    console.warn('Reminder email send failed for goal task:', sendErr);
                    showToast(`خطا در ارسال ایمیل تسک هدف "${task.title}"`, 'error');
                  }
                }
              }
            }
          }
        }

        // Apply state updates ONLY for items whose email sending succeeded
        const hasUpdates =
          sentExamItemIds.size > 0 ||
          sentDetailsItemIds.size > 0 ||
          sentReminderIds.size > 0 ||
          sentCoreTaskIds.size > 0 ||
          sentSecTaskIds.size > 0 ||
          sentTodoIds.size > 0 ||
          sentGoalTaskIds.size > 0;

        if (hasUpdates) {
          setData((prev) => ({
            ...prev,
            examColumns: (prev.examColumns || []).map(col => ({
              ...col,
              items: col.items.map(it => sentExamItemIds.has(it.id) ? { ...it, reminderSent: true, lastSentDate: todayISO } : it)
            })),
            detailsColumns: (prev.detailsColumns || []).map(col => ({
              ...col,
              items: col.items.map(it => sentDetailsItemIds.has(it.id) ? { ...it, reminderSent: true, lastSentDate: todayISO } : it)
            })),
            reminders: (prev.reminders || []).map(r => sentReminderIds.has(r.id) ? { ...r, reminderSent: true, lastSentDate: todayISO } : r),
            coreTasks: (prev.coreTasks || []).map(ct => sentCoreTaskIds.has(ct.id) ? { ...ct, lastSentDate: todayISO } : ct),
            secondaryTasks: (prev.secondaryTasks || []).map(st => sentSecTaskIds.has(st.id) ? { ...st, lastSentDate: todayISO } : st),
            todoList: (prev.todoList || []).map(t => sentTodoIds.has(t.id) ? { ...t, lastSentDate: todayISO } as any : t),
            goals: (prev.goals || []).map(g => ({
              ...g,
              active_week_tasks: (g.active_week_tasks || []).map(t => sentGoalTaskIds.has(t.id) ? { ...t, lastSentDate: todayISO } as any : t)
            }))
          }));
        }
      } finally {
        isCheckingRemindersRef.current = false;
      }
    };

    checkAndSendReminders();
    const interval = setInterval(checkAndSendReminders, 60000);
    return () => clearInterval(interval);
  }, [data.emailRemindersGlobalEnabled, currentUser?.email]);

  // Google Calendar Auto-Sync Effect (W3 & W4: Content fingerprinting, silent success, interval/quota throttle)
  const gcalAutoSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const calendarSyncKey = computeCalendarContentFingerprint(data);

  useEffect(() => {
    if (!data.autoSyncGoogleCalendar) return;
    const token = getCachedGoogleCalendarToken();
    if (!token || isCalendarTokenExpired()) return;

    // Check content fingerprint to avoid unnecessary background tasks
    const cachedFp = lastCalendarSyncFpRef.current || localStorage.getItem('gcal_last_sync_fp');
    if (calendarSyncKey && calendarSyncKey === cachedFp) {
      return;
    }

    if (gcalAutoSyncTimerRef.current) {
      clearTimeout(gcalAutoSyncTimerRef.current);
    }

    gcalAutoSyncTimerRef.current = setTimeout(async () => {
      try {
        const now = Date.now();
        // 1. Minimum interval enforcement (W4-2)
        const minIntervalMs = (dataRef.current.gcalAutoSyncIntervalMinutes || 10) * 60 * 1000;
        if (lastAutoSyncRunAtRef.current > 0 && now - lastAutoSyncRunAtRef.current < minIntervalMs) {
          return;
        }

        // 2. Quota backoff check (W4-3)
        if (now < getQuotaBackoffUntil()) {
          return;
        }

        // 3. Daily quota cap check (W4-4)
        if (isDailyQuotaExceeded(dataRef.current.gcalDailyRequestCap || 400)) {
          const nowMs = Date.now();
          if (nowMs - lastCalendarErrorToastAtRef.current > 60000) {
            lastCalendarErrorToastAtRef.current = nowMs;
            showToast('سقف مجاز روزانه درخواست‌های تقویم گوگل به پایان رسید.', 'warning');
          }
          return;
        }

        const calId = dataRef.current.googleCalendarTargetId || 'primary';
        window.dispatchEvent(new CustomEvent('app-sync-status', { detail: { status: 'syncing' } }));
        const res = await runGoogleCalendarAutoSync(dataRef.current, token, calId);
        lastAutoSyncRunAtRef.current = Date.now();
        lastCalendarSyncFpRef.current = calendarSyncKey;
        try { localStorage.setItem('gcal_last_sync_fp', calendarSyncKey); } catch (_) {}

        if (res.upsertedCount > 0 || res.deletedCount > 0) {
          const nowTimeStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
          setData(prev => ({
            ...prev,
            plannerCalendarMap: res.updatedMap,
            plannerCalendarFingerprints: res.updatedFingerprints,
            lastCalendarSyncTime: nowTimeStr
          }));
          window.dispatchEvent(new CustomEvent('app-sync-status', { detail: { status: 'synced' } }));
          // W3-1: Background success is completely silent (no toast)
        } else {
          window.dispatchEvent(new CustomEvent('app-sync-status', { detail: { status: 'synced' } }));
        }

        if (res.errors && res.errors.length > 0) {
          calendarErrorCountRef.current++;
          const nowMs = Date.now();
          if (nowMs - lastCalendarErrorToastAtRef.current > 60000) {
            lastCalendarErrorToastAtRef.current = nowMs;
            showToast(`خطای همگام‌سازی خودکار تقویم گوگل (${calendarErrorCountRef.current} خطا)`, 'error');
            calendarErrorCountRef.current = 0;
          }
        }
      } catch (err: any) {
        console.warn('GCal Auto-sync background error:', err);
        calendarErrorCountRef.current++;
        const nowMs = Date.now();
        if (nowMs - lastCalendarErrorToastAtRef.current > 60000) {
          lastCalendarErrorToastAtRef.current = nowMs;
          showToast('خطا در ارتباط با تقویم گوگل', 'error');
          calendarErrorCountRef.current = 0;
        }
      }
    }, 20000);

    return () => {
      if (gcalAutoSyncTimerRef.current) {
        clearTimeout(gcalAutoSyncTimerRef.current);
      }
    };
  }, [
    data.autoSyncGoogleCalendar,
    calendarSyncKey,
    data.googleCalendarTargetId,
    data.gcalAutoSyncIntervalMinutes,
    data.gcalDailyRequestCap
  ]);

  const [past, setPast] = useState<PlannerData[]>([]);
  const [future, setFuture] = useState<PlannerData[]>([]);

  // Refs for smart history management (keystroke grouping)
  const lastHistoryTimeRef = useRef<number>(0);
  const lastChangeWasTextRef = useRef<boolean>(false);

  const isTextOnlyChange = (current: PlannerData, next: PlannerData): boolean => {
    try {
      // If any config fields changed, it's NOT a text-only change
      if (
        current.classRows !== next.classRows ||
        current.dailyTaskRows !== next.dailyTaskRows ||
        current.weekStartDay !== next.weekStartDay ||
        current.weekEndDay !== next.weekEndDay ||
        current.weekYear !== next.weekYear ||
        current.weekMonth !== next.weekMonth ||
        current.weekEndYear !== next.weekEndYear ||
        current.weekEndMonth !== next.weekEndMonth ||
        current.activeClassStatus !== next.activeClassStatus
      ) {
        return false;
      }

      // Compare todoList lengths and completed statuses
      const currentTodos = current.todoList || [];
      const nextTodos = next.todoList || [];
      if (currentTodos.length !== nextTodos.length) return false;
      for (let i = 0; i < currentTodos.length; i++) {
        if (currentTodos[i].id !== nextTodos[i].id) return false;
        if (currentTodos[i].completed !== nextTodos[i].completed) return false;
      }

      // Compare weeklyEvents lengths and completed statuses
      const currentWE = current.weeklyEvents || [];
      const nextWE = next.weeklyEvents || [];
      if (currentWE.length !== nextWE.length) return false;
      for (let i = 0; i < currentWE.length; i++) {
        if (currentWE[i].id !== nextWE[i].id) return false;
        if (currentWE[i].completed !== nextWE[i].completed) return false;
      }

      // Compare dailyThoughts lengths
      const currentDT = current.dailyThoughts || [];
      const nextDT = next.dailyThoughts || [];
      if (currentDT.length !== nextDT.length) return false;
      for (let i = 0; i < currentDT.length; i++) {
        if (currentDT[i].id !== nextDT[i].id) return false;
      }

      // Compare classesSchedule lengths, positions and categoryIds
      const currentClasses = current.classesSchedule || [];
      const nextClasses = next.classesSchedule || [];
      if (currentClasses.length !== nextClasses.length) return false;
      for (let i = 0; i < currentClasses.length; i++) {
        if (
          currentClasses[i].id !== nextClasses[i].id ||
          currentClasses[i].row !== nextClasses[i].row ||
          currentClasses[i].dayKey !== nextClasses[i].dayKey ||
          currentClasses[i].categoryId !== nextClasses[i].categoryId
        ) {
          return false;
        }
      }

      // Compare dailyTasks per day key
      const currentDaily = current.dailyTasks || {};
      const nextDaily = next.dailyTasks || {};
      const days = Object.keys({ ...currentDaily, ...nextDaily });
      for (const d of days) {
        const cList = currentDaily[d] || [];
        const nList = nextDaily[d] || [];
        if (cList.length !== nList.length) return false;
        for (let i = 0; i < cList.length; i++) {
          if (
            cList[i].id !== nList[i].id ||
            cList[i].status !== nList[i].status ||
            cList[i].categoryId !== nList[i].categoryId
          ) {
            return false;
          }
        }
      }

      // Compare coreTasks lengths, categories, and statuses
      const currentCore = current.coreTasks || [];
      const nextCore = next.coreTasks || [];
      if (currentCore.length !== nextCore.length) return false;
      for (let i = 0; i < currentCore.length; i++) {
        if (
          currentCore[i].id !== nextCore[i].id ||
          currentCore[i].categoryId !== nextCore[i].categoryId ||
          currentCore[i].status !== nextCore[i].status
        ) {
          return false;
        }
      }

      // Compare secondaryTasks lengths, columns, and statuses
      const currentSec = current.secondaryTasks || [];
      const nextSec = next.secondaryTasks || [];
      if (currentSec.length !== nextSec.length) return false;
      for (let i = 0; i < currentSec.length; i++) {
        if (
          currentSec[i].id !== nextSec[i].id ||
          currentSec[i].columnId !== nextSec[i].columnId ||
          currentSec[i].status !== nextSec[i].status
        ) {
          return false;
        }
      }

      // Compare reminders lengths and checkedDays lengths
      const currentRem = current.reminders || [];
      const nextRem = next.reminders || [];
      if (currentRem.length !== nextRem.length) return false;
      for (let i = 0; i < currentRem.length; i++) {
        if (currentRem[i].id !== nextRem[i].id) return false;
        const cChecked = currentRem[i].checkedDays || [];
        const nChecked = nextRem[i].checkedDays || [];
        if (cChecked.length !== nChecked.length) return false;
        for (let j = 0; j < cChecked.length; j++) {
          if (cChecked[j] !== nChecked[j]) return false;
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  };

  // Custom setData wrapper to capture state snapshot for history
  const setData = useCallback((
    value: React.SetStateAction<PlannerData>,
    skipHistory = false
  ) => {
    setDataRaw((current) => {
      const rawNext = typeof value === 'function' ? (value as any)(current) : value;
      const next = syncAllTasksToDetails(rawNext);
      if (skipHistory) {
        return next;
      }
      if (JSON.stringify(current) !== JSON.stringify(next)) {
        const textOnly = isTextOnlyChange(current, next);
        const now = Date.now();
        const lastTime = lastHistoryTimeRef.current;

        // If it's a text-only change and happened within 7.0 seconds during a typing burst,
        // we overwrite (by not pushing a new S1, S2, etc.), keeping only the original pre-typing state in 'past'.
        if (textOnly && now - lastTime < 7000 && lastChangeWasTextRef.current) {
          lastHistoryTimeRef.current = now;
        } else {
          setPast((p) => {
            const updated = [...p, current];
            if (updated.length > 20) updated.shift();
            return updated;
          });
          lastHistoryTimeRef.current = now;
        }

        lastChangeWasTextRef.current = textOnly;
        setFuture([]);
      }
      return next;
    });
  }, [syncAllTasksToDetails]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [data, ...f]);
    setDataRaw(previous);
    showToast('تغییر قبلی بازیابی شد (Undo)');
  }, [past, data]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, data]);
    setDataRaw(next);
    showToast('تغییر بعدی اعمال شد (Redo)');
  }, [future, data]);

  // Edit states for Class Slot Modal
  const [editingSlot, setEditingSlot] = useState<ClassSlot | null>(null);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState<boolean>(false);

  // Edit states for Daily Task Modal
  const [editingDailyTask, setEditingDailyTask] = useState<{ dayKey: string; taskIndex: number; task: DailyTask } | null>(null);
  const [isDailyTaskModalOpen, setIsDailyTaskModalOpen] = useState<boolean>(false);

  // Calendar Range Modal State
  const [isCalendarRangeOpen, setIsCalendarRangeOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [tempYear, setTempYear] = useState<number>(data.weekYear || getTodayJalali().year);
  const [tempMonth, setTempMonth] = useState<string>(data.weekMonth || 'خرداد');
  const [tempStartDay, setTempStartDay] = useState<number | null>(data.weekStartDay || 1);
  const [tempStartMonth, setTempStartMonth] = useState<string | null>(data.weekMonth || 'خرداد');
  const [tempEndDay, setTempEndDay] = useState<number | null>(data.weekEndDay || 7);
  const [tempEndMonth, setTempEndMonth] = useState<string | null>(data.weekEndMonth || data.weekMonth || 'خرداد');

  // Completion Date Selector state (for selecting date when checkmarking a task)
  const [completionTarget, setCompletionTarget] = useState<{
    type: 'daily' | 'secondary' | 'core';
    dayKey?: string;
    taskIndex?: number;
    taskId?: string;
  } | null>(null);

  // Android / Mobile Browser Hardware Back Button Handler
  useEffect(() => {
    const hasAnyModal = isCalendarRangeOpen || isDailyTaskModalOpen || isSlotModalOpen || isProfileModalOpen || completionTarget !== null;

    if (hasAnyModal || activeTab !== 1) {
      window.history.pushState({ modalOpen: hasAnyModal, activeTab }, '');
    }

    const handlePopState = () => {
      if (isCalendarRangeOpen) {
        setIsCalendarRangeOpen(false);
      } else if (isDailyTaskModalOpen) {
        setIsDailyTaskModalOpen(false);
      } else if (isSlotModalOpen) {
        setIsSlotModalOpen(false);
      } else if (isProfileModalOpen) {
        setIsProfileModalOpen(false);
      } else if (completionTarget !== null) {
        setCompletionTarget(null);
      } else if (activeTab !== 1) {
        setActiveTab(1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isCalendarRangeOpen, isDailyTaskModalOpen, isSlotModalOpen, isProfileModalOpen, completionTarget, activeTab]);

  // Automatic week transition check (runs ONCE on app mount)
  const autoTransitionCheckedRef = useRef(false);

  useEffect(() => {
    if (autoTransitionCheckedRef.current) return;
    autoTransitionCheckedRef.current = true;

    const autoLoad = localStorage.getItem('auto_load_data') !== 'false';
    const autoUpdateCal = localStorage.getItem('auto_update_calendar') !== 'false';

    if (!autoLoad && !autoUpdateCal) return;

    try {
      const currentWeek = getCurrentJalaliWeekRange(getNow());

      // Saved week info
      const savedStartDay = data.weekStartDay || 1;
      const savedStartMonth = data.weekMonth || 'خرداد';
      const savedEndDay = data.weekEndDay || 7;
      const savedEndMonth = data.weekEndMonth || data.weekMonth || 'خرداد';
      const savedYear = data.weekYear || getTodayJalali().year;

      const savedWeekKey = `${savedYear}_${savedStartMonth}_${savedStartDay}_${savedEndMonth}_${savedEndDay}`;
      const currentWeekKey = `${currentWeek.startYear}_${currentWeek.startMonth}_${currentWeek.startDay}_${currentWeek.endMonth}_${currentWeek.endDay}`;

      // Check if current real date has passed saved week's end date
      const endMIdx = JALALI_MONTHS.indexOf(savedEndMonth);
      if (endMIdx !== -1) {
        const endGregDate = jalaliToGregorian(savedYear, endMIdx + 1, savedEndDay);
        const weekEndMs = endGregDate.getTime() + 86400000 - 1; // End of Friday (23:59:59)
        const nowMs = getNow().getTime();

        if (nowMs > weekEndMs || savedWeekKey !== currentWeekKey) {
          // 1. Auto download JSON backup for ended week if autoLoad setting enabled
          if (autoLoad) {
            const downloadedKey = `auto_downloaded_week_${savedWeekKey}`;
            if (!localStorage.getItem(downloadedKey)) {
              localStorage.setItem(downloadedKey, 'true');

              const exportBundle = {
                ...data,
                __exportedAt: getNow().toISOString(),
                __autoWeekEndExport: true
              };
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportBundle, null, 2));
              const downloadAnchor = document.createElement('a');
              downloadAnchor.setAttribute("href", dataStr);
              downloadAnchor.setAttribute("download", `weekly-planner-auto-${savedStartDay}-${savedStartMonth}-to-${savedEndDay}-${savedEndMonth}.json`);
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();
              downloadAnchor.remove();

              setTimeout(() => {
                showToast('دانلود خودکار فایل پشتیبان JSON پایان هفته با موفقیت انجام شد');
              }, 500);
            }
          }

          // 2. Auto update calendar week date range to Saturday-Friday of current real week
          if (autoUpdateCal && savedWeekKey !== currentWeekKey) {
            setData(prev => ({
              ...prev,
              weekYear: currentWeek.startYear,
              weekMonth: currentWeek.startMonth,
              weekStartDay: currentWeek.startDay,
              weekEndMonth: currentWeek.endMonth,
              weekEndDay: currentWeek.endDay,
              month: currentWeek.startMonth
            }));

            setTempYear(currentWeek.startYear);
            setTempMonth(currentWeek.startMonth);
            setTempStartDay(currentWeek.startDay);
            setTempEndDay(currentWeek.endDay);

            setTimeout(() => {
              showToast(`تقویم به طور خودکار به هفته جدید (${currentWeek.startDay} ${currentWeek.startMonth} تا ${currentWeek.endDay} ${currentWeek.endMonth} ${currentWeek.startYear}) بروزرسانی شد`);
            }, 1000);
          }
        }
      }
    } catch (e) {
      console.warn("Auto week transition check failed:", e);
    }
  }, []);

  // Todo List Helpers
  const handleAddTodo = (text: string) => {
    if (!text.trim()) return;
    const newTodo = {
      id: `todo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: text.trim(),
      completed: false,
    };
    setData((prev) => ({
      ...prev,
      todoList: [...prev.todoList, newTodo],
    }));
    showToast('کار جدید به لیست فوری اضافه شد');
  };

  const handleToggleTodo = (id: string) => {
    setData((prev) => {
      const updated = prev.todoList.map((t) => {
        if (t.id === id) {
          return { ...t, completed: !t.completed };
        }
        return t;
      });
      return { ...prev, todoList: updated };
    });
  };

  const handleDeleteTodo = (id: string) => {
    setData((prev) => ({
      ...prev,
      todoList: prev.todoList.filter((t) => t.id !== id),
    }));
    showToast('کار از لیست فوری حذف شد');
  };

  const handleEditTodoText = (id: string, text: string) => {
    setData((prev) => {
      const updated = prev.todoList.map((t) => {
        if (t.id === id) {
          return { ...t, text };
        }
        return t;
      });
      return { ...prev, todoList: updated };
    });
  };

  // Weekly Events Helpers
  const handleAddWeeklyEvent = (text: string) => {
    if (!text.trim()) return;
    const newEvent = {
      id: `we_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      text: text.trim(),
      completed: false,
    };
    setData((prev) => ({
      ...prev,
      weeklyEvents: [...(prev.weeklyEvents || []), newEvent],
    }));
    showToast('رویداد جدید اضافه شد');
  };

  const handleToggleWeeklyEvent = (id: string) => {
    setData((prev) => {
      const updated = (prev.weeklyEvents || []).map((e) => {
        if (e.id === id) {
          return { ...e, completed: !e.completed };
        }
        return e;
      });
      return { ...prev, weeklyEvents: updated };
    });
  };

  const handleDeleteWeeklyEvent = (id: string) => {
    setData((prev) => ({
      ...prev,
      weeklyEvents: (prev.weeklyEvents || []).filter((e) => e.id !== id),
    }));
    showToast('رویداد حذف شد');
  };

  const handleEditWeeklyEventText = (id: string, text: string) => {
    setData((prev) => {
      const updated = (prev.weeklyEvents || []).map((e) => {
        if (e.id === id) {
          return { ...e, text };
        }
        return e;
      });
      return { ...prev, weeklyEvents: updated };
    });
  };

  // Daily Thoughts Helpers
  const handleAddDailyThought = (text: string) => {
    if (!text.trim()) return;
    const newThought = {
      id: `dt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      text: text.trim(),
      completed: false,
    };
    setData((prev) => ({
      ...prev,
      dailyThoughts: [...(prev.dailyThoughts || []), newThought],
    }));
    showToast('فکر روزانه جدید اضافه شد');
  };

  const handleDeleteDailyThought = (id: string) => {
    setData((prev) => ({
      ...prev,
      dailyThoughts: (prev.dailyThoughts || []).filter((t) => t.id !== id),
    }));
    showToast('فکر حذف شد');
  };

  const handleEditDailyThoughtText = (id: string, text: string) => {
    setData((prev) => {
      const updated = (prev.dailyThoughts || []).map((t) => {
        if (t.id === id) {
          return { ...t, text };
        }
        return t;
      });
      return { ...prev, dailyThoughts: updated };
    });
  };

  const handleUpdateWeeklyEventWeekday = (id: string, weekday: string) => {
    setData((prev) => {
      const updated = (prev.weeklyEvents || []).map((e) => {
        if (e.id === id) {
          return { ...e, weekday: weekday || undefined };
        }
        return e;
      });
      return { ...prev, weeklyEvents: updated };
    });
  };

  const handleUpdateDailyThoughtWeekday = (id: string, weekday: string) => {
    setData((prev) => {
      const updated = (prev.dailyThoughts || []).map((t) => {
        if (t.id === id) {
          return { ...t, weekday: weekday || undefined };
        }
        return t;
      });
      return { ...prev, dailyThoughts: updated };
    });
  };

  // Reset to original default data (W1)
  const handleReset = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = async () => {
    try {
      // a. Set reset guard to reject incoming cloud echo for 30s
      const guardTime = Date.now() + 30000;
      resetGuardUntilRef.current = guardTime;
      localStorage.setItem('reset_guard_until', String(guardTime));

      // b. Clear pending queues and cache keys
      localStorage.removeItem('planner_pending_sync');
      localStorage.removeItem('gcal_last_sync_fp');

      // c. Construct resetData with today's real week range
      const curWeek = getCurrentJalaliWeekRange(getNow());
      const resetData: PlannerData = {
        ...INITIAL_PLANNER_DATA,
        weekYear: curWeek.startYear,
        weekMonth: curWeek.startMonth,
        weekStartDay: curWeek.startDay,
        weekEndYear: curWeek.endYear,
        weekEndMonth: curWeek.endMonth,
        weekEndDay: curWeek.endDay,
        month: curWeek.month,
        updatedAt: new Date().toISOString()
      };

      // d. Update local state and push to Firestore
      setData(resetData);
      setTempYear(resetData.weekYear || curWeek.startYear);
      setTempMonth(resetData.weekMonth || curWeek.startMonth);
      setTempStartDay(resetData.weekStartDay || curWeek.startDay);
      setTempEndDay(resetData.weekEndDay || curWeek.endDay);
      setTempStartMonth(resetData.weekMonth || curWeek.startMonth);
      setTempEndMonth(resetData.weekEndMonth || curWeek.endMonth);

      try {
        localStorage.setItem('planner_data', JSON.stringify(resetData));
      } catch (_) {}

      if (currentUser && currentUser.id) {
        await savePlannerSubcollections(currentUser.id, resetData);
      }

      setIsResetConfirmOpen(false);
      showToast('تمام اطلاعات با موفقیت پاک شد و برنامه به قالب اولیه بازنشانی گردید.', 'success');
    } catch (err) {
      console.error('Reset error:', err);
      showToast('خطا در بازنشانی اطلاعات', 'error');
    }
  };

  // Export as JSON file
  const handleExport = () => {
    // Collect any extra user settings from localStorage to bundle alongside plannerData if needed,
    // ensuring the import restores EVERYTHING including theme, language, and custom configurations.
    const exportBundle = {
      ...data,
      __exportedAt: new Date().toISOString(),
      __appSettings: {
        theme: localStorage.getItem('theme') || 'light',
        language: localStorage.getItem('planner_lang') || 'fa',
        autoLoadData: localStorage.getItem('auto_load_data') !== 'false',
        autoUpdateCalendar: localStorage.getItem('auto_update_calendar') !== 'false'
      }
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportBundle, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `weekly-planner-${data.month.replace(/\s+/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('فایل پشتیبان با تمامی جزئیات و تنظیمات با موفقیت دانلود شد');
  };

  // Export as PDF file
  const handleExportPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    showToast('در حال آماده‌سازی فایل PDF... لطفا شکیبا باشید.');

    const originalTab = activeTab;
    const originalEditMode = editMode;
    
    // Temporarily turn off edit mode for a clean look
    setEditMode(false);

    // List of tab IDs to export (including the new Analytics tab!)
    const tabsToExport = [
      { id: 1, name: 'کلاس‌ها و کارهای روزانه' },
      { id: 6, name: 'کارهای اصلی' },
      { id: 3, name: 'کارهای فرعی' },
      { id: 10, name: 'سیستم هوشمند مدیریت اهداف' },
      { id: 2, name: 'ددلاین‌ها' },
      { id: 4, name: 'یادآوری‌ها' },
      { id: 7, name: 'کارهای انجام شده و نشده' },
      { id: 11, name: 'امتحانات و ارائه‌ها' },
      { id: 8, name: 'لغو و تعویق‌ها' },
      { id: 5, name: 'یادداشت‌ها' },
      { id: 9, name: 'تحلیل عملکرد' }
    ];

    const pdf = new jsPDF('p', 'mm', 'a4');
    let isFirstPage = true;

    // Wait for React rendering and layout updates helper
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Arrays to hold styles we modify so we can restore them later
    interface SheetToRestore {
      sheet: CSSStyleSheet;
      originalDisabled: boolean;
    }
    interface TempStyleToRemove {
      element: HTMLStyleElement;
    }

    const sheetsToRestore: SheetToRestore[] = [];
    const tempsToRemove: TempStyleToRemove[] = [];

    // Helper to sanitize all oklch and oklab colors by correctly balancing parentheses
    const sanitizeOklColorsText = (cssText: string): string => {
      let result = cssText;
      const matchAndReplace = (keyword: string, fallbackColor: string) => {
        let index = 0;
        while (true) {
          const startIdx = result.toLowerCase().indexOf(keyword + '(', index);
          if (startIdx === -1) break;
          
          let parenCount = 1;
          let endIdx = startIdx + keyword.length + 1;
          while (endIdx < result.length && parenCount > 0) {
            if (result[endIdx] === '(') parenCount++;
            else if (result[endIdx] === ')') parenCount--;
            endIdx++;
          }
          
          if (parenCount === 0) {
            const fullMatch = result.substring(startIdx, endIdx);
            result = result.substring(0, startIdx) + fallbackColor + result.substring(endIdx);
            index = startIdx + fallbackColor.length;
          } else {
            index = startIdx + keyword.length + 1;
          }
        }
      };

      matchAndReplace('oklch', 'rgb(79, 70, 229)');
      matchAndReplace('oklab', 'rgb(79, 70, 229)');
      return result;
    };

    // Helper to convert oklch and oklab colors to standard hsl/hsla to avoid PDF parsing crashes
    const convertOklColors = (text: string): string => {
      // 1. Convert simple oklch to hsl/hsla
      let res = text.replace(
        /oklch\(\s*([0-9.]+%?)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:\s*[\s/]+\s*([0-9.]+%?))?\s*\)/gi, 
        (match, lStr, cStr, hStr, aStr) => {
          try {
            let l = parseFloat(lStr);
            if (lStr.includes('%')) l = l / 100;
            const lPercent = Math.max(0, Math.min(100, Math.round(l * 100)));

            const c = parseFloat(cStr);
            const sPercent = Math.max(0, Math.min(100, Math.round((c / 0.4) * 100)));

            const h = Math.max(0, Math.min(360, Math.round(parseFloat(hStr))));

            if (aStr !== undefined) {
              let a = parseFloat(aStr);
              if (aStr.includes('%')) a = a / 100;
              return `hsla(${h}, ${sPercent}%, ${lPercent}%, ${a})`;
            } else {
              return `hsl(${h}, ${sPercent}%, ${lPercent}%)`;
            }
          } catch (e) {
            return 'rgb(120, 120, 120)';
          }
        }
      );

      // 2. Convert simple oklab to hsl/hsla (Oklab components: L, a, b / alpha)
      res = res.replace(
        /oklab\(\s*([0-9.]+%?)[,\s]+([-+]?[0-9.]+)[,\s]+([-+]?[0-9.]+)(?:\s*[\s/]+\s*([0-9.]+%?))?\s*\)/gi,
        (match, lStr, aStr, bStr, alphaStr) => {
          try {
            let l = parseFloat(lStr);
            if (lStr.includes('%')) l = l / 100;
            const lPercent = Math.max(0, Math.min(100, Math.round(l * 100)));

            const aVal = parseFloat(aStr);
            const bVal = parseFloat(bStr);

            // Calculate Chroma C (distance from central axis)
            const c = Math.sqrt(aVal * aVal + bVal * bVal);
            const sPercent = Math.max(0, Math.min(100, Math.round((c / 0.4) * 100)));

            // Calculate Hue H in degrees from a and b
            let hRad = Math.atan2(bVal, aVal);
            let hDeg = hRad * (180 / Math.PI);
            if (hDeg < 0) hDeg += 360;
            const h = Math.max(0, Math.min(360, Math.round(hDeg)));

            if (alphaStr !== undefined) {
              let alpha = parseFloat(alphaStr);
              if (alphaStr.includes('%')) alpha = alpha / 100;
              return `hsla(${h}, ${sPercent}%, ${lPercent}%, ${alpha})`;
            } else {
              return `hsl(${h}, ${sPercent}%, ${lPercent}%)`;
            }
          } catch (e) {
            return 'rgb(120, 120, 120)';
          }
        }
      );

      // 3. Fallback for any other complex/unparsed oklch or oklab expressions using recursive balanced parenthesis helper
      res = sanitizeOklColorsText(res);

      return res;
    };

    try {
      // Process all stylesheets in document.styleSheets
      const sheets = Array.from(document.styleSheets) as CSSStyleSheet[];
      for (const sheet of sheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;

          let cssText = '';
          for (let i = 0; i < rules.length; i++) {
            cssText += rules[i].cssText + '\n';
          }

          if (cssText.toLowerCase().includes('oklch') || cssText.toLowerCase().includes('oklab')) {
            // Keep track of original state
            sheetsToRestore.push({ sheet, originalDisabled: sheet.disabled });

            const convertedCss = convertOklColors(cssText);

            // Append a style element with the safe CSS
            const tempStyle = document.createElement('style');
            tempStyle.setAttribute('data-pdf-temp-style', 'true');
            tempStyle.innerHTML = convertedCss;
            document.head.appendChild(tempStyle);
            tempsToRemove.push({ element: tempStyle });

            // Disable the original stylesheet
            sheet.disabled = true;
          }
        } catch (err) {
          // Cross-origin sheets or security boundaries might fail; safely ignore as html2canvas skips them anyway
          console.warn('Could not read cssRules for stylesheet:', sheet.href, err);
        }
      }

      // Generate pages for each active tab
      for (const tab of tabsToExport) {
        setActiveTab(tab.id);
        // Wait for state to apply and DOM to update/paint
        await sleep(600);

        const element = document.getElementById('pdf-capture-area');
        if (!element) continue;

        // Capture with html2canvas (scaled to 1.5 for optimal balance between resolution and file size)
        const canvas = await html2canvas(element, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#f8fafc',
          onclone: (clonedDoc) => {
            // Clean style tags
            const styleTags = clonedDoc.querySelectorAll('style');
            styleTags.forEach(st => {
              try {
                let cssText = st.innerHTML;
                if (cssText.toLowerCase().includes('oklch') || cssText.toLowerCase().includes('oklab')) {
                  st.innerHTML = sanitizeOklColorsText(cssText);
                }
              } catch (e) {
                console.error(e);
              }
            });

            // Clean inline style attributes on elements
            const allElements = clonedDoc.querySelectorAll('*');
            allElements.forEach(el => {
              try {
                const styleAttr = el.getAttribute('style');
                if (styleAttr && (styleAttr.toLowerCase().includes('oklch') || styleAttr.toLowerCase().includes('oklab'))) {
                  el.setAttribute('style', sanitizeOklColorsText(styleAttr));
                }
              } catch (e) {
                console.error(e);
              }
            });
          }
        });

        // Slicing calculations to handle multi-page tabs perfectly
        const imgWidth = 190; // A4 width minus margins (10mm on each side)
        const pageHeightMm = 297;
        const marginMm = 10;
        const printableHeightMm = pageHeightMm - (2 * marginMm); // 277 mm

        const scale = imgWidth / canvas.width;
        const pxPageHeight = printableHeightMm / scale;

        let currentY = 0;
        while (currentY < canvas.height) {
          const chunkHeight = Math.min(pxPageHeight, canvas.height - currentY);
          
          // Slice canvas
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = chunkHeight;
          const ctx = slice.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, currentY, canvas.width, chunkHeight, 0, 0, canvas.width, chunkHeight);
          }

          // Convert slice to compressed JPEG to reduce file size from ~140MB to ~2MB
          const imgData = slice.toDataURL('image/jpeg', 0.82);

          if (!isFirstPage) {
            pdf.addPage();
          } else {
            isFirstPage = false;
          }

          const renderedHeightMm = chunkHeight * scale;
          pdf.addImage(imgData, 'JPEG', marginMm, marginMm, imgWidth, renderedHeightMm, undefined, 'FAST');

          currentY += chunkHeight;
        }
      }

      pdf.save(`weekly-planner-${data.weekYear || getTodayJalali().year}-${data.weekMonth || 'khordad'}.pdf`);
      showToast('فایل PDF با موفقیت دانلود شد!');
    } catch (error) {
      console.error('PDF Generation Error:', error);
      showToast('خطا در دریافت فایل PDF! خطا: ' + (error instanceof Error ? error.message : 'پارس ناموفق رنگ'));
    } finally {
      // Restore all original styles
      for (const item of sheetsToRestore) {
        item.sheet.disabled = item.originalDisabled;
      }
      for (const item of tempsToRemove) {
        if (item.element.parentNode) {
          item.element.parentNode.removeChild(item.element);
        }
      }

      // Restore navigation state
      setActiveTab(originalTab);
      setEditMode(originalEditMode);
      setIsExportingPDF(false);
    }
  };

  // Import from JSON file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && typeof parsed === 'object') {
            // Restore settings if present
            if (parsed.__appSettings) {
              const settings = parsed.__appSettings;
              if (settings.theme) {
                localStorage.setItem('theme', settings.theme);
                if (settings.theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              }
              if (settings.language) {
                localStorage.setItem('planner_lang', settings.language);
                setLang(settings.language as 'fa' | 'en');
              }
              if (settings.autoLoadData !== undefined) {
                localStorage.setItem('auto_load_data', settings.autoLoadData.toString());
              }
              if (settings.autoUpdateCalendar !== undefined) {
                localStorage.setItem('auto_update_calendar', settings.autoUpdateCalendar.toString());
              }
            }

            // Clean internal metadata keys to avoid cluttering actual data
            const cleanedData = { ...parsed };
            delete cleanedData.__exportedAt;
            delete cleanedData.__appSettings;

            // Automatically verify and repair all schema attributes (deadlines, categories, classes, notes, todo list, colors, etc.)
            const { repairedData } = verifyAndRepairPlannerData(cleanedData);

            setData(repairedData);
            showToast('برنامه و تمامی تنظیمات با موفقیت بارگذاری و اعمال شد!');
          } else {
            showToast('فرمت فایل نامعتبر است.', 'error');
          }
        } catch (err) {
          showToast('خطا در خواندن فایل!', 'error');
        }
      };
    }
  };

  const SOLAR_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  const getNextMonth = (m: string) => {
    const idx = SOLAR_MONTHS.indexOf(m);
    if (idx === -1) return m;
    return SOLAR_MONTHS[(idx + 1) % 12];
  };

  // Calendar Day Selection Click logic (Hotel booking range style with consecutive months support)
  const handleCalendarDayClick = (dayNum: number, monthName: string) => {
    const daysInMonth1 = getDaysInMonth(tempMonth);
    
    // Convert current click to absolute coordinate: Month 1 absolute day is dayNum, Month 2 is daysInMonth1 + dayNum
    const clickedAbs = monthName === tempMonth ? dayNum : (daysInMonth1 + dayNum);
    
    // Convert tempStartDay and tempEndDay to absolute coordinates
    const startAbs = (tempStartDay !== null && tempStartMonth)
      ? (tempStartMonth === tempMonth ? tempStartDay : (daysInMonth1 + tempStartDay))
      : null;
      
    const endAbs = (tempEndDay !== null && tempEndMonth)
      ? (tempEndMonth === tempMonth ? tempEndDay : (daysInMonth1 + tempEndDay))
      : null;
      
    if (startAbs === null) {
      setTempStartDay(dayNum);
      setTempStartMonth(monthName);
      setTempEndDay(null);
      setTempEndMonth(null);
    } else if (endAbs === null) {
      if (clickedAbs < startAbs) {
        setTempStartDay(dayNum);
        setTempStartMonth(monthName);
        setTempEndDay(null);
        setTempEndMonth(null);
      } else if (clickedAbs === startAbs) {
        setTempStartDay(null);
        setTempStartMonth(null);
      } else {
        setTempEndDay(dayNum);
        setTempEndMonth(monthName);
      }
    } else {
      setTempStartDay(dayNum);
      setTempStartMonth(monthName);
      setTempEndDay(null);
      setTempEndMonth(null);
    }
  };

  // Submit calendar dialog range
  const submitCalendarRange = () => {
    if (tempStartDay === null || tempEndDay === null || !tempStartMonth || !tempEndMonth) {
      showToast('لطفا هم شروع و هم پایان هفته را انتخاب کنید (بازه ۷ روزه)', 'error');
      return;
    }
    
    const daysInMonth1 = getDaysInMonth(tempMonth);
    const startAbs = (tempStartMonth === tempMonth ? tempStartDay : (daysInMonth1 + tempStartDay));
    const endAbs = (tempEndMonth === tempMonth ? tempEndDay : (daysInMonth1 + tempEndDay));
    const totalDays = endAbs - startAbs + 1;

    if (totalDays !== 7) {
      showToast(`تعداد روزهای انتخاب شده ${totalDays} روز است. لطفا دقیقا بازه ۷ روزه (یک هفته کامل) را انتخاب کنید.`, 'error');
      return;
    }

    // --- Automatic Week-End Archiving (درخواست ۲) ---
    const oldStartDay = data.weekStartDay || 1;
    const oldStartMonth = data.weekMonth || 'خرداد';
    const oldStartYear = data.weekYear || getTodayJalali().year;
    const oldEndDay = data.weekEndDay || 7;
    const oldEndMonth = data.weekEndMonth || data.weekMonth || 'خرداد';
    const oldEndYear = data.weekEndYear || data.weekYear || getTodayJalali().year;

    // Helper for Jalali ASCII digits
    const toAsciiDigits = (str: string) => {
      return (str || '')
        .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    };

    let newStartYear = tempYear;
    if (tempMonth === 'اسفند' && tempStartMonth === 'فروردین') {
      newStartYear = tempYear + 1;
    }
    const newStartMonthIdx = JALALI_MONTHS.indexOf(tempStartMonth);
    const newStartScore = newStartYear * 10000 + (newStartMonthIdx + 1) * 100 + tempStartDay;

    // 1. Core tasks (completed/failed -> archive)
    const archivedCoreTasks = (data.coreTasks || []).filter(t => t.status === 'completed' || t.status === 'failed');

    // 2. Secondary tasks (completed/failed -> archive)
    const archivedSecondaryTasks = (data.secondaryTasks || []).filter(t => t.status === 'completed' || t.status === 'failed');

    // 3. Daily tasks (completed/failed -> archive with dayKey)
    const archivedDailyTasks: { dayKey: string; tasks: DailyTask[] }[] = [];
    let archivedDailyCount = 0;
    if (data.dailyTasks && typeof data.dailyTasks === 'object') {
      Object.entries(data.dailyTasks).forEach(([dKey, taskList]) => {
        const moved = ((taskList as DailyTask[]) || []).filter(t => t.status === 'completed' || t.status === 'failed');
        if (moved.length > 0) {
          archivedDailyTasks.push({ dayKey: dKey, tasks: moved });
          archivedDailyCount += moved.length;
        }
      });
    }

    // 4. Details columns (manual items with completed=true and item.date -> archive)
    const archivedDetailItems: (DetailsItem & { columnId: string; columnTitle: string })[] = [];
    (data.detailsColumns || []).forEach(col => {
      (col.items || []).forEach(item => {
        const isSynced = item.id && (item.id.startsWith('task_core_') || item.id.startsWith('task_sec_'));
        if (!isSynced && !!item.completed && !!item.date) {
          archivedDetailItems.push({
            ...item,
            columnId: col.id,
            columnTitle: col.titleFa
          });
        }
      });
    });

    // 5. Exam columns (completed=true -> archive)
    const archivedExamItems: (DetailsItem & { columnId: string; columnTitle: string })[] = [];
    (data.examColumns || []).forEach(col => {
      (col.items || []).forEach(item => {
        if (item.completed) {
          archivedExamItems.push({
            ...item,
            columnId: col.id,
            columnTitle: col.titleFa
          });
        }
      });
    });

    // 6. Weekly events (completed=true -> archive)
    const archivedWeeklyEvents = (data.weeklyEvents || []).filter(e => e.completed);

    // 7. Postponed events (cancelled -> archive; postponed -> archive if newDate is before the new range start)
    const archivedPostponedEvents: PostponedEvent[] = [];
    (data.postponedEvents || []).forEach(pe => {
      if (pe.action === 'لغو شده' || pe.action?.includes('لغو')) {
        archivedPostponedEvents.push(pe);
      } else if (pe.action === 'به تعویق افتاده' || pe.action?.includes('تعویق')) {
        if (pe.newDate) {
          const cleanDate = toAsciiDigits(pe.newDate).trim();
          const parts = cleanDate.split(/[/.\-]/);
          if (parts.length === 3) {
            const py = parseInt(parts[0], 10);
            const pm = parseInt(parts[1], 10);
            const pd = parseInt(parts[2], 10);
            if (!isNaN(py) && !isNaN(pm) && !isNaN(pd) && pm >= 1 && pm <= 12) {
              const postScore = py * 10000 + pm * 100 + pd;
              if (postScore < newStartScore) {
                archivedPostponedEvents.push(pe);
              }
            }
          }
        }
      }
    });

    // Restore pass: postponed records archived earlier whose newDate is still current/future
    const restorableFromArchive: PostponedEvent[] = [];
    const activePostponedIds = new Set((data.postponedEvents || []).map(p => p.id));
    (data.archive || []).forEach(week => {
      (week.items?.postponedEvents || []).forEach(pe => {
        if (activePostponedIds.has(pe.id)) return;
        if (pe.action === 'لغو شده' || pe.action?.includes('لغو')) return;
        if (!(pe.action === 'به تعویق افتاده' || pe.action?.includes('تعویق'))) return;
        if (!pe.newDate) return;
        const cleanDate = toAsciiDigits(pe.newDate).trim();
        const parts = cleanDate.split(/[/.\-]/);
        if (parts.length !== 3) return;
        const py = parseInt(parts[0], 10);
        const pm = parseInt(parts[1], 10);
        const pd = parseInt(parts[2], 10);
        if (isNaN(py) || isNaN(pm) || isNaN(pd) || pm < 1 || pm > 12) return;
        const postScore = py * 10000 + pm * 100 + pd;
        if (postScore >= newStartScore) {
          restorableFromArchive.push(pe);
        }
      });
    });

    // 8. Todo list (completed=true -> archive)
    const archivedTodoList = (data.todoList || []).filter(t => t.completed);

    // 9. Reminders / Habits (completed -> archive)
    const archivedReminders = (data.reminders || []).filter(r => r.isCompleted || (r.progress !== undefined && r.progress >= 100));

    // 10. Goal Tasks (completed -> archive)
    const archivedGoalTasks: any[] = [];
    (data.goals || []).forEach(g => {
      (g.active_week_tasks || []).forEach(t => {
        if (t.completed) {
          archivedGoalTasks.push({ ...t, goalId: g.goal_id, goalTitle: g.title });
        }
      });
    });

    const totalArchivedCount =
      archivedCoreTasks.length +
      archivedSecondaryTasks.length +
      archivedDailyCount +
      archivedDetailItems.length +
      archivedExamItems.length +
      archivedWeeklyEvents.length +
      archivedPostponedEvents.length +
      archivedTodoList.length +
      archivedReminders.length +
      archivedGoalTasks.length;

    setData(prev => {
      // 1. Filter core tasks (keep pending)
      const filteredCoreTasks = (prev.coreTasks || []).filter(t => t.status !== 'completed' && t.status !== 'failed');

      // 2. Filter secondary tasks (keep pending)
      const filteredSecondaryTasks = (prev.secondaryTasks || []).filter(t => t.status !== 'completed' && t.status !== 'failed');

      // 3. Filter daily tasks (keep pending)
      const filteredDailyTasks: { [dayKey: string]: DailyTask[] } = {};
      if (prev.dailyTasks && typeof prev.dailyTasks === 'object') {
        Object.entries(prev.dailyTasks).forEach(([dKey, taskList]) => {
          filteredDailyTasks[dKey] = ((taskList as DailyTask[]) || []).filter(t => t.status !== 'completed' && t.status !== 'failed');
        });
      }

      // 4. Filter details columns (remove archived manual completed items)
      const archivedDetailIdSet = new Set(archivedDetailItems.map(d => d.id));
      const filteredDetailsColumns = (prev.detailsColumns || []).map(col => {
        const remaining = (col.items || []).filter(it => !archivedDetailIdSet.has(it.id));
        return { ...col, items: remaining };
      });

      // 5. Filter exam columns (remove completed)
      const archivedExamIdSet = new Set(archivedExamItems.map(e => e.id));
      const filteredExamColumns = (prev.examColumns || []).map(col => {
        const remaining = (col.items || []).filter(it => !archivedExamIdSet.has(it.id));
        return { ...col, items: remaining };
      });

      // 6. Filter weekly events (keep incomplete)
      const filteredWeeklyEvents = (prev.weeklyEvents || []).filter(e => !e.completed);

      // 7. Filter postponed events (remove archived)
      const archivedPostponedIdSet = new Set(archivedPostponedEvents.map(p => p.id));
      const filteredPostponedEvents = (prev.postponedEvents || []).filter(p => !archivedPostponedIdSet.has(p.id));

      // 8. Filter todo list (keep incomplete)
      const filteredTodoList = (prev.todoList || []).filter(t => !t.completed);

      // 9. Reset habit trackers for new week
      const filteredReminders = (prev.reminders || []).map(r => ({
        ...r,
        isCompleted: false,
        progress: 0,
        completedDays: [false, false, false, false, false, false, false]
      }));

      // Construct ArchiveWeek object
      const startLabel = `${oldStartDay} ${oldStartMonth} ${oldStartYear}`;
      const endLabel = `${oldEndDay} ${oldEndMonth} ${oldEndYear}`;
      const weekId = `week_${oldStartYear}_${oldStartMonth}_${oldStartDay}_to_${oldEndDay}_${oldEndMonth}`;

      const newArchiveWeek: ArchiveWeek = {
        weekId,
        startLabel,
        endLabel,
        startDay: oldStartDay,
        startMonth: oldStartMonth,
        startYear: oldStartYear,
        endDay: oldEndDay,
        endMonth: oldEndMonth,
        endYear: oldEndYear,
        archivedAt: new Date().toISOString(),
        items: {
          coreTasks: archivedCoreTasks,
          secondaryTasks: archivedSecondaryTasks,
          dailyTasks: archivedDailyTasks,
          detailItems: archivedDetailItems,
          examItems: archivedExamItems,
          weeklyEvents: archivedWeeklyEvents,
          postponedEvents: archivedPostponedEvents,
          todoList: archivedTodoList,
          reminders: archivedReminders,
          goalTasks: archivedGoalTasks
        }
      };

      // Add to archive and cap at 12 weeks
      const restorableIdSet = new Set(restorableFromArchive.map(p => p.id));
      let currentArchive = (prev.archive || []).map(week => {
        const hasRestorable = (week.items?.postponedEvents || []).some(p => restorableIdSet.has(p.id));
        if (!hasRestorable) return week;
        return { ...week, items: { ...week.items, postponedEvents: (week.items.postponedEvents || []).filter(p => !restorableIdSet.has(p.id)) } };
      });
      // Avoid duplicate archive entry for the exact same weekId if already present
      currentArchive = currentArchive.filter(w => w.weekId !== weekId);
      currentArchive.push(newArchiveWeek);

      if (currentArchive.length > 12) {
        const excess = currentArchive.length - 12;
        console.log(`[Archive Maintenance] Pruned ${excess} oldest archived week(s) exceeding 12-week limit.`);
        currentArchive = currentArchive.slice(excess);
      }

      let startYear = tempYear;
      let endYear = tempYear;

      if (tempMonth === 'اسفند' && tempStartMonth === 'فروردین') {
        startYear = tempYear + 1;
      }
      if (tempMonth === 'اسفند' && tempEndMonth === 'فروردین') {
        endYear = tempYear + 1;
      }

      let monthStr = '';
      if (startYear !== endYear) {
        monthStr = `${tempStartDay} ${tempStartMonth} ${startYear} تا ${tempEndDay} ${tempEndMonth} ${endYear}`;
      } else if (tempStartMonth !== tempEndMonth) {
        monthStr = `${tempStartDay} ${tempStartMonth} تا ${tempEndDay} ${tempEndMonth} ${startYear}`;
      } else {
        monthStr = `${tempStartDay} تا ${tempEndDay} ${tempStartMonth} ${startYear}`;
      }

      // NOTE1: Archive non-empty notes for ended week
      const notesEntry = (prev.notes || '').trim() !== ''
        ? buildNotesArchiveEntry(oldStartYear, oldStartMonth, oldStartDay, oldEndYear, oldEndMonth, oldEndDay, prev.notes)
        : null;
      const updatedNotesArchive = notesEntry
        ? upsertNotesArchiveEntry(prev.notesArchive || [], notesEntry)
        : (prev.notesArchive || []);

      return {
        ...prev,
        weekStartDay: tempStartDay,
        weekEndDay: tempEndDay,
        weekYear: startYear,
        weekEndYear: endYear,
        weekMonth: tempStartMonth,
        weekEndMonth: tempEndMonth,
        month: monthStr,
        coreTasks: filteredCoreTasks,
        secondaryTasks: filteredSecondaryTasks,
        dailyTasks: filteredDailyTasks,
        detailsColumns: filteredDetailsColumns,
        examColumns: filteredExamColumns,
        weeklyEvents: filteredWeeklyEvents,
        postponedEvents: [...filteredPostponedEvents, ...restorableFromArchive],
        todoList: filteredTodoList,
        reminders: filteredReminders,
        archive: currentArchive,
        notesArchive: updatedNotesArchive
      };
    });

    setIsCalendarRangeOpen(false);
    showToast('تقویم هفتگی ثبت شد و کارهای انجام‌شده/لغوشده به آرشیو منتقل شدند!');
  };

  // Dynamic status filtering for Classes slots
  const isSlotFilteredOut = (slot: ClassSlot) => {
    const status = data.activeClassStatus || "همه کلاس ها فعال";
    if (status === "همه کلاس ها فعال") return false;
    if (status === "همه کلاس ها غیر فعال") return true;
    if (status === "فقط کلاس دانشگاه فعال") return slot.categoryId !== "university";
    if (status === "فقط کلاس زبان فعال") return slot.categoryId !== "language";
    
    // Dynamic matching for custom classes status
    if (status.startsWith("فقط کلاس ")) {
      const targetCatName = status.replace("فقط کلاس ", "").replace(" فعال", "").trim();
      const category = data.categories.find(c => c.id === slot.categoryId);
      if (category) {
        if (category.nameFa.includes(targetCatName)) return false;
      }
      return true;
    }
    return false;
  };

  // Edit Class Slot (Trigger modal)
  const handleEditClassSlot = (dayKey: string, slotIdOrRow: string | number) => {
    let existing = null;
    if (typeof slotIdOrRow === 'string') {
      existing = data.classesSchedule.find((s) => s.id === slotIdOrRow);
    }

    if (existing) {
      setEditingSlot(existing);
    } else {
      const existingRows = data.classesSchedule.filter(s => s.dayKey === dayKey).map(s => s.row);
      let nextRow = typeof slotIdOrRow === 'number' ? slotIdOrRow : 1;
      while (existingRows.includes(nextRow)) {
        nextRow++;
      }
      setEditingSlot({
        id: `slot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        row: nextRow,
        dayKey,
        textFa: '',
        textEn: '',
        timeFa: '08:00 تا 10:00',
        timeEn: '08:00 to 10:00',
        categoryId: 'university',
      });
    }
    setIsSlotModalOpen(true);
  };

  // Save Class Slot from Modal
  const saveClassSlot = (updated: ClassSlot) => {
    setData((prev) => {
      const filtered = prev.classesSchedule.filter((s) => s.id !== updated.id);
      return {
        ...prev,
        classesSchedule: [...filtered, updated],
      };
    });
    setIsSlotModalOpen(false);
    setEditingSlot(null);
    showToast('تغییرات کلاس ذخیره شد');
  };

  // Delete Class Slot
  const deleteClassSlot = (id: string) => {
    setData((prev) => ({
      ...prev,
      classesSchedule: prev.classesSchedule.filter((s) => s.id !== id),
    }));
    setIsSlotModalOpen(false);
    setEditingSlot(null);
    showToast('کلاس حذف شد');
  };

  // Edit Daily Task (Trigger modal)
  const handleEditDailyTaskClick = (dayKey: string, taskIndex: number, task: DailyTask) => {
    if (!editMode) return;
    setEditingDailyTask({ dayKey, taskIndex, task });
    setIsDailyTaskModalOpen(true);
  };

  // Save Daily Task from Modal
  const saveDailyTask = (updated: DailyTask) => {
    if (!editingDailyTask) return;
    const { dayKey, taskIndex } = editingDailyTask;
    
    setData((prev) => {
      const dayTasks = [...(prev.dailyTasks[dayKey] || [])];
      dayTasks[taskIndex] = updated;
      return {
        ...prev,
        dailyTasks: {
          ...prev.dailyTasks,
          [dayKey]: dayTasks,
        },
      };
    });
    setIsDailyTaskModalOpen(false);
    setEditingDailyTask(null);
    showToast('تغییرات کار روزانه اعمال شد');
  };

  // Add Empty Daily Task inline
  const handleAddEmptyDailyTask = (dayKey: string) => {
    const newTask: DailyTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      textFa: 'کار جدید دانشگاه یا زبان',
      textEn: 'New task',
      categoryId: 'university',
      status: 'pending',
    };
    setData((prev) => {
      const dayTasks = [...(prev.dailyTasks[dayKey] || []), newTask];
      return {
        ...prev,
        dailyTasks: {
          ...prev.dailyTasks,
          [dayKey]: dayTasks,
        },
      };
    });
    showToast('کار روزانه جدید افزوده شد');
  };

  // Toggle Daily Task Status (with Exact completion Date selector)
  const handleToggleDailyTaskStatus = (dayKey: string, taskIndex: number) => {
    handleSetDailyTaskStatus(dayKey, taskIndex, 'completed');
  };

  const handleSetDailyTaskStatus = (dayKey: string, taskIndex: number, nextStatus: 'completed' | 'failed' | 'pending') => {
    if (editMode) return;
    const currentTask = data.dailyTasks[dayKey]?.[taskIndex];
    if (!currentTask) return;

    if (nextStatus === 'completed') {
      if (currentTask.status === 'completed') {
        setData((prev) => {
          const dayTasks = [...(prev.dailyTasks[dayKey] || [])];
          dayTasks[taskIndex] = {
            ...dayTasks[taskIndex],
            status: 'pending',
            completionDate: undefined
          };
          return {
            ...prev,
            dailyTasks: {
              ...prev.dailyTasks,
              [dayKey]: dayTasks,
            },
          };
        });
        showToast('کار به وضعیت در حال انتظار بازگشت');
      } else {
        setCompletionTarget({
          type: 'daily',
          dayKey,
          taskIndex
        });
      }
    } else if (nextStatus === 'failed') {
      setData((prev) => {
        const dayTasks = [...(prev.dailyTasks[dayKey] || [])];
        const currentStatus = dayTasks[taskIndex].status;
        const status = currentStatus === 'failed' ? 'pending' : 'failed';
        dayTasks[taskIndex] = {
          ...dayTasks[taskIndex],
          status,
          completionDate: undefined
        };
        return {
          ...prev,
          dailyTasks: {
            ...prev.dailyTasks,
            [dayKey]: dayTasks,
          },
        };
      });
      showToast(currentTask.status === 'failed' ? 'کار به وضعیت در حال انتظار بازگشت' : 'کار به عنوان انجام نشده (ضربدر) ثبت شد');
    } else {
      setData((prev) => {
        const dayTasks = [...(prev.dailyTasks[dayKey] || [])];
        dayTasks[taskIndex] = {
          ...dayTasks[taskIndex],
          status: 'pending',
          completionDate: undefined
        };
        return {
          ...prev,
          dailyTasks: {
            ...prev.dailyTasks,
            [dayKey]: dayTasks,
          },
        };
      });
      showToast('کار به وضعیت در حال انتظار بازگشت');
    }
  };

  const handleSetCoreTaskStatus = (taskId: string, nextStatus: 'completed' | 'failed' | 'pending') => {
    const currentTask = (data.coreTasks || []).find((ct) => ct.id === taskId);
    if (!currentTask) return;

    if (currentTask.status === nextStatus || nextStatus === 'pending') {
      setData((prev) => {
        const updated = (prev.coreTasks || []).map((ct) => {
          if (ct.id === taskId) {
            return { ...ct, status: 'pending', completionDate: undefined };
          }
          return ct;
        });
        return { ...prev, coreTasks: updated };
      });
      showToast('کار اصلی به وضعیت در حال انتظار بازگشت');
      return;
    }

    if (nextStatus === 'completed') {
      setCompletionTarget({
        type: 'core',
        taskId
      });
    } else {
      setData((prev) => {
        const updated = (prev.coreTasks || []).map((ct) => {
          if (ct.id === taskId) {
            return { ...ct, status: 'failed', completionDate: undefined };
          }
          return ct;
        });
        return { ...prev, coreTasks: updated };
      });
      showToast('کار اصلی لغو/ناموفق ثبت شد');
    }
  };

  const saveCoreTaskCompletion = (exactDate: string) => {
    if (!completionTarget || !completionTarget.taskId) return;
    const { taskId } = completionTarget;

    setData((prev) => {
      const updated = (prev.coreTasks || []).map((ct) => {
        if (ct.id === taskId) {
          const overdue = getDeadlineOverdueStatus(ct.deadline, prev.weekYear);
          return {
            ...ct,
            status: 'completed' as const,
            completionDate: exactDate,
            completedAt: new Date().toISOString(),
            completedLate: overdue.isOverdue
          };
        }
        return ct;
      });
      return { ...prev, coreTasks: updated };
    });
    setCompletionTarget(null);
    showToast('کار اصلی به عنوان انجام شده ثبت شد');
  };

  const saveDailyTaskCompletion = (exactDate: string) => {
    if (!completionTarget || !completionTarget.dayKey || completionTarget.taskIndex === undefined) return;
    const { dayKey, taskIndex } = completionTarget;

    setData((prev) => {
      const dayTasks = [...(prev.dailyTasks[dayKey] || [])];
      dayTasks[taskIndex] = {
        ...dayTasks[taskIndex],
        status: 'completed',
        completionDate: exactDate
      };
      return {
        ...prev,
        dailyTasks: {
          ...prev.dailyTasks,
          [dayKey]: dayTasks,
        },
      };
    });
    setCompletionTarget(null);
    showToast('کار روزانه انجام شد! تاریخ ثبت شد.');
  };

  // Delete Daily Task in Edit Mode (with shifting up)
  const handleDeleteDailyTask = (dayKey: string, taskId: string) => {
    setData((prev) => {
      const dayTasks = (prev.dailyTasks[dayKey] || []).filter((task) => task.id !== taskId);
      return {
        ...prev,
        dailyTasks: {
          ...prev.dailyTasks,
          [dayKey]: dayTasks,
        },
      };
    });
    setIsDailyTaskModalOpen(false);
    setEditingDailyTask(null);
    showToast('کار روزانه حذف شد و کارهای بعدی بالا آمدند');
  };

  // --- Dynamic Column Management for All Tables ---
  
  // Weekly Days Columns (Tab 1 & Tab 4)
  const handleDeleteDayColumn = (dayKey: string) => {
    setData((prev) => {
      const currentKeys = prev.activeDayKeys || ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      const updatedKeys = currentKeys.filter((k) => k !== dayKey);
      return { ...prev, activeDayKeys: updatedKeys };
    });
    showToast('ستون روز با موفقیت حذف شد');
  };

  const handleAddDayColumn = (dayKey: string) => {
    setData((prev) => {
      const currentKeys = prev.activeDayKeys || ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      if (currentKeys.includes(dayKey)) return prev;
      const ordered = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      const updatedKeys = ordered.filter((k) => currentKeys.includes(k) || k === dayKey);
      return { ...prev, activeDayKeys: updatedKeys };
    });
    showToast('ستون روز با موفقیت اضافه شد');
  };

  // Details Columns (Tab 2)
  const handleDeleteDetailsColumn = (columnId: string) => {
    setData((prev) => ({
      ...prev,
      detailsColumns: prev.detailsColumns.filter((col) => col.id !== columnId),
    }));
    showToast('ستون ددلاین با موفقیت حذف شد');
  };

  const handleAddDetailsColumn = () => {
    const newColId = `dc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCol = {
      id: newColId,
      titleFa: 'ستون ددلاین جدید',
      titleEn: 'New Deadline Column',
      items: [],
    };
    setData((prev) => ({
      ...prev,
      detailsColumns: [...prev.detailsColumns, newCol],
    }));
    showToast('ستون ددلاین جدید اضافه شد');
  };

  // Exams & Presentations (Tab 11) Handlers
  const handleDeleteExamColumn = (columnId: string) => {
    setData((prev) => ({
      ...prev,
      examColumns: (prev.examColumns || []).filter((col) => col.id !== columnId),
    }));
    showToast('ستون امتحانات با موفقیت حذف شد');
  };

  const handleAddExamColumn = () => {
    const newColId = `ec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCol = {
      id: newColId,
      titleFa: 'دسته‌بندی جدید امتحانات و ارائه‌ها',
      titleEn: 'New Exams Category',
      items: [],
    };
    setData((prev) => ({
      ...prev,
      examColumns: [...(prev.examColumns || []), newCol],
    }));
    showToast('ستون امتحانات جدید اضافه شد');
  };

  const handleEditExamHeader = (colId: string, value: string) => {
    setData((prev) => {
      const columns = (prev.examColumns || []).map((col) => {
        if (col.id === colId) {
          return {
            ...col,
            titleFa: value,
          };
        }
        return col;
      });
      return { ...prev, examColumns: columns };
    });
  };

  const handleAddExamItem = (columnId: string, itemData: { text: string; date?: string; type?: string; description?: string; emailReminder?: boolean; reminderOffset?: ReminderOffset }) => {
    if (!itemData.text.trim()) return;
    const newItem = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: itemData.text.trim(),
      date: itemData.date || `${data.weekYear || getTodayJalali().year}/03/15 10:00`,
      type: itemData.type || 'امتحان',
      description: itemData.description,
      completed: false,
      emailReminder: itemData.emailReminder !== false,
      reminderOffset: itemData.reminderOffset || data.emailReminderDefaultOffset || '1day',
    };

    setData((prev) => {
      const cols = (prev.examColumns || []).map((col) => {
        if (col.id === columnId) {
          return {
            ...col,
            items: [...col.items, newItem],
          };
        }
        return col;
      });
      return { ...prev, examColumns: cols };
    });
    showToast('امتحان / ارائه جدید ثبت شد');
  };

  const handleToggleExamItem = (columnId: string, itemId: string) => {
    setData((prev) => {
      const cols = (prev.examColumns || []).map((col) => {
        if (col.id === columnId) {
          const items = col.items.map((item) => {
            if (item.id === itemId) {
              return { ...item, completed: !item.completed };
            }
            return item;
          });
          return { ...col, items };
        }
        return col;
      });
      return { ...prev, examColumns: cols };
    });
  };

  const handleDeleteExamItem = (columnId: string, itemId: string) => {
    setData((prev) => {
      const cols = (prev.examColumns || []).map((col) => {
        if (col.id === columnId) {
          return {
            ...col,
            items: col.items.filter((item) => item.id !== itemId),
          };
        }
        return col;
      });
      return { ...prev, examColumns: cols };
    });
    showToast('مورد با موفقیت حذف شد');
  };

  // Secondary Task Columns (Tab 3)
  const handleDeleteSecondaryColumn = (columnId: string) => {
    setData((prev) => ({
      ...prev,
      secondaryTaskColumns: prev.secondaryTaskColumns.filter((col) => col.id !== columnId),
      secondaryTasks: prev.secondaryTasks.filter((t) => t.columnId !== columnId),
    }));
    showToast('ستون کارهای فرعی با موفقیت حذف شد');
  };

  const handleAddSecondaryColumn = () => {
    const newColId = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCol = {
      id: newColId,
      titleFa: 'دسته‌بندی جدید کارهای فرعی',
      titleEn: 'New Secondary Column',
    };
    setData((prev) => ({
      ...prev,
      secondaryTaskColumns: [...prev.secondaryTaskColumns, newCol],
    }));
    showToast('ستون کارهای فرعی جدید اضافه شد');
  };

  const getSecondaryColumnColor = (id: string) => {
    const colObj = data.secondaryTaskColumns.find(c => c.id === id);
    if (colObj && colObj.color) {
      return colObj.color;
    }
    switch (id) {
      case 'daily':
        return 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200';
      case 'learn':
        return 'bg-emerald-100 border-emerald-350 text-emerald-950 hover:bg-emerald-200/80';
      case 'english':
        return 'bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200';
      case 'skill':
        return 'bg-purple-100 border-purple-300 text-purple-900 hover:bg-purple-200';
      case 'reading':
        return 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200';
      case 'migration':
        return 'bg-rose-100 border-rose-350 text-rose-950 hover:bg-rose-200';
      case 'leisure':
        return 'bg-pink-100 border-pink-300 text-pink-900 hover:bg-pink-200';
      default:
        return 'bg-indigo-50 border-indigo-200 text-indigo-950 hover:bg-indigo-100';
    }
  };

  const handleEditSecondaryColumnHeader = (colId: string, title: string) => {
    setData((prev) => {
      const updated = prev.secondaryTaskColumns.map((col) => {
        if (col.id === colId) {
          return { ...col, titleFa: title };
        }
        return col;
      });
      return { ...prev, secondaryTaskColumns: updated };
    });
  };

  // Category management callbacks
  const handleCategoryUpdate = (updated: Category) => {
    setData((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.id === updated.id ? updated : c)),
    }));
  };

  const handleAddCategory = (newCat: Category) => {
    setData((prev) => ({
      ...prev,
      categories: [...prev.categories, newCat],
    }));
    showToast('دسته‌بندی جدید اضافه شد');
  };

  const handleDeleteCategory = (catId: string) => {
    setData((prev) => {
      const remainingCats = prev.categories.filter((c) => c.id !== catId);
      const updatedClasses = prev.classesSchedule.map(s => s.categoryId === catId ? { ...s, categoryId: undefined } : s);
      const updatedCore = (prev.coreTasks || []).map(t => t.categoryId === catId ? { ...t, categoryId: '' } : t);
      const updatedSecondary = prev.secondaryTasks.map(t => t.categoryId === catId ? { ...t, categoryId: undefined } : t);
      const updatedPostponed = (prev.postponedEvents || []).map(p => p.categoryId === catId ? { ...p, categoryId: undefined } : p);
      
      const updatedDailyTasks: Record<string, DailyTask[]> = {};
      Object.entries(prev.dailyTasks || {}).forEach(([dayKey, tasks]) => {
        const taskArray = (tasks || []) as DailyTask[];
        updatedDailyTasks[dayKey] = taskArray.map(t => t.categoryId === catId ? { ...t, categoryId: undefined } : t);
      });

      return {
        ...prev,
        categories: remainingCats,
        classesSchedule: updatedClasses,
        coreTasks: updatedCore,
        secondaryTasks: updatedSecondary,
        postponedEvents: updatedPostponed,
        dailyTasks: updatedDailyTasks
      };
    });
    showToast('دسته‌بندی با موفقیت حذف شد و ارجاعات پاکسازی شدند');
  };

  // Details Columns (Page 2) Actions
  const handleAddDeadlineItem = (colId: string) => {
    const newItem: DetailsItem = {
      id: `det_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: 'مورد ددلاین جدید',
      date: undefined
    };
    setData((prev) => {
      const columns = prev.detailsColumns.map((col) => {
        if (col.id === colId) {
          return { ...col, items: [...col.items, newItem] };
        }
        return col;
      });
      return { ...prev, detailsColumns: columns };
    });
  };

  const handleEditDeadlineItem = (colId: string, itemId: string, textValue: string, dateValue?: string, descriptionValue?: string) => {
    setData((prev) => {
      const columns = prev.detailsColumns.map((col) => {
        if (col.id === colId) {
          const updatedItems = col.items.map((item) => {
            if (item.id === itemId) {
              return {
                ...item,
                text: textValue,
                date: dateValue !== undefined ? dateValue : item.date,
                description: descriptionValue !== undefined ? descriptionValue : item.description
              };
            }
            return item;
          });
          return { ...col, items: updatedItems };
        }
        return col;
      });
      return { ...prev, detailsColumns: columns };
    });
  };

  const handleDeleteDeadlineItem = (colId: string, itemId: string) => {
    setData((prev) => {
      const columns = prev.detailsColumns.map((col) => {
        if (col.id === colId) {
          return {
            ...col,
            items: col.items.filter((item) => item.id !== itemId),
          };
        }
        return col;
      });
      return { ...prev, detailsColumns: columns };
    });
    showToast('مورد حذف شد');
  };

  const handleUpdateSyncedTaskField = (taskId: string, type: 'core' | 'sec', field: string, value: string) => {
    setData((prev) => {
      if (type === 'core') {
        const updated = (prev.coreTasks || []).map((task) => {
          if (task.id === taskId) {
            return { ...task, [field]: value };
          }
          return task;
        });
        return { ...prev, coreTasks: updated };
      } else {
        const updated = (prev.secondaryTasks || []).map((task) => {
          if (task.id === taskId) {
            return { ...task, [field]: value };
          }
          return task;
        });
        return { ...prev, secondaryTasks: updated };
      }
    });
  };

  const handleUpdateSyncedTaskDeadline = (taskId: string, type: 'core' | 'sec', field: 'day' | 'month' | 'weekday' | 'year', value: string) => {
    setData((prev) => {
      const defaultYear = prev.weekYear || getTodayJalali().year;
      if (type === 'core') {
        const updated = (prev.coreTasks || []).map((task) => {
          if (task.id === taskId) {
            const currentDeadline = task.deadline || {};
            const targetYear = (field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.year) || defaultYear;
            const nextMonth = field === 'month' ? (value || undefined) : currentDeadline.month;
            let nextDay = field === 'day' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.day;

            if (nextMonth && nextDay) {
              const maxDays = getDaysInJalaliMonth(nextMonth, targetYear);
              if (nextDay > maxDays) {
                nextDay = maxDays;
              }
            }

            let autoWeekday: string | undefined = undefined;
            if (nextDay && nextMonth) {
              const mIdx = JALALI_MONTHS.indexOf(nextMonth);
              if (mIdx !== -1) {
                const jw = getJalaliWeekday(targetYear, mIdx + 1, nextDay);
                autoWeekday = jw?.weekday?.fa;
              }
            }

            const updatedDeadline = {
              ...currentDeadline,
              year: field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : (currentDeadline.year || defaultYear),
              month: nextMonth,
              day: nextDay,
              weekday: autoWeekday
            };
            return { ...task, deadline: updatedDeadline };
          }
          return task;
        });
        return { ...prev, coreTasks: updated };
      } else {
        const updated = (prev.secondaryTasks || []).map((task) => {
          if (task.id === taskId) {
            const currentDeadline = task.deadline || {};
            const targetYear = (field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.year) || defaultYear;
            const nextMonth = field === 'month' ? (value || undefined) : currentDeadline.month;
            let nextDay = field === 'day' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.day;

            if (nextMonth && nextDay) {
              const maxDays = getDaysInJalaliMonth(nextMonth, targetYear);
              if (nextDay > maxDays) {
                nextDay = maxDays;
              }
            }

            let autoWeekday: string | undefined = undefined;
            if (nextDay && nextMonth) {
              const mIdx = JALALI_MONTHS.indexOf(nextMonth);
              if (mIdx !== -1) {
                const jw = getJalaliWeekday(targetYear, mIdx + 1, nextDay);
                autoWeekday = jw?.weekday?.fa;
              }
            }

            const updatedDeadline = {
              ...currentDeadline,
              year: field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : (currentDeadline.year || defaultYear),
              month: nextMonth,
              day: nextDay,
              weekday: autoWeekday
            };
            return { ...task, deadline: updatedDeadline };
          }
          return task;
        });
        return { ...prev, secondaryTasks: updated };
      }
    });
  };

  const handleEditSyncedTaskDeadlineYear = (taskId: string, type: 'core' | 'sec', yearValue: any) => {
    handleUpdateSyncedTaskDeadline(taskId, type, 'year', String(yearValue));
  };

  const handleDeleteSyncedTask = (taskId: string, type: 'core' | 'sec') => {
    setData((prev) => {
      if (type === 'core') {
        return {
          ...prev,
          coreTasks: (prev.coreTasks || []).filter(t => t.id !== taskId)
        };
      } else {
        return {
          ...prev,
          secondaryTasks: (prev.secondaryTasks || []).filter(t => t.id !== taskId)
        };
      }
    });
    showToast('کار با موفقیت حذف شد');
  };

  const handleEditDeadlineHeader = (colId: string, value: string) => {
    setData((prev) => {
      const columns = prev.detailsColumns.map((col) => {
        if (col.id === colId) {
          return {
            ...col,
            titleFa: value,
          };
        }
        return col;
      });
      return { ...prev, detailsColumns: columns };
    });
  };

  // Secondary Tasks (Page 5) Actions
  const handleAddSecondaryTask = (columnId: string) => {
    const newTask: SecondaryTask = {
      id: `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      columnId,
      textFa: 'کار فکری جدید',
      textEn: 'New task',
      status: 'pending',
    };
    setData((prev) => ({
      ...prev,
      secondaryTasks: [...prev.secondaryTasks, newTask],
    }));
  };

  const handleEditSecondaryTaskText = (taskId: string, value: string) => {
    setData((prev) => {
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, textFa: value };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
  };

  const handleDeleteSecondaryTask = (taskId: string) => {
    setData((prev) => ({
      ...prev,
      secondaryTasks: prev.secondaryTasks.filter((t) => t.id !== taskId),
    }));
    showToast('کار فکری حذف شد');
  };

  const handleToggleSecondaryTaskStatus = (taskId: string, newStatus: 'completed' | 'failed') => {
    if (editMode) return;
    const currentTask = data.secondaryTasks.find((t) => t.id === taskId);
    if (!currentTask) return;

    // If the task already has the clicked status, toggle it back to 'pending'
    if (currentTask.status === newStatus) {
      setData((prev) => {
        const tasks = prev.secondaryTasks.map((t) => {
          if (t.id === taskId) {
            return { ...t, status: 'pending', completionDate: undefined };
          }
          return t;
        });
        return { ...prev, secondaryTasks: tasks };
      });
      showToast('کار به وضعیت در حال انتظار بازگشت');
      return;
    }

    if (newStatus === 'completed') {
      setCompletionTarget({
        type: 'secondary',
        taskId
      });
    } else {
      setData((prev) => {
        const tasks = prev.secondaryTasks.map((t) => {
          if (t.id === taskId) {
            return { ...t, status: 'failed', completionDate: undefined };
          }
          return t;
        });
        return { ...prev, secondaryTasks: tasks };
      });
      showToast('کار فکری لغو/ناموفق ثبت شد');
    }
  };

  const saveSecondaryTaskCompletion = (exactDate: string) => {
    if (!completionTarget || !completionTarget.taskId) return;
    const { taskId } = completionTarget;

    setData((prev) => {
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          const overdue = getDeadlineOverdueStatus(t.deadline, prev.weekYear);
          return {
            ...t,
            status: 'completed' as const,
            completionDate: exactDate,
            completedAt: new Date().toISOString(),
            completedLate: overdue.isOverdue
          };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
    setCompletionTarget(null);
    showToast('کار فکری انجام شد! تاریخ ثبت شد.');
  };

  // --- Core Tasks (Tab 6) Actions ---
  const handleToggleCoreTaskStatus = (taskId: string) => {
    const currentTask = (data.coreTasks || []).find((ct) => ct.id === taskId);
    if (!currentTask) return;

    if (currentTask.status === 'completed') {
      setData((prev) => {
        const updated = (prev.coreTasks || []).map((ct) => {
          if (ct.id === taskId) {
            return { ...ct, status: 'pending', completionDate: undefined };
          }
          return ct;
        });
        return { ...prev, coreTasks: updated };
      });
      showToast('کار اصلی به وضعیت در حال انتظار بازگشت');
    } else {
      setCompletionTarget({
        type: 'core',
        taskId
      });
    }
  };

  const handleAddCoreTask = (categoryId: string) => {
    const newTask = {
      id: `ct_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      categoryId,
      title: 'کار اصلی جدید',
      description: 'توضیحات کار اصلی را اینجا بنویسید...',
      status: 'pending' as const
    };
    setData((prev) => ({
      ...prev,
      coreTasks: [...(prev.coreTasks || []), newTask]
    }));
    showToast('کار اصلی جدید اضافه شد');
  };

  const handleEditCoreTaskText = (taskId: string, title: string) => {
    setData((prev) => {
      const updated = (prev.coreTasks || []).map((ct) => {
        if (ct.id === taskId) {
          return { ...ct, title };
        }
        return ct;
      });
      return { ...prev, coreTasks: updated };
    });
  };

  const handleEditCoreTaskDesc = (taskId: string, description: string) => {
    setData((prev) => {
      const updated = (prev.coreTasks || []).map((ct) => {
        if (ct.id === taskId) {
          return { ...ct, description };
        }
        return ct;
      });
      return { ...prev, coreTasks: updated };
    });
  };

  const handleDeleteCoreTask = (taskId: string) => {
    setData((prev) => ({
      ...prev,
      coreTasks: (prev.coreTasks || []).filter((ct) => ct.id !== taskId)
    }));
    showToast('کار اصلی حذف شد');
  };

  const handleEditCoreTaskLink = (taskId: string, link: string) => {
    setData((prev) => {
      const updated = (prev.coreTasks || []).map((ct) => {
        if (ct.id === taskId) {
          return { ...ct, link };
        }
        return ct;
      });
      return { ...prev, coreTasks: updated };
    });
  };

  const handleEditCoreTaskLinkTitle = (taskId: string, linkTitle: string) => {
    setData((prev) => {
      const updated = (prev.coreTasks || []).map((ct) => {
        if (ct.id === taskId) {
          return { ...ct, linkTitle };
        }
        return ct;
      });
      return { ...prev, coreTasks: updated };
    });
  };

  const handleEditCoreTaskDeadline = (taskId: string, field: 'day' | 'month' | 'weekday' | 'year', value: any) => {
    setData((prev) => {
      const defaultYear = prev.weekYear || getTodayJalali().year;
      const updated = (prev.coreTasks || []).map((ct) => {
        if (ct.id === taskId) {
          const currentDeadline = ct.deadline || {};
          const targetYear = (field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.year) || defaultYear;
          const nextMonth = field === 'month' ? (value || undefined) : currentDeadline.month;
          let nextDay = field === 'day' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.day;

          if (nextMonth && nextDay) {
            const maxDays = getDaysInJalaliMonth(nextMonth, targetYear);
            if (nextDay > maxDays) {
              nextDay = maxDays;
            }
          }

          let autoWeekday: string | undefined = undefined;
          if (nextDay && nextMonth) {
            const mIdx = JALALI_MONTHS.indexOf(nextMonth);
            if (mIdx !== -1) {
              const jw = getJalaliWeekday(targetYear, mIdx + 1, nextDay);
              autoWeekday = jw?.weekday?.fa;
            }
          }

          return {
            ...ct,
            deadline: {
              ...currentDeadline,
              year: field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : (currentDeadline.year || defaultYear),
              month: nextMonth,
              day: nextDay,
              weekday: autoWeekday
            },
          };
        }
        return ct;
      });
      return { ...prev, coreTasks: updated };
    });
  };

  const handleEditCoreTaskDeadlineYear = (taskId: string, yearValue: any) => {
    handleEditCoreTaskDeadline(taskId, 'year', yearValue);
  };

  const handleEditSecondaryTaskLink = (taskId: string, link: string) => {
    setData((prev) => {
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, link };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
  };

  const handleEditSecondaryTaskLinkTitle = (taskId: string, linkTitle: string) => {
    setData((prev) => {
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, linkTitle };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
  };

  const handleEditSecondaryTaskDesc = (taskId: string, description: string) => {
    setData((prev) => {
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, description };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
  };

  const handleEditSecondaryTaskDeadline = (taskId: string, field: 'day' | 'month' | 'weekday' | 'year', value: any) => {
    setData((prev) => {
      const defaultYear = prev.weekYear || getTodayJalali().year;
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          const currentDeadline = t.deadline || {};
          const targetYear = (field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.year) || defaultYear;
          const nextMonth = field === 'month' ? (value || undefined) : currentDeadline.month;
          let nextDay = field === 'day' ? (value ? parseInt(value, 10) || undefined : undefined) : currentDeadline.day;

          if (nextMonth && nextDay) {
            const maxDays = getDaysInJalaliMonth(nextMonth, targetYear);
            if (nextDay > maxDays) {
              nextDay = maxDays;
            }
          }

          let autoWeekday: string | undefined = undefined;
          if (nextDay && nextMonth) {
            const mIdx = JALALI_MONTHS.indexOf(nextMonth);
            if (mIdx !== -1) {
              const jw = getJalaliWeekday(targetYear, mIdx + 1, nextDay);
              autoWeekday = jw?.weekday?.fa;
            }
          }

          return {
            ...t,
            deadline: {
              ...currentDeadline,
              year: field === 'year' ? (value ? parseInt(value, 10) || undefined : undefined) : (currentDeadline.year || defaultYear),
              month: nextMonth,
              day: nextDay,
              weekday: autoWeekday
            },
          };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
  };

  const handleEditSecondaryTaskDeadlineYear = (taskId: string, yearValue: any) => {
    handleEditSecondaryTaskDeadline(taskId, 'year', yearValue);
  };

  const handleEditSecondaryTaskCategory = (taskId: string, categoryId: string) => {
    setData((prev) => {
      const tasks = prev.secondaryTasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, categoryId: categoryId || undefined };
        }
        return t;
      });
      return { ...prev, secondaryTasks: tasks };
    });
  };

  const handleReorderCoreTask = (taskId: string, direction: 'up' | 'down') => {
    setData((prev) => {
      const allTasks = [...(prev.coreTasks || [])];
      const task = allTasks.find(t => t.id === taskId);
      if (!task) return prev;

      const categoryId = task.categoryId;
      // Get indices of all tasks in the same category
      const catIndices = allTasks
        .map((t, idx) => ({ t, idx }))
         .filter(item => item.t.categoryId === categoryId);

      const matchIndex = catIndices.findIndex(item => item.t.id === taskId);
      if (matchIndex === -1) return prev;

      let swapWithIdx = -1;
      if (direction === 'up' && matchIndex > 0) {
        swapWithIdx = matchIndex - 1;
      } else if (direction === 'down' && matchIndex < catIndices.length - 1) {
        swapWithIdx = matchIndex + 1;
      }

      if (swapWithIdx !== -1) {
        const currentGlobalIdx = catIndices[matchIndex].idx;
        const targetGlobalIdx = catIndices[swapWithIdx].idx;

        // Swap elements in allTasks
        const temp = allTasks[currentGlobalIdx];
        allTasks[currentGlobalIdx] = allTasks[targetGlobalIdx];
        allTasks[targetGlobalIdx] = temp;
      }

      return { ...prev, coreTasks: allTasks };
    });
    showToast('ترتیب کار جابجا شد');
  };

  const handleReorderSecondaryTask = (taskId: string, direction: 'up' | 'down') => {
    setData((prev) => {
      const allTasks = [...(prev.secondaryTasks || [])];
      const task = allTasks.find(t => t.id === taskId);
      if (!task) return prev;

      const columnId = task.columnId;
      const colIndices = allTasks
        .map((t, idx) => ({ t, idx }))
        .filter(item => item.t.columnId === columnId);

      const matchIndex = colIndices.findIndex(item => item.t.id === taskId);
      if (matchIndex === -1) return prev;

      let swapWithIdx = -1;
      if (direction === 'up' && matchIndex > 0) {
        swapWithIdx = matchIndex - 1;
      } else if (direction === 'down' && matchIndex < colIndices.length - 1) {
        swapWithIdx = matchIndex + 1;
      }

      if (swapWithIdx !== -1) {
        const currentGlobalIdx = colIndices[matchIndex].idx;
        const targetGlobalIdx = colIndices[swapWithIdx].idx;

        const temp = allTasks[currentGlobalIdx];
        allTasks[currentGlobalIdx] = allTasks[targetGlobalIdx];
        allTasks[targetGlobalIdx] = temp;
      }

      return { ...prev, secondaryTasks: allTasks };
    });
    showToast('ترتیب کار فرعی جابجا شد');
  };

  // Habits (Page 8) Actions
  const handleAddHabit = () => {
    const newHabit: ReminderItem = {
      id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      textFa: 'عادت یا یادآوری جدید',
      textEn: 'New habit',
      checkedDays: [],
      frequency: 'every_day',
      targetCount: 1
    };
    setData((prev) => ({
      ...prev,
      reminders: [...prev.reminders, newHabit],
    }));
    showToast('عادت جدید ساخته شد');
  };

  const handleDeleteHabit = (id: string) => {
    setData((prev) => ({
      ...prev,
      reminders: prev.reminders.filter((r) => r.id !== id),
    }));
    showToast('عادت حذف شد');
  };

  const handleEditHabitText = (id: string, value: string) => {
    setData((prev) => {
      const list = prev.reminders.map((r) => {
        if (r.id === id) {
          return { ...r, textFa: value };
        }
        return r;
      });
      return { ...prev, reminders: list };
    });
  };

  const handleEditHabitFrequency = (id: string, frequency: ReminderFrequency) => {
    setData((prev) => {
      const list = prev.reminders.map((r) => {
        if (r.id === id) {
          const hasTarget = ['every_day', 'every_other_day', 'even_days', 'odd_days'].includes(frequency);
          return {
            ...r,
            frequency,
            targetCount: hasTarget ? (r.targetCount || 1) : 1
          };
        }
        return r;
      });
      return { ...prev, reminders: list };
    });
  };

  const handleToggleHabitDay = (habitId: string, dayKey: string) => {
    if (editMode) return;
    setData((prev) => {
      const list = prev.reminders.map((r) => {
        if (r.id === habitId) {
          const target = r.targetCount || 1;
          const currentProgress = (r.dayProgress && r.dayProgress[dayKey]) || 0;
          
          const currentChecked = r.checkedDays || [];
          if (target <= 1) {
            const isChecked = currentChecked.includes(dayKey);
            const nextDays = isChecked
              ? currentChecked.filter((d) => d !== dayKey)
              : [...currentChecked, dayKey];
            return {
              ...r,
              checkedDays: nextDays,
              dayProgress: { ...(r.dayProgress || {}), [dayKey]: isChecked ? 0 : 1 }
            };
          } else {
            const nextProgress = currentProgress + 1;
            let nextDays = currentChecked.filter((d) => d !== dayKey);
            let updatedProgressMap = { ...(r.dayProgress || {}) };
            
            if (nextProgress > target) {
              delete updatedProgressMap[dayKey];
            } else {
              updatedProgressMap[dayKey] = nextProgress;
              if (nextProgress === target) {
                nextDays = [...nextDays, dayKey];
              }
            }
            
            return {
              ...r,
              checkedDays: nextDays,
              dayProgress: updatedProgressMap
            };
          }
        }
        return r;
      });
      return { ...prev, reminders: list };
    });
  };

  const handleEditHabitTarget = (id: string, target: number) => {
    setData((prev) => {
      const list = prev.reminders.map((r) => {
        if (r.id === id) {
          return { ...r, targetCount: target };
        }
        return r;
      });
      return { ...prev, reminders: list };
    });
  };

  const handleNotesChange = (val: string) => {
    setData((prev) => ({
      ...prev,
      notes: val,
    }));
  };

  // NOTE1: Pure helper to build NotesArchiveEntry
  function buildNotesArchiveEntry(
    startYear: number,
    startMonth: string,
    startDay: number,
    endYear: number,
    endMonth: string,
    endDay: number,
    text: string
  ): NotesArchiveEntry {
    return {
      weekId: `week_${startYear}_${startMonth}_${startDay}_to_${endDay}_${endMonth}`,
      startLabel: `${startDay} ${startMonth} ${startYear}`,
      endLabel: `${endDay} ${endMonth} ${endYear}`,
      text,
      archivedAt: new Date().toISOString()
    };
  }

  // NOTE1: Pure helper to upsert NotesArchiveEntry into notesArchive list with 104-entry limit
  function upsertNotesArchiveEntry(list: NotesArchiveEntry[], entry: NotesArchiveEntry): NotesArchiveEntry[] {
    let updated = (list || []).filter(item => item.weekId !== entry.weekId);
    updated.push(entry);
    if (updated.length > 104) {
      updated.sort((a, b) => new Date(a.archivedAt).getTime() - new Date(b.archivedAt).getTime());
      const excess = updated.length - 104;
      console.log(`[Notes Archive Maintenance] Pruned ${excess} oldest notes archive entry/entries exceeding 104-entry limit.`);
      updated = updated.slice(excess);
    }
    return updated;
  }

  // Generate numbers 1 to 31 depending on month
  const getDaysInMonth = (monthName: string, year: number = tempYear) => {
    return getDaysInJalaliMonth(monthName, year);
  };

  const currentDaysCount = getDaysInMonth(tempMonth);

  // Generate 7 week dates for completion helper
  const getWeekDates = () => {
    const list = [];
    const start = data.weekStartDay || 1;
    const end = data.weekEndDay || 7;
    const startMonth = data.weekMonth || 'خرداد';
    const endMonth = data.weekEndMonth || startMonth;
    const year = data.weekYear || getTodayJalali().year;

    const daysInStartMonth = getDaysInMonth(startMonth, year);

    // Absolute start and end coordinates
    const absStart = start;
    const absEnd = startMonth === endMonth ? end : (daysInStartMonth + end);

    for (let i = 0; i < 7; i++) {
      const clampedAbs = Math.min(absStart + i, absEnd);
      if (clampedAbs <= daysInStartMonth) {
        list.push(`${clampedAbs} ${startMonth}`);
      } else {
        list.push(`${clampedAbs - daysInStartMonth} ${endMonth}`);
      }
    }
    return list;
  };

  const weekDates = getWeekDates();
  const activeDaysList = data.activeDayKeys || ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  // Completed Page (Page 3) items aggregator
  const getCompletedWeeklyTasks = (catId: string) => {
    const list: { text: string; date?: string }[] = [];
    
    // Check Daily Tasks
    Object.keys(data.dailyTasks).forEach((dayKey) => {
      const tasks = data.dailyTasks[dayKey] || [];
      tasks.forEach((task) => {
        if (task.status === 'completed' && task.categoryId === catId && task.textFa) {
          list.push({
            text: task.textFa,
            date: task.completionDate
          });
        }
      });
    });

    // Check Core Tasks
    if (Array.isArray(data.coreTasks)) {
      data.coreTasks.forEach((ct) => {
        if (ct.status === 'completed' && ct.categoryId === catId && ct.title) {
          list.push({
            text: ct.title,
            date: 'مهم اصلی'
          });
        }
      });
    }

    // Check Secondary Tasks if category aligns
    const columnIdMap: { [key: string]: string } = {
      'sport': 'leisure',
      'language': 'english',
      'programming': 'skill',
      'university': 'daily'
    };
    const matchingCol = columnIdMap[catId];
    if (matchingCol) {
      data.secondaryTasks.forEach((st) => {
        if (st.status === 'completed' && st.columnId === matchingCol && st.textFa) {
          if (!st.completionDate || isDateInCurrentPlannerWeek(st.completionDate, data)) {
            list.push({
              text: st.textFa,
              date: st.completionDate
            });
          }
        }
      });
    }

    return list;
  };

  // Incomplete Page (Page 4) items aggregator
  const getIncompleteWeeklyTasks = (catId: string) => {
    const list: string[] = [];
    Object.keys(data.dailyTasks).forEach((dayKey) => {
      const tasks = data.dailyTasks[dayKey] || [];
      tasks.forEach((task) => {
        if (task.status === 'pending' && task.categoryId === catId && task.textFa) {
          list.push(task.textFa);
        }
      });
    });

    if (Array.isArray(data.coreTasks)) {
      data.coreTasks.forEach((ct) => {
        if (ct.status === 'pending' && ct.categoryId === catId && ct.title) {
          list.push(ct.title);
        }
      });
    }

    return list;
  };

  return (
    <div 
      className={`min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans transition-all ${
        lang === 'fa' ? 'rtl text-right' : 'ltr text-left'
      } ${isExportingPDF ? 'pdf-export-mode' : ''}`} 
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
      style={{ direction: lang === 'fa' ? 'rtl' : 'ltr' }}
    >
      
      {/* --- Session Management & Recovery Utility --- */}
      <SessionManager
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        data={data}
        setData={setData}
        onSyncData={handleSyncData}
        onLoadData={handleLoadData}
        showToast={showToast}
        authFailureStatus={authFailureStatus}
        setAuthFailureStatus={setAuthFailureStatus}
        pendingSyncData={pendingSyncData}
        setPendingSyncData={setPendingSyncData}
        setIsCriticalAuthFailure={setIsCriticalAuthFailure}
        lang={lang}
      />
      
      {/* --- Top Alert Toast --- */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '50%' }}
            animate={{ opacity: 1, y: 16, x: '50%' }}
            exit={{ opacity: 0, y: -50, x: '50%' }}
            className={`fixed top-4 right-1/2 translate-x-1/2 z-50 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-black text-sm border transition-all ${
              toastType === 'error' ? 'bg-red-600 border-red-500' : 'bg-emerald-600 border-emerald-500'
            }`}
          >
            {toastType === 'error' ? (
              <AlertCircle className="w-5 h-5 animate-bounce text-white ml-1" />
            ) : (
              <CheckCircle2 className="w-5 h-5 animate-bounce text-white ml-1" />
            )}
            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- App Header --- */}
      {!isExportingPDF && (
        <Header
          isEditMode={editMode}
          setIsEditMode={setEditMode}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          lang={lang}
          activeTab={activeTab}
          currentUser={currentUser}
          onOpenProfileModal={() => setIsProfileModalOpen(true)}
          onOpenDayInspector={() => setIsDayInspectorOpen(true)}
          syncStatus={syncStatus}
        />
      )}

      {/* --- Sidebar Drawer (Overlay style with Backdrop) --- */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 cursor-pointer"
            />

            {/* Sliding Drawer Container */}
            <motion.div
              initial={{ x: lang === 'fa' ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: lang === 'fa' ? '100%' : '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className={`fixed top-0 ${lang === 'fa' ? 'right-0 border-l' : 'left-0 border-r'} h-full w-80 sm:w-96 bg-white z-50 shadow-2xl border-slate-200/80 flex flex-col`}
            >
              <Sidebar
                isEditMode={editMode}
                data={data}
                setData={setData}
                onOpenCalendarRange={() => {
                  setTempYear(data.weekYear || getTodayJalali().year);
                  setTempMonth(data.weekMonth || 'خرداد');
                  setTempStartDay(data.weekStartDay || 1);
                  setTempStartMonth(data.weekMonth || 'خرداد');
                  setTempEndDay(data.weekEndDay || 7);
                  setTempEndMonth(data.weekEndMonth || data.weekMonth || 'خرداد');
                  setIsCalendarRangeOpen(true);
                }}
                onOpenProfileModal={() => {
                  setIsSidebarOpen(false);
                  setIsProfileModalOpen(true);
                }}
                onReset={handleReset}
                onImport={handleImportFile}
                onExport={handleExport}
                onExportPDF={handleExportPDF}
                onClose={() => setIsSidebarOpen(false)}
                onUndo={undo}
                onRedo={redo}
                canUndo={past.length > 0}
                canRedo={future.length > 0}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                showSettingsPage={showSettingsPage}
                setShowSettingsPage={setShowSettingsPage}
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                onSyncData={handleSyncData}
                onLoadData={handleLoadData}
                showToast={showToast}
                lang={lang}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- Main Workspace Layout: Spans entire horizontal width when sidebar is hidden --- */}
      <div className={`max-w-7xl w-full mx-auto flex flex-col gap-6 items-start flex-grow ${isExportingPDF ? 'p-0 max-w-none w-auto' : 'p-4 sm:p-6 lg:p-8'}`}>
        
        {/* Dynamic Workspace Area */}
        <main className="w-full flex flex-col gap-6">

          {/* Edit Mode Alert Hint */}
          {editMode && !isExportingPDF && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-800 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  {lang === 'fa' 
                    ? "⚠️ شما در حالت ویرایش هستید. امکان تغییر مستقیم ساعت و اطلاعات کلاس‌ها، روزها، تعداد ردیف‌ها، نام جدول‌ها، اهداف و حذف موارد فعال شد."
                    : "⚠️ You are in Edit Mode. Direct customization of hours, class details, day keys, row counts, table names, daily goals, and items is enabled."}
                </span>
              </div>
            </motion.div>
          )}

          {showSettingsPage ? (
            <SettingsPage
              data={data}
              setData={setData}
              editMode={editMode}
              onImport={handleImportFile}
              onExport={handleExport}
              onExportPDF={handleExportPDF}
              onReset={handleReset}
              onClose={() => setShowSettingsPage(false)}
              currentUser={currentUser}
              lang={lang}
              setLang={setLang}
              isCriticalAuthFailure={isCriticalAuthFailure}
              weekDates={weekDates}
              showToast={showToast}
            />
          ) : (
            /* PDF Capture Wrapper */
            <div 
              id="pdf-capture-area" 
              className={isExportingPDF ? `w-[1100px] min-w-[1100px] bg-[#f8fafc] p-8 rounded-3xl border border-slate-200 font-sans ${lang === 'fa' ? 'text-right' : 'text-left'}` : "w-full"} 
              dir={lang === 'fa' ? 'rtl' : 'ltr'}
            >

          {/* Tab 1: Classes Schedule & Daily Tasks */}
          {activeTab === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
               {/* Motivational quote banner */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 bg-gradient-to-tr from-amber-400 to-orange-500 text-white rounded-xl flex items-center justify-center shadow-xs shrink-0 font-bold">
                    💡
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs text-slate-400 font-bold text-right">جمله انگیزشی هفته</h4>
                    {editMode ? (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <input
                          type="text"
                          value={data.quoteText}
                          onChange={(e) => setData({ ...data, quoteText: e.target.value })}
                          className="text-xs font-bold text-slate-700 bg-amber-50 border border-amber-200 rounded p-1 flex-1 min-w-[200px] focus:outline-none"
                          dir={isPersianText(data.quoteText) ? 'rtl' : 'ltr'}
                        />
                        <input
                          type="text"
                          value={data.quoteAuthor}
                          onChange={(e) => setData({ ...data, quoteAuthor: e.target.value })}
                          className="text-xs font-bold text-slate-400 bg-amber-50 border border-amber-200 rounded p-1 w-28 focus:outline-none"
                          dir={isPersianText(data.quoteAuthor) ? 'rtl' : 'ltr'}
                        />
                      </div>
                    ) : (
                      <p 
                        className="text-xs font-black text-slate-700 italic mt-0.5 leading-relaxed"
                        dir={isPersianText(data.quoteText) ? 'rtl' : 'ltr'}
                        style={{ textAlign: isPersianText(data.quoteText) ? 'right' : 'left' }}
                      >
                        "{data.quoteText}" - <span className="text-indigo-600 font-bold" dir={isPersianText(data.quoteAuthor) ? 'rtl' : 'ltr'}>{data.quoteAuthor}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>


              {/* Table 1: Classes Schedule */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Vertical Sidebar Header */}
                <div className="bg-gradient-to-b from-blue-600 to-indigo-700 text-white py-6 px-4 md:w-16 shrink-0 flex items-center justify-center border-l md:border-l-0 md:border-b-0 border-slate-200 md:rounded-r-none rounded-t-3xl md:rounded-r-3xl">
                  <span
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent || "";
                      setData(prev => ({ ...prev, classesTitle: newText }));
                    }}
                    className={`text-sm font-black tracking-widest md:[writing-mode:vertical-rl] md:rotate-180 text-center uppercase ${
                      editMode ? 'bg-black/20 outline-none border border-dashed border-white/50 rounded px-1 py-3 cursor-text' : ''
                    }`}
                  >
                    {data.classesTitle || "برنامه کلاس‌ها"}
                  </span>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-5 overflow-x-auto">
                  
                  {/* Dynamic classes header section */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      {editMode ? (
                        <input
                          type="text"
                          value={data.classesTitle || "برنامه کلاس‌های دانشگاه و کلاس زبان"}
                          onChange={(e) => setData({ ...data, classesTitle: e.target.value })}
                          className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-64"
                        />
                      ) : (
                        <h2 className="font-black text-slate-800 text-xs">
                          {data.classesTitle || "برنامه کلاس‌های دانشگاه و کلاس زبان"}
                        </h2>
                      )}
                    </div>

                    {/* Day & Row Column Controllers */}
                    {editMode && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Day Column Adder */}
                        {DAYS_OF_WEEK.some(d => !activeDaysList.includes(d.key)) && (
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1.5 rounded-xl text-[10px] font-bold shadow-xs">
                            <span className="text-slate-400">افزودن ستون روز:</span>
                            <div className="flex gap-1">
                              {DAYS_OF_WEEK.filter(d => !activeDaysList.includes(d.key)).map(day => (
                                <button
                                  key={day.key}
                                  type="button"
                                  onClick={() => handleAddDayColumn(day.key)}
                                  className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[9px] font-black cursor-pointer transition-all"
                                >
                                  + {day.fa}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1.5 rounded-xl shadow-xs">
                          <span className="text-[10px] text-slate-400 font-bold px-1.5">ردیف‌ها: {data.classRows || 4}</span>
                          <button
                            type="button"
                            onClick={() => setData(prev => ({ ...prev, classRows: Math.min(12, (prev.classRows || 4) + 1) }))}
                            className="w-5.5 h-5.5 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-black cursor-pointer"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => setData(prev => ({ ...prev, classRows: Math.max(1, (prev.classRows || 4) - 1) }))}
                            className="w-5.5 h-5.5 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-black cursor-pointer"
                          >
                            -
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <table className="w-full min-w-[700px] border-collapse text-center">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-3 border-l border-slate-200 text-xs w-[50px] font-black">ردیف</th>
                        {DAYS_OF_WEEK.filter(d => activeDaysList.includes(d.key)).map((day) => (
                          <th key={day.key} className="p-3 border-l border-slate-200 text-xs font-black">
                            <div className="flex items-center justify-center gap-1">
                              <span>{day.fa}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: data.classRows || 4 }, (_, i) => i + 1).map((rowNum) => (
                        <tr key={rowNum} className="border-b border-slate-100 hover:bg-slate-50/40">
                          <td className="p-3 bg-slate-50/50 font-black text-xs text-slate-500 border-l border-slate-200">
                            {rowNum}
                          </td>
                          {DAYS_OF_WEEK.filter(d => activeDaysList.includes(d.key)).map((day) => {
                            const dayConcreteDate = getConcreteDateForDayKey(day.key, data);
                            const daySlots = data.classesSchedule.filter(
                              (s) => s.dayKey === day.key && getClassOccurrenceState(s, dayConcreteDate, data) !== 'not-this-week'
                            );
                            const sortedDaySlots = [...daySlots].sort(compareClassesByTime);
                            const slot = sortedDaySlots[rowNum - 1];
                            const category = slot ? data.categories.find((c) => c.id === slot.categoryId) : null;
                            const isFiltered = slot ? isSlotFilteredOut(slot) : false;
                            const occState = slot ? getClassOccurrenceState(slot, dayConcreteDate, data) : 'scheduled';
                            const isCancelled = occState === 'cancelled';
                            const cancelledNote = isCancelled && slot && slot.cancelledOccurrences
                              ? slot.cancelledOccurrences.find(co => co.date && toEnglishDigits(co.date).replace(/[.-]/g, '/') === toEnglishDigits(dayConcreteDate).replace(/[.-]/g, '/'))?.note
                              : undefined;

                            return (
                              <td
                                key={day.key}
                                onClick={() => editMode && handleEditClassSlot(day.key, slot ? slot.id : rowNum)}
                                className={`p-2.5 border-l border-slate-200 text-right align-top min-w-[100px] h-[75px] relative ${
                                  editMode ? 'hover:bg-amber-50/40 cursor-pointer transition-colors' : ''
                                }`}
                              >
                                {slot && slot.textFa ? (
                                  <div
                                    onClick={(e) => {
                                      if (!editMode) {
                                        e.stopPropagation();
                                        handleEditClassSlot(day.key, slot.id);
                                      }
                                    }}
                                    className={`p-2 rounded-xl border text-xs flex flex-col justify-between h-full shadow-xs transition-all cursor-pointer ${
                                      isCancelled
                                        ? 'opacity-60 bg-rose-50/70 border-rose-300 text-slate-500'
                                        : (category ? category.color : 'bg-slate-100 border-slate-200 text-slate-700')
                                    } ${isFiltered ? 'opacity-25 pointer-events-none' : 'hover:-translate-y-0.5'}`}
                                  >
                                    <div>
                                      <div className="flex items-center justify-between gap-1 mb-0.5">
                                        <div className={`font-bold leading-tight line-clamp-2 ${isCancelled ? 'line-through text-slate-500' : ''}`}>
                                          {slot.textFa}
                                        </div>
                                        {isCancelled && (
                                          <span className="text-[8px] font-black bg-rose-100 text-rose-700 px-1 py-0.5 rounded shrink-0">
                                            لغو شده
                                          </span>
                                        )}
                                      </div>
                                      {isCancelled && cancelledNote && (
                                        <div className="text-[8px] text-rose-600 font-bold truncate mt-0.5 italic">
                                          {cancelledNote}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-[9px] text-slate-500 font-bold border-t border-slate-200/40 pt-1">
                                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{slot.timeFa}</span>
                                    </div>
                                  </div>
                                ) : (
                                  editMode && (
                                    <div className="absolute inset-2 border border-dashed border-slate-200 hover:border-indigo-400 rounded-xl flex items-center justify-center text-[10px] text-slate-400 hover:text-indigo-600 transition-colors">
                                      + کلاس جدید
                                    </div>
                                  )
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Daily Tasks Checklist */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Vertical Sidebar Header */}
                <div className="bg-gradient-to-b from-amber-500 to-orange-600 text-white py-6 px-4 md:w-16 shrink-0 flex items-center justify-center border-l md:border-l-0 md:border-b-0 border-slate-200 md:rounded-r-none rounded-t-3xl md:rounded-r-3xl">
                  <span
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent || "";
                      setData(prev => ({ ...prev, dailyTasksTitle: newText }));
                    }}
                    className={`text-sm font-black tracking-widest md:[writing-mode:vertical-rl] md:rotate-180 text-center uppercase ${
                      editMode ? 'bg-black/20 outline-none border border-dashed border-white/50 rounded px-1 py-3 cursor-text' : ''
                    }`}
                  >
                    {data.dailyTasksTitle || "برنامه کارهای روزانه"}
                  </span>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-5 overflow-x-auto">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                    {editMode ? (
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={data.dailyTasksTitle || "کارهایی که باید انجام شود (روزانه)"}
                          onChange={(e) => setData({ ...data, dailyTasksTitle: e.target.value })}
                          className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-64"
                        />
                      </div>
                    ) : (
                      <h2 className="font-black text-slate-800 text-xs">
                        {data.dailyTasksTitle || "کارهایی که باید انجام شود (روزانه)"}
                      </h2>
                    )}

                    {editMode && (
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1.5 rounded-xl shadow-xs">
                        <span className="text-[10px] text-slate-400 font-bold px-1.5">ردیف‌ها: {data.dailyTaskRows || 3}</span>
                        <button
                          type="button"
                          onClick={() => setData(prev => ({ ...prev, dailyTaskRows: Math.min(12, (prev.dailyTaskRows || 3) + 1) }))}
                          className="w-5.5 h-5.5 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-black cursor-pointer"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => setData(prev => ({ ...prev, dailyTaskRows: Math.max(1, (prev.dailyTaskRows || 3) - 1) }))}
                          className="w-5.5 h-5.5 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-black cursor-pointer"
                        >
                          -
                        </button>
                      </div>
                    )}
                  </div>

                  <table className="w-full min-w-[700px] border-collapse text-center">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-3 border-l border-slate-200 text-xs w-[50px] font-black">ردیف</th>
                        {DAYS_OF_WEEK.filter(d => activeDaysList.includes(d.key)).map((day) => (
                          <th key={day.key} className="p-3 border-l border-slate-200 text-xs font-black">
                            <div className="flex items-center justify-center gap-1">
                              <span>{day.fa}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: data.dailyTaskRows || 3 }, (_, i) => i).map((taskRowIdx) => (
                        <tr key={taskRowIdx} className="border-b border-slate-100 hover:bg-slate-50/40">
                          <td className="p-3 bg-slate-50/50 font-black text-xs text-slate-500 border-l border-slate-200">
                            {taskRowIdx + 1}
                          </td>
                          {DAYS_OF_WEEK.filter(d => activeDaysList.includes(d.key)).map((day) => {
                            const tasks = data.dailyTasks[day.key] || [];
                            const task = tasks[taskRowIdx];
                            const category = task ? data.categories.find((c) => c.id === task.categoryId) : null;

                            return (
                              <td
                                key={day.key}
                                className="p-2 border-l border-slate-200 align-top min-w-[100px] h-[80px] relative"
                              >
                                {task ? (
                                  <div
                                    onClick={() => {
                                      if (editMode) {
                                        handleEditDailyTaskClick(day.key, taskRowIdx, task);
                                      } else {
                                        handleSetDailyTaskStatus(day.key, taskRowIdx, 'completed');
                                      }
                                    }}
                                    className={`p-2 rounded-xl border text-xs h-full shadow-xs flex flex-col justify-between text-right relative select-none cursor-pointer transition-all ${
                                      task.status === 'completed'
                                        ? 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                                        : task.status === 'failed'
                                        ? 'bg-rose-50 border-rose-200 text-rose-500 line-through'
                                        : category
                                        ? category.color
                                        : 'bg-white border-slate-200 text-slate-700'
                                    } ${editMode ? 'hover:bg-amber-100/50' : 'hover:-translate-y-0.5'}`}
                                  >
                                    <div className="flex items-start gap-2 text-right">
                                      {!editMode && (
                                        <div className="flex items-center gap-1 shrink-0">
                                          {/* Check/Tick */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSetDailyTaskStatus(day.key, taskRowIdx, 'completed');
                                            }}
                                            className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer shadow-xs mt-0.5 ${
                                              task.status === 'completed'
                                                ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                                                : 'bg-white border-slate-300 hover:border-emerald-500'
                                            }`}
                                            title="انجام شده"
                                          >
                                            {task.status === 'completed' && (
                                              <Check className="w-3 h-3 stroke-[3px]" />
                                            )}
                                          </button>

                                          {/* Cross/ضربدر */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSetDailyTaskStatus(day.key, taskRowIdx, 'failed');
                                            }}
                                            className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer shadow-xs mt-0.5 ${
                                              task.status === 'failed'
                                                ? 'bg-rose-50 border-rose-400 text-rose-600'
                                                : 'bg-white border-slate-300 hover:border-rose-500'
                                            }`}
                                            title="انجام نشده"
                                          >
                                            {task.status === 'failed' && (
                                              <X className="w-3 h-3 stroke-[3px]" />
                                            )}
                                          </button>
                                        </div>
                                      )}
                                      <div className="font-bold leading-snug line-clamp-2 flex-1">{task.textFa}</div>
                                    </div>
                                    
                                    {!editMode && (
                                      <span className="text-[8px] self-start mt-1 bg-white/60 px-1.5 py-0.5 rounded-md font-bold">
                                        {task.status === 'completed' ? `✓ ${task.completionDate}` : task.status === 'failed' ? '✗ ناموفق' : 'باقی‌مانده'}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  editMode && (
                                    <button
                                      onClick={() => handleAddEmptyDailyTask(day.key)}
                                      className="absolute inset-2 border border-dashed border-slate-200 hover:border-indigo-400 rounded-xl flex items-center justify-center text-[10px] text-slate-400 hover:text-indigo-600 transition-colors"
                                    >
                                      + افزودن کار
                                    </button>
                                  )
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>



            </div>
          )}

          {/* Tab 6: Core Tasks */}
          {activeTab === 6 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.coreTasksTitle || "برگه کارهای اصلی که باید انجام شوند"}
                        onChange={(e) => setData({ ...data, coreTasksTitle: e.target.value })}
                        className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-80"
                      />
                    ) : (
                      <h2 className="text-sm font-black text-slate-900">
                        {data.coreTasksTitle || "برگه کارهای اصلی که باید انجام شوند"}
                      </h2>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-bold">کارهای اصلی و حیاتی با توضیحات کامل بدون سرریز شدن متن</p>
                </div>
              </div>

              {/* Bento-style workspace */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Vertical Sidebar Header */}
                <div className="bg-gradient-to-b from-indigo-600 to-indigo-800 text-white py-6 px-4 md:w-16 shrink-0 flex items-center justify-center border-l md:border-l-0 md:border-b-0 border-slate-200 md:rounded-r-none rounded-t-3xl md:rounded-r-3xl">
                  <span
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent || "";
                      setData(prev => ({ ...prev, coreTasksTitle: newText }));
                    }}
                    className={`text-sm font-black tracking-widest md:[writing-mode:vertical-rl] md:rotate-180 text-center uppercase ${
                      editMode ? 'bg-black/20 outline-none border border-dashed border-white/50 rounded px-1 py-3 cursor-text' : ''
                    }`}
                  >
                    {data.coreTasksTitle || "برگه کارهای اصلی"}
                  </span>
                </div>

                {/* Table / List Workspace */}
                <div className="flex-1 p-5 md:p-6 space-y-6">
                  {data.categories.filter(c => c.id !== 'done' && c.id !== 'not_done').map((category) => {
                    const catTasks = (data.coreTasks || []).filter(t => t.categoryId === category.id);
                    const pendingTasks = catTasks.filter(t => t.status === 'pending' || !t.status);
                    const completedTasks = catTasks.filter(t => t.status === 'completed');
                    const failedTasks = catTasks.filter(t => t.status === 'failed');
                    
                    return (
                      <div key={category.id} className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs bg-slate-50/20">
                        {/* Category Header */}
                        <div className={`p-3 px-5 flex items-center justify-between border-b border-slate-200 ${category.color} ${category.textClass || 'text-slate-950'} font-black text-xs`}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                            <span>{category.nameFa}</span>
                          </div>
                          <span className="text-[10px] opacity-85 font-bold">{catTasks.length} کار اصلی</span>
                        </div>

                        {/* Category Tasks List */}
                        <div className="divide-y divide-slate-200 bg-white">
                          {catTasks.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-xs italic">
                              هیچ کار اصلی در این دسته‌بندی وجود ندارد.
                            </div>
                          ) : (
                            <>
                              {(() => {
                                const sortedTasks = [...catTasks].sort((a, b) => {
                                  const scoreA = a.status === 'pending' || !a.status ? 0 : 1;
                                  const scoreB = b.status === 'pending' || !b.status ? 0 : 1;
                                  return scoreA - scoreB;
                                });

                                return sortedTasks.map((task, visualIdx) => {
                                  const idx = catTasks.findIndex(t => t.id === task.id);
                                  const isDone = task.status === 'completed' || task.status === 'failed';

                                  return (
                                    <div 
                                      key={task.id} 
                                      className={`p-4 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                                        isDone ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50/20'
                                      }`}
                                    >
                                      {/* Checkbox and Text */}
                                      <div className="flex items-start gap-3.5 flex-grow min-w-0">
                                        <div className="flex flex-col items-center gap-1.5 shrink-0 mt-0.5">
                                          {/* Tick (Check) */}
                                          <button
                                            onClick={() => handleSetCoreTaskStatus(task.id, 'completed')}
                                            className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                                              task.status === 'completed'
                                                ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                                                : 'bg-white border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20'
                                            }`}
                                            title="انجام شده"
                                          >
                                            {task.status === 'completed' && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                                          </button>
                                          
                                          {/* Cross (ضربدر) */}
                                          <button
                                            onClick={() => handleSetCoreTaskStatus(task.id, 'failed')}
                                            className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                                              task.status === 'failed'
                                                ? 'bg-rose-50 border-rose-400 text-rose-600'
                                                : 'bg-white border-slate-300 hover:border-rose-500 hover:bg-rose-50/20'
                                            }`}
                                            title="انجام نشده"
                                          >
                                            {task.status === 'failed' && <X className="w-3.5 h-3.5 stroke-[3px]" />}
                                          </button>
                                        </div>

                                        {/* Content column with auto-numbering */}
                                        <div className="flex-grow min-w-0 space-y-1">
                                          {editMode ? (
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono text-slate-400 shrink-0 font-bold">
                                                  {visualIdx + 1}.
                                                </span>
                                                <input
                                                  type="text"
                                                  value={task.title}
                                                  onChange={(e) => handleEditCoreTaskText(task.id, e.target.value)}
                                                  className="w-full text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded p-1 px-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                />
                                              </div>
                                              <textarea
                                                value={task.description}
                                                onChange={(e) => handleEditCoreTaskDesc(task.id, e.target.value)}
                                                className="w-full text-[10px] text-slate-600 bg-amber-50 border border-amber-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 font-bold"
                                                rows={2}
                                              />
                                              {/* Link & Deadline selectors */}
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] text-slate-400 font-bold">لینک (اختیاری):</span>
                                                  <input
                                                    type="text"
                                                    value={task.link || ''}
                                                    onChange={(e) => handleEditCoreTaskLink(task.id, e.target.value)}
                                                    placeholder="https://example.com"
                                                    className="w-full text-[10px] text-slate-700 bg-amber-50 border border-amber-200 rounded p-1 focus:outline-none focus:ring-1 focus:ring-amber-300 font-mono"
                                                  />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] text-slate-400 font-bold">عنوان لینک (اختیاری):</span>
                                                  <input
                                                    type="text"
                                                    value={task.linkTitle || ''}
                                                    onChange={(e) => handleEditCoreTaskLinkTitle(task.id, e.target.value)}
                                                    placeholder="مثال: جزوه کلاس"
                                                    className="w-full text-[10px] text-slate-700 bg-amber-50 border border-amber-200 rounded p-1 focus:outline-none focus:ring-1 focus:ring-amber-300 font-bold"
                                                  />
                                                </div>
                                                
                                                <div className="flex flex-col gap-1 sm:col-span-2">
                                                  <span className="text-[9px] text-slate-400 font-bold">ددلاین (اختیاری):</span>
                                                  <div className="grid grid-cols-3 gap-1">
                                                    <select
                                                      value={task.deadline?.day || ''}
                                                      onChange={(e) => handleEditCoreTaskDeadline(task.id, 'day', e.target.value)}
                                                      className="text-[9px] bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 focus:outline-none"
                                                    >
                                                      <option value="" className="text-center">روز</option>
                                                      {Array.from({ length: task.deadline?.month ? getDaysInJalaliMonth(task.deadline.month, task.deadline?.year || data.weekYear || getTodayJalali().year) : 31 }, (_, i) => i + 1).map(d => (
                                                        <option key={d} value={d}>{d}</option>
                                                      ))}
                                                    </select>
                                                    <select
                                                      value={task.deadline?.month || ''}
                                                      onChange={(e) => handleEditCoreTaskDeadline(task.id, 'month', e.target.value)}
                                                      className="text-[9px] bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 focus:outline-none"
                                                    >
                                                      <option value="" className="text-center">ماه</option>
                                                      {PERSIAN_MONTHS.map(m => (
                                                        <option key={m} value={m}>{m}</option>
                                                      ))}
                                                    </select>
                                                    <select
                                                      value={task.deadline?.year || data.weekYear || getTodayJalali().year}
                                                      onChange={(e) => handleEditCoreTaskDeadline(task.id, 'year', e.target.value)}
                                                      className="text-[9px] bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 focus:outline-none text-center"
                                                    >
                                                      {YEARS_1400_TO_1430.map(y => (
                                                        <option key={y} value={y}>{y}</option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                  {task.deadline?.day && task.deadline?.month && (
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                      <span className="text-[8px] text-slate-400 font-bold">روز هفته:</span>
                                                      <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md">
                                                        {getWeekdayOfPersianDate(task.deadline?.year || data.weekYear || getTodayJalali().year, task.deadline.month, task.deadline.day)}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="space-y-1.5 text-right">
                                              <h4 className={`text-xs font-black flex flex-wrap items-center gap-2 ${
                                                isDone ? 'text-slate-400 line-through' : 'text-slate-800'
                                              }`}>
                                                <span className="text-slate-400 font-mono font-bold ml-1">{visualIdx + 1}.</span>
                                                <span>{task.title}</span>
                                                {task.link && (
                                                  <a
                                                    href={task.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`inline-flex items-center gap-1 text-[9px] hover:underline px-1.5 py-0.5 rounded-md font-bold font-sans transition-colors ${
                                                      isDone
                                                        ? 'text-indigo-400 bg-slate-100 hover:text-indigo-600 no-underline'
                                                        : 'text-indigo-600 bg-indigo-50 hover:text-indigo-800'
                                                    }`}
                                                  >
                                                    <Link2 className="w-2.5 h-2.5" />
                                                    <span>{task.linkTitle || 'مشاهده لینک'}</span>
                                                  </a>
                                                )}
                                              </h4>
                                              <p className={`text-[10px] font-medium leading-relaxed whitespace-pre-wrap break-words text-wrap max-w-full ${
                                                isDone ? 'text-slate-400 line-through' : 'text-slate-500'
                                              }`}>
                                                {task.description}
                                              </p>
                                              {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (() => {
                                                const overdue = getDeadlineOverdueStatus(task.deadline, task.deadline.year || tempYear);
                                                return (
                                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    <div className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                                      isDone
                                                        ? 'bg-slate-100 text-slate-500 border-slate-200/50 line-through'
                                                        : 'bg-amber-50 text-amber-800 border-amber-200/50'
                                                    }`}>
                                                      <span>⏰ ددلاین:</span>
                                                      <span>
                                                        {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, task.deadline.year || tempYear)}
                                                      </span>
                                                    </div>
                                                    {!isDone && overdue.isOverdue && (
                                                      <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border bg-rose-50 text-rose-800 border-rose-300">
                                                        ⚠️ سرسید گذشته ({toPersianDigits(overdue.daysOverdue)} روز عقب‌افتاده)
                                                      </span>
                                                    )}
                                                    {task.completedLate && (
                                                      <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300">
                                                        ⚠️ انجام شده (دیرهنگام)
                                                      </span>
                                                    )}
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Order & Actions Controls */}
                                      <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                                        <div className="flex flex-col gap-1">
                                          {/* Move Up */}
                                          <button
                                            onClick={() => handleReorderCoreTask(task.id, 'up')}
                                            disabled={idx === 0}
                                            className="p-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded disabled:opacity-40 disabled:pointer-events-none text-[9px] font-bold cursor-pointer"
                                            title="انتقال به بالا"
                                          >
                                            ▲
                                          </button>
                                          {/* Move Down */}
                                          <button
                                            onClick={() => handleReorderCoreTask(task.id, 'down')}
                                            disabled={idx === catTasks.length - 1}
                                            className="p-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded disabled:opacity-40 disabled:pointer-events-none text-[9px] font-bold cursor-pointer"
                                            title="انتقال به پایین"
                                          >
                                            ▼
                                          </button>
                                        </div>

                                        {/* Delete in editMode */}
                                        {editMode && (
                                          <button
                                            onClick={() => handleDeleteCoreTask(task.id)}
                                            className="p-1 px-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-600 rounded text-[9px] font-bold flex items-center gap-0.5 cursor-pointer self-center"
                                          >
                                            <Trash2 className="w-3 h-3 ml-0.5" />
                                            حذف
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </>
                          )}
                        </div>

                        {/* Add task button for this category (Only in Edit Mode) */}
                        {editMode && (
                          <div className="bg-slate-50/50 p-2.5 border-t border-slate-150 flex justify-center">
                            <button
                              onClick={() => handleAddCoreTask(category.id)}
                              className="flex items-center gap-1 px-4 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-xl text-[10px] font-black text-indigo-700 transition-all cursor-pointer shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>افزودن کار اصلی به {category.nameFa}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>

            </div>
          )}

          {/* Tab 2: Details & Deadlines */}
          {activeTab === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.detailsTitle || "توضیحات و ددلاین‌های تفکیک‌شده کارهای هفتگی"}
                        onChange={(e) => setData({ ...data, detailsTitle: e.target.value })}
                        className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-80"
                      />
                    ) : (
                      <h2 className="text-sm font-black text-slate-900">
                        {data.detailsTitle || "توضیحات و ددلاین‌های تفکیک‌شده کارهای هفتگی"}
                      </h2>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-xs text-slate-400 font-bold hidden md:block">نمای کلی ددلاین‌ها و اولویت‌های این هفته</p>
                    <div className="h-4 w-[1px] bg-slate-200 hidden md:block"></div>
                    <button
                      onClick={() => setDetailsSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl text-[10px] font-black border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                      <span>ترتیب ددلاین‌ها:</span>
                      <span className="text-blue-600 font-bold">
                        {detailsSortOrder === 'asc' ? 'صعودی به نزولی' : 'نزولی به صعودی'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Vertical Sidebar Header */}
                <div className="bg-gradient-to-b from-blue-500 to-indigo-600 text-white py-6 px-4 md:w-16 shrink-0 flex items-center justify-center border-l md:border-l-0 md:border-b-0 border-slate-200 md:rounded-r-none rounded-t-3xl md:rounded-r-3xl">
                  <span
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent || "";
                      setData(prev => ({ ...prev, detailsTitle: newText }));
                    }}
                    className={`text-sm font-black tracking-widest md:[writing-mode:vertical-rl] md:rotate-180 text-center uppercase ${
                      editMode ? 'bg-black/20 outline-none border border-dashed border-white/50 rounded px-1 py-3 cursor-text' : ''
                    }`}
                  >
                    {data.detailsTitle || "برگه ددلاین‌ها"}
                  </span>
                </div>

                {/* Main Content (Columns of Detailed Items) */}
                <div className="flex-1 p-5 md:p-6">
                  {/* Column Management header in Tab 2 */}
                  {editMode && (
                    <div className="flex justify-end mb-4 bg-slate-50 border border-slate-200 p-2.5 rounded-2xl shadow-xs">
                      <button
                        onClick={handleAddDetailsColumn}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4 ml-1" />
                        <span>افزودن ستون ددلاین جدید</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {data.detailsColumns.map((col) => {
                      const isDeadlineCol = col.id === 'deadlines';
                      let colHeaderColor = 'border-t-slate-400 bg-slate-50/10';
                      if (col.id === 'exam') colHeaderColor = 'border-t-rose-500 bg-rose-50/10';
                      else if (col.id === 'presentation') colHeaderColor = 'border-t-blue-500 bg-blue-50/10';
                      else if (col.id === 'deadlines') colHeaderColor = 'border-t-amber-500 bg-amber-50/10';
                      else if (col.id === 'project') colHeaderColor = 'border-t-purple-500 bg-purple-50/10';
                      else if (col.id === 'report') colHeaderColor = 'border-t-emerald-500 bg-emerald-50/10';

                      const sortedItems = [...col.items].sort((a, b) => {
                        const checkIfItemCompleted = (item: any) => {
                          if (!item.id) return false;
                          if (item.id.startsWith('task_core_')) {
                            const tId = item.id.replace('task_core_', '');
                            const t = data.coreTasks?.find(task => task.id === tId);
                            return t?.status === 'completed';
                          }
                          if (item.id.startsWith('task_sec_')) {
                            const tId = item.id.replace('task_sec_', '');
                            const t = data.secondaryTasks?.find(task => task.id === tId);
                            return t?.status === 'completed';
                          }
                          return !!item.completed;
                        };

                        const isACompleted = checkIfItemCompleted(a);
                        const isBCompleted = checkIfItemCompleted(b);

                        if (isACompleted && !isBCompleted) return 1;
                        if (!isACompleted && isBCompleted) return -1;

                        if (a.date && b.date) {
                          return detailsSortOrder === 'asc'
                            ? a.date.localeCompare(b.date)
                            : b.date.localeCompare(a.date);
                        }
                        if (a.date && !b.date) return -1;
                        if (!a.date && b.date) return 1;
                        return 0;
                      });

                      return (
                        <div
                          key={col.id}
                          className={`border border-slate-200 border-t-4 rounded-2xl p-3.5 shadow-xs flex flex-col justify-between min-h-[300px] transition-all hover:shadow-xs ${colHeaderColor}`}
                        >
                          <div>
                            <div className="border-b border-slate-200/60 pb-2 mb-3">
                              {editMode ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={col.titleFa}
                                    onChange={(e) => handleEditDeadlineHeader(col.id, e.target.value)}
                                    className="w-full text-xs font-bold bg-amber-50 border border-amber-300 rounded p-1"
                                  />
                                  <button
                                    onClick={() => handleDeleteDetailsColumn(col.id)}
                                    className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded text-xs cursor-pointer transition-all"
                                    title="حذف این ستون"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <h3 className="font-black text-slate-800 text-xs leading-tight">
                                  {col.titleFa}
                                </h3>
                              )}
                            </div>

                            <ul className="space-y-2.5">
                              {sortedItems.map((item, idx) => {
                                const itemId = item.id || `temp_${idx}`;
                                const isCore = itemId.startsWith('task_core_');
                                const isSec = itemId.startsWith('task_sec_');
                                const taskId = isCore ? itemId.replace('task_core_', '') : itemId.replace('task_sec_', '');

                                const coreTask = isCore ? data.coreTasks?.find(t => t.id === taskId) : null;
                                const secTask = isSec ? data.secondaryTasks?.find(t => t.id === taskId) : null;
                                
                                // Color extraction
                                let cardBgColor = 'bg-white border-slate-100';
                                if (isCore && coreTask) {
                                  const cat = data.categories.find(c => c.id === coreTask.categoryId);
                                  if (cat) {
                                    cardBgColor = cat.color;
                                  }
                                } else if (isSec && secTask) {
                                  // Soft amber-orange secondary task styling
                                  cardBgColor = 'bg-amber-50/40 border-amber-250 text-slate-800';
                                }

                                return (
                                  <li 
                                    key={itemId} 
                                    className={`p-3 rounded-xl border text-xs text-slate-700 flex flex-col gap-1.5 shadow-2xs transition-all ${cardBgColor}`}
                                  >
                                    {editMode ? (
                                      isCore || isSec ? (
                                        // Dynamic structured editor for synced tasks!
                                        <div className="space-y-2.5 text-right w-full">
                                          {/* Badge & Label */}
                                          <div className="flex items-center justify-between border-b border-slate-200/50 pb-1.5">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                              isCore ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white'
                                            }`}>
                                              {isCore ? 'کار اصلی' : 'کار فرعی'}
                                            </span>
                                            {isCore && coreTask && (
                                              <span className="text-[8px] font-black text-slate-500">
                                                دسته: {data.categories.find(c => c.id === coreTask.categoryId)?.nameFa || '---'}
                                              </span>
                                            )}
                                            {isSec && secTask && (
                                              <span className="text-[8px] font-black text-slate-500">
                                                بخش: {data.secondaryTaskColumns.find(c => c.id === secTask.columnId)?.titleFa || '---'}
                                              </span>
                                            )}
                                          </div>

                                          {/* Title Input */}
                                          <div className="space-y-0.5">
                                            <label className="text-[8px] text-slate-400 font-bold block">عنوان کار:</label>
                                            <input
                                              type="text"
                                              value={isCore ? coreTask?.title || '' : secTask?.textFa || ''}
                                              onChange={(e) => {
                                                if (isCore) {
                                                  handleUpdateSyncedTaskField(taskId, 'core', 'title', e.target.value);
                                                } else {
                                                  handleUpdateSyncedTaskField(taskId, 'sec', 'textFa', e.target.value);
                                                }
                                              }}
                                              className="w-full text-[10px] bg-white border border-slate-200 rounded p-1 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                            />
                                          </div>

                                          {/* Description Input */}
                                          <div className="space-y-0.5">
                                            <label className="text-[8px] text-slate-400 font-bold block">توضیحات:</label>
                                            <textarea
                                              value={isCore ? coreTask?.description || '' : secTask?.description || ''}
                                              onChange={(e) => {
                                                if (isCore) {
                                                  handleUpdateSyncedTaskField(taskId, 'core', 'description', e.target.value);
                                                } else {
                                                  handleUpdateSyncedTaskField(taskId, 'sec', 'description', e.target.value);
                                                }
                                              }}
                                              className="w-full text-[10px] bg-white border border-slate-200 rounded p-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                              rows={2}
                                            />
                                          </div>

                                          {/* Deadline Controls */}
                                          <div className="space-y-1">
                                            <label className="text-[8px] text-slate-400 font-bold block">ددلاین کار:</label>
                                            <div className="grid grid-cols-3 gap-1">
                                              {/* Day Select */}
                                              <select
                                                value={isCore ? coreTask?.deadline?.day || '' : secTask?.deadline?.day || ''}
                                                onChange={(e) => handleUpdateSyncedTaskDeadline(taskId, isCore ? 'core' : 'sec', 'day', e.target.value)}
                                                className="text-[9px] bg-white border border-slate-200 rounded p-1 font-bold text-slate-700 focus:outline-none"
                                              >
                                                <option value="" className="text-center">روز</option>
                                                {Array.from({ length: ((isCore ? coreTask?.deadline?.month : secTask?.deadline?.month) ? getDaysInJalaliMonth((isCore ? coreTask?.deadline?.month : secTask?.deadline?.month)!, (isCore ? coreTask?.deadline?.year : secTask?.deadline?.year) || data.weekYear || getTodayJalali().year) : 31) }, (_, i) => i + 1).map(d => (
                                                  <option key={d} value={d}>{d}</option>
                                                ))}
                                              </select>

                                              {/* Month Select */}
                                              <select
                                                value={isCore ? coreTask?.deadline?.month || '' : secTask?.deadline?.month || ''}
                                                onChange={(e) => handleUpdateSyncedTaskDeadline(taskId, isCore ? 'core' : 'sec', 'month', e.target.value)}
                                                className="text-[9px] bg-white border border-slate-200 rounded p-1 font-bold text-slate-700 focus:outline-none"
                                              >
                                                <option value="" className="text-center">ماه</option>
                                                {PERSIAN_MONTHS.map(m => (
                                                  <option key={m} value={m}>{m}</option>
                                                ))}
                                              </select>

                                              {/* Year Select */}
                                              <select
                                                value={(isCore ? coreTask?.deadline?.year : secTask?.deadline?.year) || data.weekYear || getTodayJalali().year}
                                                onChange={(e) => handleUpdateSyncedTaskDeadline(taskId, isCore ? 'core' : 'sec', 'year', e.target.value)}
                                                className="text-[9px] bg-white border border-slate-200 rounded p-1 font-bold text-slate-700 focus:outline-none text-center"
                                              >
                                                {YEARS_1400_TO_1430.map(y => (
                                                  <option key={y} value={y}>{y}</option>
                                                ))}
                                              </select>
                                            </div>
                                            {((isCore ? coreTask?.deadline?.day : secTask?.deadline?.day) && (isCore ? coreTask?.deadline?.month : secTask?.deadline?.month)) && (
                                              <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[8px] text-slate-400 font-bold">روز هفته:</span>
                                                <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md">
                                                  {getWeekdayOfPersianDate(
                                                    (isCore ? coreTask?.deadline?.year : secTask?.deadline?.year) || data.weekYear || getTodayJalali().year,
                                                    (isCore ? coreTask?.deadline?.month : secTask?.deadline?.month)!,
                                                    (isCore ? coreTask?.deadline?.day : secTask?.deadline?.day)!
                                                  )}
                                                </span>
                                              </div>
                                            )}
                                          </div>

                                          {/* Delete button */}
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteSyncedTask(taskId, isCore ? 'core' : 'sec')}
                                            className="text-rose-600 hover:text-rose-800 text-[10px] font-black cursor-pointer pt-1 hover:underline"
                                          >
                                            حذف کار
                                          </button>
                                        </div>
                                      ) : (
                                        // Standard manual details item editor
                                        <div className="space-y-2 w-full text-right">
                                          <div>
                                            <label className="text-[9px] text-slate-500 font-bold block mb-1">عنوان آیتم:</label>
                                            <textarea
                                              value={item.text}
                                              onChange={(e) => handleEditDeadlineItem(col.id, itemId, e.target.value)}
                                              className="w-full text-[10px] bg-amber-50 border border-amber-200 rounded p-1.5 font-bold focus:outline-none"
                                              rows={2}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[9px] text-slate-500 font-bold block mb-1">توضیحات تکمیلی (اختیاری):</label>
                                            <textarea
                                              value={item.description || ''}
                                              placeholder="توضیحات یا جزئیات ددلاین..."
                                              onChange={(e) => handleEditDeadlineItem(col.id, itemId, item.text, undefined, e.target.value)}
                                              className="w-full text-[10px] bg-slate-50 border border-slate-200 rounded p-1.5 font-medium focus:outline-none resize-none"
                                              rows={2}
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-[9px] text-slate-500 font-bold">تاریخ و زمان ددلاین:</label>
                                            <DateTimeSelect
                                              value={item.date || ''}
                                              onChange={(val) => handleEditDeadlineItem(col.id, itemId, item.text, val)}
                                              showTime={true}
                                              className="text-[10px]"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteDeadlineItem(col.id, itemId)}
                                            className="text-rose-600 hover:text-rose-800 text-[10px] font-bold block self-start cursor-pointer pt-1"
                                          >
                                            حذف یادداشت
                                          </button>
                                        </div>
                                      )
                                    ) : (
                                      (() => {
                                        const isCompleted = isCore
                                        ? coreTask?.status === 'completed'
                                        : isSec
                                          ? secTask?.status === 'completed'
                                          : !!item.completed;

                                      const handleToggleTab2Item = () => {
                                        if (isCore) {
                                          if (coreTask?.status === 'completed') {
                                            setData((prev) => {
                                              const updated = (prev.coreTasks || []).map((ct) => {
                                                if (ct.id === taskId) {
                                                  return { ...ct, status: 'pending', completionDate: undefined };
                                                }
                                                return ct;
                                              });
                                              return { ...prev, coreTasks: updated };
                                            });
                                            showToast('کار اصلی به وضعیت در حال انتظار بازگشت');
                                          } else {
                                            setCompletionTarget({
                                              type: 'core',
                                              taskId
                                            });
                                          }
                                        } else if (isSec) {
                                          if (secTask?.status === 'completed') {
                                            setData((prev) => {
                                              const updated = (prev.secondaryTasks || []).map((st) => {
                                                if (st.id === taskId) {
                                                  return { ...st, status: 'pending', completionDate: undefined };
                                                }
                                                return st;
                                              });
                                              return { ...prev, secondaryTasks: updated };
                                            });
                                            showToast('کار فرعی به وضعیت در حال انتظار بازگشت');
                                          } else {
                                            setCompletionTarget({
                                              type: 'secondary',
                                              taskId
                                            });
                                          }
                                        } else {
                                          // Manual/custom note item
                                          setData((prev) => {
                                            const columns = prev.detailsColumns.map((c) => {
                                              if (c.id === col.id) {
                                                return {
                                                  ...c,
                                                  items: c.items.map((i) => {
                                                    if (i.id === itemId) {
                                                      return { ...i, completed: !i.completed };
                                                    }
                                                    return i;
                                                  })
                                                };
                                              }
                                              return c;
                                            });
                                            return { ...prev, detailsColumns: columns };
                                          });
                                          showToast('وضعیت یادداشت تغییر کرد');
                                        }
                                      };

                                      return (
                                        // Render Mode Card Layout
                                        <div className="flex flex-col gap-1.5 text-right w-full">
                                          {/* Tag / Header */}
                                          <div className="flex items-center justify-between border-b border-slate-100/60 pb-1 mb-0.5">
                                            <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                                              isCore 
                                                ? 'bg-indigo-100/90 text-indigo-800' 
                                                : isSec 
                                                  ? 'bg-amber-100/90 text-amber-800' 
                                                  : 'bg-slate-100 text-slate-700'
                                            }`}>
                                              {isCore ? 'کار اصلی' : isSec ? 'کار فرعی' : 'یادداشت'}
                                            </span>
                                            {isCore && coreTask && (
                                              <span className="text-[8px] font-bold text-slate-500">
                                                دسته: {data.categories.find(c => c.id === coreTask.categoryId)?.nameFa || '---'}
                                              </span>
                                            )}
                                            {isSec && secTask && (
                                              <span className="text-[8px] font-bold text-slate-500">
                                                بخش: {data.secondaryTaskColumns.find(c => c.id === secTask.columnId)?.titleFa || '---'}
                                              </span>
                                            )}
                                          </div>

                                          {/* Task Title / Text + Checkbox */}
                                          <div className="flex items-start gap-2 justify-between">
                                            <span className={`leading-relaxed font-black text-slate-800 text-[11px] flex-grow ${isCompleted ? 'line-through opacity-50 text-slate-400' : ''}`}>
                                              {isCore && coreTask ? coreTask.title : isSec && secTask ? secTask.textFa : item.text}
                                            </span>
                                            
                                            <button
                                              onClick={handleToggleTab2Item}
                                              className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 mt-0.5 ${
                                                isCompleted
                                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                                                  : 'bg-white border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20'
                                              }`}
                                              title="تغییر وضعیت انجام کار"
                                            >
                                              {isCompleted && <Check className="w-3 h-3 stroke-[3px]" />}
                                            </button>
                                          </div>

                                          {/* Description if present */}
                                          {((isCore && coreTask?.description) || (isSec && secTask?.description) || (!isCore && !isSec && item.description)) && (
                                            <p className={`text-[10px] font-medium leading-relaxed bg-slate-50/50 p-1.5 rounded-lg border border-slate-100 ${isCompleted ? 'line-through opacity-50 text-slate-400' : 'text-slate-500'}`}>
                                              {isCore ? coreTask?.description : isSec ? secTask?.description : item.description}
                                            </p>
                                          )}

                                          {/* Deadline Display */}
                                          {(isCore || isSec) ? (
                                            (coreTask?.deadline || secTask?.deadline) && (
                                              <span className={`text-[9px] bg-slate-100/90 border border-slate-200/80 px-2 py-1 rounded-full font-bold self-start flex items-center gap-1.5 mt-1 ${isCompleted ? 'line-through opacity-50 text-slate-400' : 'text-slate-700'}`}>
                                                <CalendarDays className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                                <span>ددلاین:</span>
                                                <span className={`${isCompleted ? 'text-slate-400' : 'text-indigo-700'} font-black text-nowrap`}>
                                                  {getTaskDeadlineCompleteDisplay(coreTask?.deadline || secTask?.deadline, weekDates, tempYear)}
                                                </span>
                                              </span>
                                            )
                                          ) : (
                                            item.date && (
                                              <span className={`text-[9px] bg-slate-100/90 border border-slate-200/80 px-2 py-1 rounded-full font-bold self-start flex items-center gap-1.5 mt-1 ${isCompleted ? 'line-through opacity-50 text-slate-400' : 'text-slate-700'}`}>
                                                <CalendarDays className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                                <span>ددلاین:</span>
                                                <span className={`${isCompleted ? 'text-slate-400' : 'text-indigo-700'} font-black`}>
                                                  {item.date}
                                                </span>
                                              </span>
                                            )
                                          )}
                                        </div>
                                      );
                                    })()
                                  )}
                                  </li>
                                );
                              })}
                            </ul>

                            {sortedItems.length === 0 && (
                              <p className="text-slate-400 text-[10px] italic py-4 text-center">موردی ثبت نشده است.</p>
                            )}
                          </div>

                          {editMode && (
                            <button
                              onClick={() => handleAddDeadlineItem(col.id)}
                              className="mt-4 flex items-center justify-center gap-1 w-full py-1.5 border border-dashed border-blue-300 text-blue-700 bg-blue-50/50 hover:bg-blue-50 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>افزودن آیتم جدید</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Tab 3: Secondary Tasks */}
          {activeTab === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.secondaryTitle || "برگه کارهای فکری بدون زمان مشخص (کارهای فرعی)"}
                        onChange={(e) => setData({ ...data, secondaryTitle: e.target.value })}
                        className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-80"
                      />
                    ) : (
                      <h2 className="text-sm font-black text-slate-900">
                        {data.secondaryTitle || "برگه کارهای فکری بدون زمان مشخص (کارهای فرعی)"}
                      </h2>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-bold">کارهای فرعی و فکری فاقد زمان اجباری</p>
                </div>
              </div>

              {/* Workspace with Left Header Column & Column Cards Grid */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Vertical Sidebar Header */}
                <div className="bg-gradient-to-b from-indigo-600 to-indigo-800 text-white py-6 px-4 md:w-16 shrink-0 flex items-center justify-center border-l md:border-l-0 md:border-b-0 border-slate-200 md:rounded-r-none rounded-t-3xl md:rounded-r-3xl text-center">
                  <span
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent || "";
                      setData(prev => ({ ...prev, secondaryTitle: newText }));
                    }}
                    className={`text-sm font-black tracking-widest md:[writing-mode:vertical-rl] md:rotate-180 uppercase ${
                      editMode ? 'bg-black/20 outline-none border border-dashed border-white/50 rounded px-1 py-3 cursor-text' : ''
                    }`}
                  >
                    {data.secondaryTitle || "برگه کارهای فکری"}
                  </span>
                </div>

                {/* Content columns area */}
                <div className="flex-1 p-5 space-y-6">
                  {editMode && (
                    <div className="flex justify-end bg-slate-50 border border-slate-200 p-2.5 rounded-2xl shadow-xs">
                      <button
                        onClick={handleAddSecondaryColumn}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4 ml-1" />
                        <span>افزودن ستون کارهای فرعی جدید</span>
                      </button>
                    </div>
                  )}

                  {/* Vertical stacked category cards, styled exactly like Tab 6 Core Tasks */}
                  <div className="flex flex-col gap-6">
                    {data.secondaryTaskColumns.map((col) => {
                      const colTasks = data.secondaryTasks.filter((t) => t.columnId === col.id);
                      const pastWeeksCount = colTasks.filter(t => isTaskHiddenFromCurrentWeekUI(t, data)).length;
                      const activeColTasks = colTasks.filter(t => !isTaskHiddenFromCurrentWeekUI(t, data));
                      // Sort tasks: pending first, completed/failed at the bottom
                      const sortedTasks = [...activeColTasks].sort((a, b) => {
                        const scoreA = a.status === 'pending' || !a.status ? 0 : 1;
                        const scoreB = b.status === 'pending' || !b.status ? 0 : 1;
                        return scoreA - scoreB;
                      });
                      return (
                        <div key={col.id} className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs bg-slate-50/20">
                          {/* Block Header */}
                          <div className={`p-3 px-5 flex items-center justify-between border-b border-slate-200 ${getSecondaryColumnColor(col.id)} font-black text-xs`}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                              {editMode ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={col.titleFa}
                                    onChange={(e) => handleEditSecondaryColumnHeader(col.id, e.target.value)}
                                    className="w-48 text-xs font-black text-slate-800 bg-white/80 border border-slate-300 rounded p-1 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                  />
                                  <button
                                    onClick={() => handleDeleteSecondaryColumn(col.id)}
                                    className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1 rounded text-xs cursor-pointer transition-colors"
                                    title="حذف این ستون"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span>{col.titleFa}</span>
                              )}
                            </div>
                            <span className="text-[10px] opacity-85 font-bold">{activeColTasks.length} کار فرعی</span>
                          </div>

                          {/* Block Items list */}
                          <div className="divide-y divide-slate-200 bg-white">
                            {pastWeeksCount > 0 && (
                              <div className="p-2.5 px-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500">
                                <span>📁 {pastWeeksCount} مورد انجام‌شده در هفته‌های قبل (آرشیو)</span>
                              </div>
                            )}
                            {activeColTasks.length === 0 ? (
                              <div className="p-6 text-center text-slate-400 text-xs italic">
                                هیچ کار فرعی در این دسته‌بندی وجود ندارد.
                              </div>
                            ) : (
                              <>
                                {sortedTasks.map((task, visualIdx) => {
                                  const idx = colTasks.findIndex(t => t.id === task.id);
                                  const isDone = task.status === 'completed' || task.status === 'failed';
                                  const cat = task.categoryId ? data.categories.find(c => c.id === task.categoryId) : null;

                                  return (
                                    <div 
                                      key={task.id} 
                                      className={`p-4 transition-all border-r-3 flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                                        cat ? (cat.color.split(' ').find(cls => cls.startsWith('border-')) || 'border-slate-300') : 'border-slate-200'
                                      } ${
                                        isDone ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50/20'
                                      }`}
                                    >
                                      {/* Checkboxes and content */}
                                      <div className="flex items-start gap-3.5 flex-grow min-w-0">
                                        <div className="flex flex-col items-center gap-1.5 shrink-0 mt-0.5">
                                          {/* Tick (Check) */}
                                          <button
                                            onClick={() => handleToggleSecondaryTaskStatus(task.id, 'completed')}
                                            className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                                              task.status === 'completed'
                                                ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                                                : 'bg-white border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20'
                                            }`}
                                            title="انجام شده"
                                          >
                                            {task.status === 'completed' && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                                          </button>
                                          
                                          {/* Cross (Cancel) */}
                                          <button
                                            onClick={() => handleToggleSecondaryTaskStatus(task.id, 'failed')}
                                            className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                                              task.status === 'failed'
                                                ? 'bg-rose-50 border-rose-400 text-rose-600'
                                                : 'bg-white border-slate-300 hover:border-rose-500 hover:bg-rose-50/20'
                                            }`}
                                            title="انجام نشده"
                                          >
                                            {task.status === 'failed' && <X className="w-3.5 h-3.5 stroke-[3px]" />}
                                          </button>
                                        </div>

                                        {/* Content row */}
                                        <div className="flex-grow min-w-0 space-y-1">
                                          {editMode ? (
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono text-slate-400 shrink-0 font-bold">
                                                  {visualIdx + 1}.
                                                </span>
                                                <input
                                                  type="text"
                                                  value={task.textFa}
                                                  onChange={(e) => handleEditSecondaryTaskText(task.id, e.target.value)}
                                                  className="w-full text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded p-1 px-2 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                />
                                              </div>
                                              <textarea
                                                value={task.description || ''}
                                                onChange={(e) => handleEditSecondaryTaskDesc(task.id, e.target.value)}
                                                className="w-full text-[10px] text-slate-600 bg-amber-50 border border-amber-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 font-bold"
                                                rows={2}
                                                placeholder="توضیحات فرعی..."
                                              />
                                              
                                              {/* Link & Deadline Selectors */}
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] text-slate-400 font-bold">لینک (اختیاری):</span>
                                                  <input
                                                    type="text"
                                                    value={task.link || ''}
                                                    onChange={(e) => handleEditSecondaryTaskLink(task.id, e.target.value)}
                                                    placeholder="https://example.com"
                                                    className="w-full text-[10px] text-slate-700 bg-amber-50 border border-amber-200 rounded p-1 focus:outline-none focus:ring-1 focus:ring-amber-300 font-mono text-left"
                                                    dir="ltr"
                                                  />
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] text-slate-400 font-bold">عنوان لینک (اختیاری):</span>
                                                  <input
                                                    type="text"
                                                    value={task.linkTitle || ''}
                                                    onChange={(e) => handleEditSecondaryTaskLinkTitle(task.id, e.target.value)}
                                                    placeholder="مثال: منبع مطالعه"
                                                    className="w-full text-[10px] text-slate-700 bg-amber-50 border border-amber-200 rounded p-1 focus:outline-none focus:ring-1 focus:ring-amber-300 font-bold"
                                                  />
                                                </div>

                                                <div className="flex flex-col gap-1 sm:col-span-2">
                                                  <span className="text-[9px] text-slate-400 font-bold">ددلاین (اختیاری):</span>
                                                  <div className="grid grid-cols-3 gap-1">
                                                    <select
                                                      value={task.deadline?.day || ''}
                                                      onChange={(e) => handleEditSecondaryTaskDeadline(task.id, 'day', e.target.value)}
                                                      className="text-[9px] bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 focus:outline-none"
                                                    >
                                                      <option value="" className="text-center">روز</option>
                                                      {Array.from({ length: task.deadline?.month ? getDaysInJalaliMonth(task.deadline.month, task.deadline?.year || data.weekYear || getTodayJalali().year) : 31 }, (_, i) => i + 1).map(d => (
                                                        <option key={d} value={d}>{d}</option>
                                                      ))}
                                                    </select>
                                                    <select
                                                      value={task.deadline?.month || ''}
                                                      onChange={(e) => handleEditSecondaryTaskDeadline(task.id, 'month', e.target.value)}
                                                      className="text-[9px] bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 focus:outline-none"
                                                    >
                                                      <option value="" className="text-center">ماه</option>
                                                      {PERSIAN_MONTHS.map(m => (
                                                        <option key={m} value={m}>{m}</option>
                                                      ))}
                                                    </select>
                                                    <select
                                                      value={task.deadline?.year || data.weekYear || getTodayJalali().year}
                                                      onChange={(e) => handleEditSecondaryTaskDeadline(task.id, 'year', e.target.value)}
                                                      className="text-[9px] bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 focus:outline-none text-center"
                                                    >
                                                      {YEARS_1400_TO_1430.map(y => (
                                                        <option key={y} value={y}>{y}</option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                  {task.deadline?.day && task.deadline?.month && (
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                      <span className="text-[8px] text-slate-400 font-bold">روز هفته:</span>
                                                      <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md">
                                                        {getWeekdayOfPersianDate(task.deadline?.year || data.weekYear || getTodayJalali().year, task.deadline.month, task.deadline.day)}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="flex flex-col gap-1 sm:col-span-2">
                                                  <span className="text-[9px] text-slate-400 font-bold">دسته‌بندی (رنگ کارت):</span>
                                                  <select
                                                    value={task.categoryId || ''}
                                                    onChange={(e) => handleEditSecondaryTaskCategory(task.id, e.target.value)}
                                                    className="w-full text-[10px] bg-amber-50 border border-amber-200 rounded p-1.5 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                  >
                                                    <option value="">بدون دسته</option>
                                                    {data.categories
                                                      .filter(c => c.id !== 'done' && c.id !== 'not_done')
                                                      .map(c => (
                                                        <option key={c.id} value={c.id}>{c.nameFa}</option>
                                                      ))
                                                    }
                                                  </select>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="space-y-1.5 text-right">
                                              <h4 className={`text-xs font-black flex flex-wrap items-center gap-2 ${
                                                isDone ? 'text-slate-400 line-through' : 'text-slate-800'
                                              }`}>
                                                <span className="text-slate-400 font-mono font-bold ml-1">{visualIdx + 1}.</span>
                                                <span>{task.textFa}</span>
                                                {task.link && (
                                                  <a
                                                    href={task.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`inline-flex items-center gap-1 text-[9px] hover:underline px-1.5 py-0.5 rounded-md font-bold font-sans transition-colors ${
                                                      isDone
                                                        ? 'text-indigo-400 bg-slate-100 hover:text-indigo-600 no-underline'
                                                        : 'text-indigo-600 bg-indigo-50 hover:text-indigo-800'
                                                    }`}
                                                  >
                                                    <Link2 className="w-2.5 h-2.5" />
                                                    <span>{task.linkTitle || 'مشاهده لینک'}</span>
                                                  </a>
                                                )}
                                              </h4>
                                              {task.description && (
                                                <p className={`text-[10px] font-medium leading-relaxed whitespace-pre-wrap break-words text-wrap max-w-full ${
                                                  isDone ? 'text-slate-400 line-through' : 'text-slate-500'
                                                }`}>
                                                  {task.description}
                                                </p>
                                              )}
                                              {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (() => {
                                                const overdue = getDeadlineOverdueStatus(task.deadline, task.deadline.year || tempYear);
                                                return (
                                                  <div className="flex flex-wrap items-center gap-1.5 mt-1 ml-1.5">
                                                    <div className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                                      isDone
                                                        ? 'bg-slate-100 text-slate-500 border-slate-200/50 line-through'
                                                        : 'bg-amber-50 text-amber-800 border-amber-200/50'
                                                    }`}>
                                                      <span>⏰ ددلاین:</span>
                                                      <span>
                                                        {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, task.deadline.year || tempYear)}
                                                      </span>
                                                    </div>
                                                    {!isDone && overdue.isOverdue && (
                                                      <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border bg-rose-50 text-rose-800 border-rose-300">
                                                        ⚠️ سرسید گذشته ({toPersianDigits(overdue.daysOverdue)} روز عقب‌افتاده)
                                                      </span>
                                                    )}
                                                    {task.completedLate && (
                                                      <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300">
                                                        ⚠️ انجام شده (دیرهنگام)
                                                      </span>
                                                    )}
                                                  </div>
                                                );
                                              })()}
                                              {cat && (
                                                <div className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border mt-1 ${
                                                  isDone
                                                    ? 'bg-slate-100 text-slate-400 border-slate-200/50 line-through'
                                                    : cat.color
                                                }`}>
                                                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                                                  <span>{cat.nameFa}</span>
                                                </div>
                                              )}
                                              {task.status === 'completed' && task.completionDate && (
                                                <div className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50 mt-1">
                                                  <span>✓ انجام شد در:</span>
                                                  <span>{task.completionDate}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Order & Action controls */}
                                      <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                                        <div className="flex flex-col gap-1">
                                          {/* Move Up */}
                                          <button
                                            onClick={() => handleReorderSecondaryTask(task.id, 'up')}
                                            disabled={idx === 0}
                                            className="p-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded disabled:opacity-40 disabled:pointer-events-none text-[9px] font-bold cursor-pointer"
                                            title="انتقال به بالا"
                                          >
                                            ▲
                                          </button>
                                          {/* Move Down */}
                                          <button
                                            onClick={() => handleReorderSecondaryTask(task.id, 'down')}
                                            disabled={idx === colTasks.length - 1}
                                            className="p-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 rounded disabled:opacity-40 disabled:pointer-events-none text-[9px] font-bold cursor-pointer"
                                            title="انتقال به پایین"
                                          >
                                            ▼
                                          </button>
                                        </div>

                                        {/* Delete in editMode */}
                                        {editMode && (
                                          <button
                                            onClick={() => handleDeleteSecondaryTask(task.id)}
                                            className="p-1 px-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-600 rounded text-[9px] font-bold flex items-center gap-0.5 cursor-pointer self-center"
                                          >
                                            <Trash2 className="w-3 h-3 ml-0.5" />
                                            حذف
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>

                          {/* Add task button for this column (Only in Edit Mode) */}
                          {editMode && (
                            <div className="bg-slate-50/50 p-2.5 border-t border-slate-150 flex justify-center">
                              <button
                                onClick={() => handleAddSecondaryTask(col.id)}
                                className="flex items-center gap-1 px-4 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-xl text-[10px] font-black text-indigo-700 transition-all cursor-pointer shadow-xs"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>افزودن کار فرعی به {col.titleFa}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* Tab 10: Intelligent Goal Management & Prediction System */}
          {activeTab === 10 && (
            <GoalsTab 
              data={data} 
              onUpdateData={setData} 
              showToast={showToast} 
              lang={lang}
            />
          )}

          {/* Tab 4: Reminders & Habits */}
          {activeTab === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-emerald-600 rounded-full"></div>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.remindersTitle || "پیگیری داروها و عادت‌های هفتگی"}
                        onChange={(e) => setData({ ...data, remindersTitle: e.target.value })}
                        className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-80"
                      />
                    ) : (
                      <h2 className="text-sm font-black text-slate-900">
                        {data.remindersTitle || "پیگیری داروها و عادت‌های هفتگی"}
                      </h2>
                    )}
                  </div>
                  {editMode && (
                    <button
                      onClick={handleAddHabit}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold border border-blue-200 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 ml-1" />
                      <span>افزودن عادت جدید</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Habits grid chart table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Vertical Sidebar Header */}
                <div className="bg-gradient-to-b from-emerald-500 to-teal-700 text-white py-6 px-4 md:w-16 shrink-0 flex items-center justify-center border-l md:border-l-0 md:border-b-0 border-slate-200 md:rounded-r-none rounded-t-3xl md:rounded-r-3xl">
                  <span
                    contentEditable={editMode}
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newText = e.currentTarget.textContent || "";
                      setData(prev => ({ ...prev, remindersTitle: newText }));
                    }}
                    className={`text-sm font-black tracking-widest md:[writing-mode:vertical-rl] md:rotate-180 text-center uppercase ${
                      editMode ? 'bg-black/20 outline-none border border-dashed border-white/50 rounded px-1 py-3 cursor-text' : ''
                    }`}
                  >
                    {data.remindersTitle || "برگه عادت‌ها"}
                  </span>
                </div>

                <div className="flex-1 p-5 md:p-6 overflow-x-auto">
                  <table className="w-full min-w-[650px] border-collapse text-center">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 font-black text-slate-600 text-xs">
                        <th className="p-3.5 text-right w-[250px]">عادت / دارو / یادآوری روزمره</th>
                        {DAYS_OF_WEEK.filter(d => activeDaysList.includes(d.key)).map((day) => (
                          <th key={day.key} className="p-3.5 bg-slate-50 text-xs">
                            {day.fa}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data.reminders || []).map((reminder) => (
                        <tr key={reminder.id} className="border-b border-slate-100 hover:bg-slate-50/50 bg-white">
                          <td className="p-3 text-right font-bold text-xs">
                            <div className="flex items-center gap-2">
                              {editMode && (
                                <button
                                  onClick={() => handleDeleteHabit(reminder.id)}
                                  className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}

                              {editMode ? (
                                <div className="flex flex-col gap-1.5 w-full text-right">
                                  <input
                                    type="text"
                                    value={reminder.textFa}
                                    onChange={(e) => handleEditHabitText(reminder.id, e.target.value)}
                                    className="w-full text-xs bg-amber-50 border border-amber-200 rounded p-1 px-2 font-bold"
                                  />
                                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                    <select
                                      value={reminder.frequency || 'every_day'}
                                      onChange={(e) => handleEditHabitFrequency(reminder.id, e.target.value as ReminderFrequency)}
                                      className="bg-amber-50 border border-amber-200 rounded p-1 font-bold text-slate-700 cursor-pointer"
                                    >
                                      <option value="every_day">هر روز</option>
                                      <option value="times_per_week">چند بار در هفته</option>
                                      <option value="times_per_month">چند بار در ماه</option>
                                      <option value="every_other_day">یک روز در میان</option>
                                      <option value="even_days">روزهای زوج</option>
                                      <option value="odd_days">روزهای فرد</option>
                                      <option value="weekly">هر هفته (یک بار)</option>
                                      <option value="every_10_days">هر ۱۰ روز</option>
                                      <option value="every_2_weeks">هر دو هفته</option>
                                      <option value="every_15_days">هر ۱۵ روز</option>
                                      <option value="every_20_days">هر ۲۰ روز</option>
                                      <option value="monthly">هر یک ماه (یک بار)</option>
                                    </select>

                                    {(reminder.frequency === 'every_day' || reminder.frequency === 'times_per_week' || reminder.frequency === 'times_per_month') && (
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-500 font-bold">هدف (تعداد):</span>
                                        <input
                                          type="number"
                                          min={1}
                                          max={31}
                                          value={reminder.targetCount || 1}
                                          onChange={(e) => handleEditHabitTarget(reminder.id, parseInt(e.target.value) || 1)}
                                          className="w-12 text-[10px] bg-amber-50 border border-amber-200 rounded p-0.5 text-center font-bold"
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* Email Reminder Config in Edit Mode */}
                                  <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-amber-200/50 flex-wrap">
                                    <label className="flex items-center gap-1 cursor-pointer text-[10px] font-black text-indigo-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                      <input
                                        type="checkbox"
                                        checked={!!reminder.emailReminder}
                                        onChange={(e) => {
                                          const val = e.target.checked;
                                          setData((prev) => ({
                                            ...prev,
                                            reminders: prev.reminders.map(r => r.id === reminder.id ? { ...r, emailReminder: val, reminderSent: false } : r)
                                          }));
                                        }}
                                        className="rounded text-indigo-600 focus:ring-0"
                                      />
                                      <Mail className="w-3 h-3 text-indigo-600" />
                                      <span>ایمیل یادآوری</span>
                                    </label>

                                    {reminder.emailReminder && (
                                      <>
                                        <input
                                          type="time"
                                          value={reminder.time || '09:00'}
                                          onChange={(e) => {
                                            const timeVal = e.target.value;
                                            setData((prev) => ({
                                              ...prev,
                                              reminders: prev.reminders.map(r => r.id === reminder.id ? { ...r, time: timeVal, reminderSent: false } : r)
                                            }));
                                          }}
                                          className="text-[10px] font-black bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-slate-800 focus:outline-none"
                                        />

                                        <select
                                          value={reminder.reminderOffset || '1day'}
                                          onChange={(e) => {
                                            const offsetVal = e.target.value as ReminderOffset;
                                            setData((prev) => ({
                                              ...prev,
                                              reminders: prev.reminders.map(r => r.id === reminder.id ? { ...r, reminderOffset: offsetVal } : r)
                                            }));
                                          }}
                                          className="text-[10px] font-black bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-slate-800 focus:outline-none cursor-pointer"
                                        >
                                          {REMINDER_OFFSET_OPTIONS.map(opt => (
                                            <option key={opt.id} value={opt.id}>{opt.labelFa}</option>
                                          ))}
                                        </select>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col text-right">
                                  <span className="text-slate-800 leading-snug">
                                    {reminder.textFa}
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    {reminder.frequency === 'times_per_week' && (
                                      <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-black px-1.5 py-0.5 rounded-md">
                                        {toPersianDigits(reminder.targetCount || 1)} بار در هفته
                                      </span>
                                    )}
                                    {reminder.frequency === 'times_per_month' && (
                                      <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 font-black px-1.5 py-0.5 rounded-md">
                                        {toPersianDigits(reminder.targetCount || 1)} بار در ماه
                                      </span>
                                    )}
                                    {reminder.frequency === 'every_day' && reminder.targetCount && reminder.targetCount > 1 && (
                                      <span className="text-[9px] text-indigo-500 font-black">
                                        ({toPersianDigits(reminder.targetCount)} بار در روز)
                                      </span>
                                    )}
                                    {reminder.frequency && reminder.frequency !== 'every_day' && reminder.frequency !== 'times_per_week' && reminder.frequency !== 'times_per_month' && (
                                      <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded-md">
                                        {reminder.frequency === 'every_other_day' ? 'یک روز در میان' :
                                         reminder.frequency === 'even_days' ? 'روزهای زوج' :
                                         reminder.frequency === 'odd_days' ? 'روزهای فرد' :
                                         reminder.frequency === 'weekly' ? 'هر هفته' :
                                         reminder.frequency === 'every_10_days' ? 'هر ۱۰ روز' :
                                         reminder.frequency === 'every_2_weeks' ? 'هر دو هفته' :
                                         reminder.frequency === 'every_15_days' ? 'هر ۱۵ روز' :
                                         reminder.frequency === 'every_20_days' ? 'هر ۲۰ روز' : 'هر یک ماه'}
                                      </span>
                                    )}
                                    {reminder.emailReminder && (
                                      <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200/80 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                        <Mail className="w-2.5 h-2.5 text-blue-600" />
                                        <span>ساعت {toPersianDigits(reminder.time || '09:00')}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {DAYS_OF_WEEK.filter(d => activeDaysList.includes(d.key)).map((day) => {
                            const isChecked = (reminder.checkedDays || []).includes(day.key);
                            const target = reminder.targetCount || 1;
                            const progress = (reminder.dayProgress && reminder.dayProgress[day.key]) || 0;
                            const pct = target > 1 ? progress / target : (isChecked ? 1 : 0);
                            const hasCustomBg = target > 1 && progress > 0;
                            
                            return (
                              <td key={day.key} className="p-3 border-r border-slate-100">
                                <button
                                  onClick={() => handleToggleHabitDay(reminder.id, day.key)}
                                  className="mx-auto w-8 h-8 flex items-center justify-center rounded-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-xs"
                                  style={hasCustomBg ? { backgroundColor: getInterpolatedColor(pct), color: '#ffffff' } : {}}
                                >
                                  {target > 1 ? (
                                    progress === 0 ? (
                                      <div className="w-5 h-5 rounded-lg border border-slate-300"></div>
                                    ) : progress === target ? (
                                      <CheckCircle2 className="w-6 h-6 text-white fill-emerald-600" />
                                    ) : (
                                      <span className="text-[10px] font-black text-white">
                                        {toPersianDigits(`${progress}/${target}`)}
                                      </span>
                                    )
                                  ) : isChecked ? (
                                    <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-50" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-lg border border-slate-300"></div>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>
          )}

          {/* Tab 11: Exams & Presentations (امتحانات و ارائه‌ها) */}
          {activeTab === 11 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
              {/* Header Box */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-rose-600 rounded-full"></div>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.examsAndPresentationsTitle || "برنامه امتحانات و ارائه‌های نیم‌سال"}
                        onChange={(e) => setData({ ...data, examsAndPresentationsTitle: e.target.value })}
                        className="text-xs font-black text-slate-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 focus:outline-none w-80"
                      />
                    ) : (
                      <h2 className="text-sm font-black text-slate-900">
                        {data.examsAndPresentationsTitle || "برنامه امتحانات و ارائه‌های نیم‌سال"}
                      </h2>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-xs text-slate-400 font-bold hidden md:block">مدیریت و یادآوری ایمیلی امتحانات، ارائه‌ها و کوییزها</p>
                    <div className="h-4 w-[1px] bg-slate-200 hidden md:block"></div>
                    <button
                      onClick={() => setExamSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl text-[10px] font-black border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                      <span>مرتب‌سازی بر اساس تاریخ:</span>
                      <span className="text-rose-600 font-bold">
                        {examSortOrder === 'asc' ? 'نزدیک‌ترین به دورترین' : 'دورترین به نزدیک‌ترین'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Content Workspace with Add Form & Column Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                
                {/* Form to add new Exam / Presentation */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-4 lg:col-span-1">
                  <h3 className="font-black text-slate-800 text-xs border-b border-slate-100 pb-3 flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>ثبت امتحان یا ارائه جدید</span>
                  </h3>

                  <div className="space-y-3">
                    {/* Category Column Selection */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1">انتخاب دسته‌بندی</label>
                      <select
                        value={newExamItem.columnId || (data.examColumns?.[0]?.id || '')}
                        onChange={(e) => setNewExamItem({ ...newExamItem, columnId: e.target.value })}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-semibold text-slate-800"
                      >
                        {(data.examColumns || []).map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.titleFa}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Title */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1">عنوان امتحان / ارائه / درس</label>
                      <input
                        type="text"
                        placeholder="مثال: میان‌ترم هوش مصنوعی، ارائه مقاله فیزیک"
                        value={newExamItem.text}
                        onChange={(e) => setNewExamItem({ ...newExamItem, text: e.target.value })}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-semibold text-slate-800"
                      />
                    </div>

                    {/* Type & Date */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-1">نوع</label>
                        <select
                          value={newExamItem.type}
                          onChange={(e) => setNewExamItem({ ...newExamItem, type: e.target.value })}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-semibold text-slate-800"
                        >
                          <option value="امتحان">امتحان</option>
                          <option value="ارائه">ارائه</option>
                          <option value="کوییز">کوییز</option>
                          <option value="ددلاین">ددلاین تکالیف</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-1">تاریخ و ساعت (جلالی)</label>
                        <DateTimeSelect
                          value={newExamItem.date}
                          onChange={(val) => setNewExamItem({ ...newExamItem, date: val })}
                          showTime={true}
                        />
                      </div>
                    </div>

                    {/* Email Reminder Options */}
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700 flex items-center gap-1">
                          <Bell className="w-3.5 h-3.5 text-indigo-600" />
                          <span>ارسال یادآوری ایمیلی:</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={newExamItem.emailReminder}
                          onChange={(e) => setNewExamItem({ ...newExamItem, emailReminder: e.target.checked })}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      {newExamItem.emailReminder && (
                        <div className="pt-1 border-t border-slate-200/60">
                          <label className="block text-[9px] font-bold text-slate-500 mb-1">زمان ارسال یادآوری:</label>
                          <select
                            value={newExamItem.reminderOffset}
                            onChange={(e) => setNewExamItem({ ...newExamItem, reminderOffset: e.target.value as ReminderOffset })}
                            className="w-full text-[10px] bg-white border border-slate-200 rounded-lg p-1.5 font-bold text-slate-800 focus:outline-none"
                          >
                            {REMINDER_OFFSET_OPTIONS.map(opt => (
                              <option key={opt.id} value={opt.id}>
                                {opt.labelFa}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1">توضیحات / منابع امتحان</label>
                      <textarea
                        rows={2}
                        placeholder="فصل‌های ۱ تا ۴، اسلایدهای جلسه ۶..."
                        value={newExamItem.description}
                        onChange={(e) => setNewExamItem({ ...newExamItem, description: e.target.value })}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-semibold text-slate-800 resize-none"
                      />
                    </div>

                    <button
                      onClick={() => {
                        const targetColId = newExamItem.columnId || (data.examColumns?.[0]?.id || '');
                        if (!targetColId) {
                          showToast('لطفاً ابتدا یک دسته‌بندی بسازید', 'error');
                          return;
                        }
                        handleAddExamItem(targetColId, newExamItem);
                        setNewExamItem(prev => ({ ...prev, text: '', description: '' }));
                      }}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>ثبت در جدول امتحانات و ارائه‌ها</span>
                    </button>
                  </div>
                </div>

                {/* Exam Columns Display Grid */}
                <div className="lg:col-span-3 space-y-4">
                  {editMode && (
                    <div className="flex justify-end bg-white border border-slate-200 p-3 rounded-2xl shadow-xs">
                      <button
                        onClick={handleAddExamColumn}
                        className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                      >
                        <Plus className="w-4 h-4 ml-1" />
                        <span>افزودن دسته‌بندی/ستون جدید امتحانات</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(data.examColumns || []).map((col) => {
                      let colHeaderColor = 'border-t-rose-500 bg-rose-50/10';
                      if (col.id === 'presentations') colHeaderColor = 'border-t-blue-500 bg-blue-50/10';
                      else if (col.id === 'quizzes') colHeaderColor = 'border-t-purple-500 bg-purple-50/10';

                      const sortedItems = [...col.items].sort((a, b) => {
                        if (a.completed && !b.completed) return 1;
                        if (!a.completed && b.completed) return -1;
                        if (a.date && b.date) {
                          return examSortOrder === 'asc'
                            ? a.date.localeCompare(b.date)
                            : b.date.localeCompare(a.date);
                        }
                        return 0;
                      });

                      return (
                        <div
                          key={col.id}
                          className={`bg-white border border-slate-200 border-t-4 rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[320px] ${colHeaderColor}`}
                        >
                          <div>
                            <div className="border-b border-slate-200/80 pb-2 mb-3 flex items-center justify-between">
                              {editMode ? (
                                <div className="flex items-center gap-1.5 w-full">
                                  <input
                                    type="text"
                                    value={col.titleFa}
                                    onChange={(e) => handleEditExamHeader(col.id, e.target.value)}
                                    className="w-full text-xs font-bold bg-amber-50 border border-amber-300 rounded p-1"
                                  />
                                  <button
                                    onClick={() => handleDeleteExamColumn(col.id)}
                                    className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded text-xs cursor-pointer transition-all"
                                    title="حذف این ستون"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <h3 className="font-black text-slate-800 text-xs flex items-center gap-2">
                                  <GraduationCap className="w-4 h-4 text-rose-600" />
                                  <span>{col.titleFa}</span>
                                </h3>
                              )}
                              <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md shrink-0">
                                {col.items.length} مورد
                              </span>
                            </div>

                            <div className="space-y-3">
                              {sortedItems.length === 0 ? (
                                <p className="text-center text-slate-400 text-xs italic py-8">
                                  هیچ موردی ثبت نشده است.
                                </p>
                              ) : (
                                sortedItems.map((item) => {
                                  const isDone = item.completed;
                                  return (
                                    <div
                                      key={item.id}
                                      className={`p-3.5 rounded-xl border text-xs flex flex-col gap-2 shadow-2xs transition-all ${
                                        isDone
                                          ? 'bg-slate-50 border-slate-200 opacity-60'
                                          : 'bg-white border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      {/* Top Row: Type & Actions */}
                                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={() => handleToggleExamItem(col.id, item.id)}
                                            className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                                              isDone
                                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                                : 'border-slate-300 hover:border-emerald-500'
                                            }`}
                                          >
                                            {isDone && <Check className="w-3 h-3 stroke-[3px]" />}
                                          </button>
                                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
                                            item.type === 'امتحان'
                                              ? 'bg-rose-100 text-rose-800'
                                              : item.type === 'ارائه'
                                              ? 'bg-blue-100 text-blue-800'
                                              : item.type === 'کوییز'
                                              ? 'bg-purple-100 text-purple-800'
                                              : 'bg-amber-100 text-amber-800'
                                          }`}>
                                            {item.type || 'امتحان'}
                                          </span>
                                        </div>

                                        <button
                                          onClick={() => handleDeleteExamItem(col.id, item.id)}
                                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-1"
                                          title="حذف"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {/* Title & Date */}
                                      <div>
                                        <p className={`font-black text-slate-800 text-xs leading-snug ${isDone ? 'line-through text-slate-500' : ''}`}>
                                          {item.text}
                                        </p>
                                        {item.date && (
                                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold mt-1">
                                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                            <span>{item.date}</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Description */}
                                      {item.description && (
                                        <p className="text-[10px] text-slate-600 bg-slate-50 border border-slate-100 p-2 rounded-lg font-medium leading-relaxed">
                                          {item.description}
                                        </p>
                                      )}

                                      {/* Email Reminder Badge */}
                                      {item.emailReminder && (
                                        <div className="flex items-center justify-between text-[9px] font-bold text-indigo-600 bg-indigo-50/70 border border-indigo-100 px-2 py-1 rounded-md mt-0.5">
                                          <div className="flex items-center gap-1">
                                            <Bell className="w-3 h-3 text-indigo-500" />
                                            <span>یادآوری: {getOffsetLabelFa(item.reminderOffset || '1day')}</span>
                                          </div>
                                          {item.reminderSent ? (
                                            <span className="text-emerald-600 font-black">✓ ارسال شد</span>
                                          ) : (
                                            <span className="text-indigo-400 font-medium">در صف</span>
                                          )}
                                        </div>
                                      )}

                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* Tab 8: Cancellations & Postponements */}
          {activeTab === 8 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200 w-full">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                {/* Form to add new cancellation/postponement */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-4">
                  <h3 className="font-black text-slate-800 text-xs border-b border-slate-100 pb-3 flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span>افزودن کلاس، امتحان یا ارائه لغوشده/تعویق‌افتاده</span>
                  </h3>
                  
                  <div className="space-y-3.5">
                    {newEvent.type === 'کلاس' && (
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-1">انتخاب کلاس جهت لغو جلسه</label>
                        <select
                          value={newEvent.classSlotId || ''}
                          onChange={(e) => {
                            const cId = e.target.value;
                            const foundClass = data.classesSchedule.find(c => c.id === cId);
                            setNewEvent(prev => ({
                              ...prev,
                              classSlotId: cId,
                              title: foundClass ? foundClass.textFa || foundClass.textEn : prev.title
                            }));
                          }}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800 cursor-pointer"
                        >
                          <option value="">-- انتخاب کلاس از برنامه هفتگی --</option>
                          {data.classesSchedule.map(c => {
                            const dayObj = DAYS_OF_WEEK.find(d => d.key === c.dayKey);
                            return (
                              <option key={c.id} value={c.id}>
                                {c.textFa || c.textEn} ({dayObj?.fa || c.dayKey} - {c.timeFa})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1">عنوان رویداد</label>
                      <input
                        type="text"
                        placeholder="مثال: کلاس ریاضی مهندسی، امتحان میان‌ترم فیزیک"
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-1">نوع رویداد</label>
                        <select
                          value={newEvent.type}
                          onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800"
                        >
                          <option value="کلاس">کلاس</option>
                          <option value="امتحان">امتحان</option>
                          <option value="ارائه">ارائه</option>
                          <option value="سایر">سایر</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-1">نوع وضعیت</label>
                        <select
                          value={newEvent.action}
                          onChange={(e) => setNewEvent({ ...newEvent, action: e.target.value })}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800"
                        >
                          <option value="لغو شده">لغو شده</option>
                          <option value="به تعویق افتاده">به تعویق افتاده</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-1">تاریخ رویداد</label>
                        <DateTimeSelect
                          value={newEvent.date}
                          onChange={(val) => setNewEvent({ ...newEvent, date: val })}
                        />
                      </div>

                      {newEvent.action === 'به تعویق افتاده' && (
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 mb-1">تاریخ جدید</label>
                          <DateTimeSelect
                            value={newEvent.newDate || ''}
                            onChange={(val) => setNewEvent({ ...newEvent, newDate: val })}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1">توضیحات / علت</label>
                      <textarea
                        rows={3}
                        placeholder="علت لغو یا تعویق، تاریخ جبرانی کلاس یا جزئیات بیشتر..."
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800 resize-none"
                      />
                    </div>

                    <button
                      onClick={handleAddPostponedEvent}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>ثبت در برنامه لغو/تعویق‌ها</span>
                    </button>
                  </div>
                </div>

                {/* Lists of active items */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-50 rounded-xl">
                          <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                        </div>
                        <div>
                          <h2 className="font-black text-slate-800 text-xs">لیست رویدادهای لغو شده یا به تعویق افتاده</h2>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">پیگیری منظم موارد آموزشی و امتحانی تعلیق‌یافته</p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-3 py-1.5 bg-slate-100 rounded-xl text-slate-600">
                        تعداد: {((data.postponedEvents || [])).length} مورد
                      </span>
                    </div>

                    <div className="p-5">
                      {!(data.postponedEvents) || data.postponedEvents.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                          <div className="p-4 bg-slate-50 rounded-2xl mb-3 text-slate-300">
                            <XCircle className="w-12 h-12 shrink-0" />
                          </div>
                          <p className="text-xs font-black text-slate-400">هیچ مورد لغو شده یا به تعویق افتاده‌ای ثبت نشده است</p>
                          <p className="text-[9px] text-slate-400 mt-1">با استفاده از فرم بغل، کلاس‌ها، امتحانات یا ارائه‌های لغوشده را ثبت کنید</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(data.postponedEvents).map((item) => {
                            const isCanceled = item.action === 'لغو شده';
                            return (
                              <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                                  isCanceled
                                    ? 'bg-rose-50/20 border-rose-100 hover:border-rose-200'
                                    : 'bg-amber-50/20 border-amber-100 hover:border-amber-200'
                                }`}
                              >
                                <div className="space-y-3">
                                  {/* Badge Row */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200/50">
                                        {item.type}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${
                                        isCanceled
                                          ? 'bg-rose-100 text-rose-700 border border-rose-200/50'
                                          : 'bg-amber-100 text-amber-700 border border-amber-200/50'
                                      }`}>
                                        {item.action}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => handleDeletePostponedEvent(item.id)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-100"
                                      title="حذف مورد"
                                    >
                                      <Trash2 className="w-4 h-4 shrink-0" />
                                    </button>
                                  </div>

                                  {/* Title & Date */}
                                  <div>
                                    <h4 className="text-xs font-black text-slate-800 leading-relaxed">{item.title}</h4>
                                    
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500 font-bold">
                                      <div className="flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>تاریخ قبلی: {item.date}</span>
                                      </div>
                                      {item.newDate && (
                                        <div className="flex items-center gap-1 text-emerald-600">
                                          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                                          <span>تاریخ جدید: {item.newDate}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Description */}
                                  {item.description && (
                                    <p className="text-[10px] text-slate-600 bg-white/75 border border-slate-100 rounded-xl p-2.5 font-medium leading-relaxed">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* Tab 5: Notes & To-Do List */}
          {activeTab === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200">
              
              {/* Top Row: Two Column Grid for Weekly Events & Daily Thoughts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                
                {/* 1. Weekly Events (رویدادهای هفته) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col min-h-[400px] max-h-[65vh]">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-600 ml-1" />
                      <h2 className="font-black text-slate-800 text-sm">رویداد‌های هفته</h2>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold">سازمان‌دهی رویدادها و برنامه‌ها</span>
                  </div>

                  {/* Add Weekly Event inline */}
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="رویداد جدیدی برای این هفته اضافه کنید..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const target = e.currentTarget;
                          handleAddWeeklyEvent(target.value);
                          target.value = '';
                        }
                      }}
                      className="flex-1 text-xs bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white rounded-xl p-2.5 px-4 focus:outline-none transition-all font-bold"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        handleAddWeeklyEvent(input.value);
                        input.value = '';
                      }}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Events list - styled perfectly to prevent overlaps */}
                  <div className="flex-1 min-h-0 space-y-3 pr-1 overflow-y-auto">
                    {(data.weeklyEvents || []).map((event, index) => (
                      <div
                        key={event.id}
                        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 group transition-all ${
                          event.completed
                            ? 'bg-emerald-50/30 border-emerald-100 text-slate-400'
                            : 'bg-slate-50/60 border-slate-200 text-slate-800 font-bold'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => handleToggleWeeklyEvent(event.id)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0 mt-0.5 cursor-pointer"
                          >
                            {event.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                            ) : (
                              <div className="w-4.5 h-4.5 rounded-lg border border-slate-300 bg-white hover:border-indigo-400 transition-all"></div>
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            {editMode ? (
                              <textarea
                                value={event.text}
                                onChange={(e) => handleEditWeeklyEventText(event.id, e.target.value)}
                                className="w-full text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 font-bold focus:outline-none focus:ring-1 focus:ring-amber-300 leading-relaxed"
                                rows={2}
                              />
                            ) : (
                              <p className={`text-xs leading-relaxed whitespace-pre-wrap break-words text-wrap font-bold ${
                                event.completed ? 'line-through text-slate-400' : 'text-slate-800'
                              }`}>
                                <span className="text-indigo-600/50 font-mono font-bold ml-1">{index + 1}.</span>
                                {event.text}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                          <select
                            value={event.weekday || ''}
                            onChange={(e) => handleUpdateWeeklyEventWeekday(event.id, e.target.value)}
                            className="text-[10px] font-bold py-1 px-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer text-slate-600 transition-all"
                          >
                            <option value="">تعیین روز</option>
                            {DAYS_OF_WEEK.map((d) => (
                              <option key={d.key} value={d.key}>{d.fa}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleDeleteWeeklyEvent(event.id)}
                            className="text-rose-600 hover:text-rose-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {(data.weeklyEvents || []).length === 0 && (
                      <div className="text-slate-400 text-xs italic py-12 text-center">هیچ رویدادی برای این هفته ثبت نشده است.</div>
                    )}
                  </div>
                </div>

                {/* 2. Daily Thoughts (افکار روزانه) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col min-h-[400px] max-h-[65vh]">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-600 ml-1" />
                      <h2 className="font-black text-slate-800 text-sm">افکار روزانه</h2>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold">ثبت اندیشه‌ها، چالش‌ها و یادگیری‌ها</span>
                  </div>

                  {/* Add Daily Thought inline */}
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="فکری، ایده یا تجربه‌ای از امروز را ثبت کنید..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const target = e.currentTarget;
                          handleAddDailyThought(target.value);
                          target.value = '';
                        }
                      }}
                      className="flex-1 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-400 focus:bg-white rounded-xl p-2.5 px-4 focus:outline-none transition-all font-bold"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        handleAddDailyThought(input.value);
                        input.value = '';
                      }}
                      className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Thoughts list */}
                  <div className="flex-1 min-h-0 space-y-3 pr-1 overflow-y-auto">
                    {(data.dailyThoughts || []).map((thought, index) => (
                      <div
                        key={thought.id}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/30 text-slate-800 font-bold flex flex-col sm:flex-row sm:items-start justify-between gap-3 group transition-all"
                      >
                        <div className="flex items-start gap-2.5 flex-grow min-w-0">
                          <span className="text-emerald-500 font-black text-xs shrink-0 mt-0.5 font-mono">✦ {index + 1}.</span>
                          <div className="flex-grow min-w-0">
                            {editMode ? (
                              <textarea
                                value={thought.text}
                                onChange={(e) => handleEditDailyThoughtText(thought.id, e.target.value)}
                                className="w-full text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 font-bold focus:outline-none focus:ring-1 focus:ring-amber-300 leading-relaxed"
                                rows={2}
                              />
                            ) : (
                              <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words text-wrap font-bold">
                                {thought.text}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                          <select
                            value={thought.weekday || ''}
                            onChange={(e) => handleUpdateDailyThoughtWeekday(thought.id, e.target.value)}
                            className="text-[10px] font-bold py-1 px-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer text-slate-600 transition-all"
                          >
                            <option value="">تعیین روز</option>
                            {DAYS_OF_WEEK.map((d) => (
                              <option key={d.key} value={d.key}>{d.fa}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleDeleteDailyThought(thought.id)}
                            className="text-rose-600 hover:text-rose-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {(data.dailyThoughts || []).length === 0 && (
                      <div className="text-slate-400 text-xs italic py-12 text-center">هیچ ایده یا فکر روزانه‌ای ثبت نشده است.</div>
                    )}
                  </div>
                </div>

              </div>

              {/* Bottom Row: Full Width Card for General Notepad */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col min-h-[250px]">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600 ml-1" />
                    <h2 className="font-black text-slate-800 text-sm">یادداشت‌های آزاد هفته</h2>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">فضای آزاد برای نوشتن نکات متفرقه</span>
                </div>
                <textarea
                  value={data.notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="هر نکته آزاد، شماره تماس، ایده موقت یا یادداشت آزاد دیگری را که نیاز دارید، اینجا بنویسید..."
                  className="flex-1 w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-400 rounded-2xl p-4 text-xs font-bold leading-relaxed focus:outline-none transition-all resize-none min-h-[120px]"
                />
              </div>

              {/* NOTE1: Historical notesArchive Card */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-5 h-5 text-indigo-600 ml-1" />
                    <h2 className="font-black text-slate-800 text-sm">یادداشت‌های هفته‌های گذشته</h2>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">نسخه‌های بایگانی‌شدهٔ خودکار در پایان هفته</span>
                </div>
                <div className="max-h-[40vh] overflow-y-auto space-y-3 pr-1">
                  {(data.notesArchive && data.notesArchive.length > 0) ? (
                    (data.notesArchive || []).slice().reverse().map((entry) => (
                      <div
                        key={entry.weekId || entry.archivedAt}
                        className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2 hover:bg-slate-100/60 transition-colors"
                      >
                        <div className="flex items-center justify-between text-slate-500 font-black text-[11px] border-b border-slate-200/50 pb-1.5">
                          <span>{entry.startLabel} تا {entry.endLabel}</span>
                          <span className="text-[10px] text-slate-400 font-normal font-mono">
                            {new Date(entry.archivedAt).toLocaleDateString('fa-IR')}
                          </span>
                        </div>
                        <p className="text-slate-700 font-bold leading-relaxed whitespace-pre-wrap break-words">
                          {entry.text}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 text-xs italic py-8 text-center">
                      هنوز یادداشتی از هفته‌های گذشته بایگانی نشده است.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Tab 7: Completed/Incomplete Tasks ("کارهای انجام شده/نشده") */}
          {activeTab === 7 && (() => {
            const selectedArchive = selectedArchiveWeekId
              ? (data.archive || []).find(w => w.weekId === selectedArchiveWeekId)
              : null;

            const effectiveCoreTasks = selectedArchive ? (selectedArchive.items?.coreTasks || []) : (data.coreTasks || []);
            const effectiveSecTasks = selectedArchive ? (selectedArchive.items?.secondaryTasks || []) : (data.secondaryTasks || []);

            const weekDates = getWeekDatesForData(data);
            const tempYear = selectedArchive ? selectedArchive.startYear : (data.weekYear || getTodayJalali().year);

            const visibleCore = selectedArchive ? effectiveCoreTasks : effectiveCoreTasks.filter(t => !isTaskHiddenFromCurrentWeekUI(t, data));
            const visibleSec = selectedArchive ? effectiveSecTasks : effectiveSecTasks.filter(t => !isTaskHiddenFromCurrentWeekUI(t, data));

            const completedCore = visibleCore.filter(t => t.status === 'completed');
            const completedSec = visibleSec.filter(t => t.status === 'completed');

            const failedCore = visibleCore.filter(t => t.status === 'failed');
            const failedSec = visibleSec.filter(t => t.status === 'failed');

            const pendingCore = visibleCore.filter(t => t.status === 'pending' || !t.status);
            const pendingSec = visibleSec.filter(t => t.status === 'pending' || !t.status);

            return (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200 w-full">
                {/* Archive Week Selector */}
                {data.archive && data.archive.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-black text-slate-800">مشاهده دوره:</span>
                      <select
                        value={selectedArchiveWeekId || ''}
                        onChange={(e) => setSelectedArchiveWeekId(e.target.value || null)}
                        className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="">هفته جاری (فعال)</option>
                        {data.archive.map((w) => (
                          <option key={w.weekId} value={w.weekId}>
                            آرشیو: {w.startLabel} تا {w.endLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedArchive && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/60">
                          نمایش آرشیو هفته ({selectedArchive.startLabel} تا {selectedArchive.endLabel})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedArchiveWeekId(null)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          بازگشت به هفته جاری
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Top Boxes: Dynamic Categories from Core Tasks & Secondary Tasks */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 w-full">
                  {data.categories
                    .filter(c => c.id !== 'done' && c.id !== 'not_done')
                    .map((category) => {
                      // Aggregate tasks in this category
                      const categoryCoreTasks = visibleCore.filter(t => t.categoryId === category.id);
                      const categorySecTasks = visibleSec.filter(t => t.categoryId === category.id);
                      
                      const completedCount = categoryCoreTasks.filter(t => t.status === 'completed').length + categorySecTasks.filter(t => t.status === 'completed').length;
                      const pendingCount = categoryCoreTasks.filter(t => t.status === 'pending' || !t.status).length + categorySecTasks.filter(t => t.status === 'pending' || !t.status).length;
                      const failedCount = categoryCoreTasks.filter(t => t.status === 'failed').length + categorySecTasks.filter(t => t.status === 'failed').length;

                      return (
                        <div
                          key={`agg-${category.id}`}
                          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${category.color.split(' ')[0]} shrink-0`} />
                            <span className="font-black text-xs text-slate-800 line-clamp-1">{category.nameFa}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-600 bg-emerald-50/50 p-1 px-2 rounded-lg">
                              <span>انجام شده:</span>
                              <span className="font-mono">{completedCount}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-bold text-rose-600 bg-rose-50/50 p-1 px-2 rounded-lg">
                              <span>ناموفق:</span>
                              <span className="font-mono">{failedCount}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-bold text-amber-600 bg-amber-50/50 p-1 px-2 rounded-lg">
                              <span>مانده:</span>
                              <span className="font-mono">{pendingCount}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Lists of Completed, Incomplete (Failed), and Pending Tasks */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full items-start">
                  
                  {/* 1. Completed Tasks (انجام شده) */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col min-h-[400px] max-h-[65vh]">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                      <div className="p-2 bg-emerald-50 rounded-xl">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-950 text-sm">کارهای انجام شده</h3>
                        <p className="text-[10px] text-slate-400 font-bold">کارهایی که علامت تیک خورده‌اند</p>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                      {/* Core Tasks completed */}
                      {completedCore.map((task) => {
                        const cat = data.categories.find(c => c.id === task.categoryId);
                        const cardBgColor = cat ? cat.color : 'bg-slate-50 border-slate-200 text-slate-800';
                        return (
                          <div key={`comp-core-${task.id}`} className={`p-3.5 border rounded-2xl flex flex-col gap-2 text-right transition-all hover:shadow-2xs ${cardBgColor}`}>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100/30 pb-1.5">
                              <span className="font-black text-xs text-slate-800">{task.title}</span>
                              <span className="text-[9px] font-black bg-indigo-100/90 text-indigo-800 px-1.5 py-0.5 rounded-md">کار اصلی</span>
                            </div>
                            {cat && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>دسته: {cat.nameFa}</span>
                              </div>
                            )}
                            {task.description && (
                              <p className="text-[10px] text-slate-600 leading-relaxed font-medium bg-white/40 p-2 rounded-xl border border-slate-200/40">
                                {task.description}
                              </p>
                            )}
                            {task.link && (
                              <a
                                href={task.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-white/60 self-start px-2 py-0.5 rounded-lg font-bold transition-colors no-underline border border-slate-200/50 mt-0.5"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>{task.linkTitle || 'مشاهده لینک'}</span>
                              </a>
                            )}
                            {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (
                              <span className="text-[9px] bg-white/60 text-slate-700 border border-slate-200/50 px-2 py-0.5 rounded-full font-bold self-start flex items-center gap-1.5 mt-0.5">
                                <CalendarDays className="w-3 h-3 text-slate-500" />
                                <span>ددلاین:</span>
                                <span className="text-indigo-700 font-black">
                                  {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, tempYear)}
                                </span>
                              </span>
                            )}
                            {task.completedLate && (
                              <span className="text-[9px] bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold self-start mt-0.5">
                                ⚠️ انجام شده (دیرهنگام)
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Secondary Tasks completed */}
                      {completedSec.map((task) => {
                        const cat = task.categoryId ? data.categories.find(c => c.id === task.categoryId) : null;
                        const cardBgColor = cat ? cat.color : 'bg-amber-50/45 border-amber-200 text-slate-800';
                        return (
                          <div key={`comp-sec-${task.id}`} className={`p-3.5 border rounded-2xl flex flex-col gap-2 text-right transition-all hover:shadow-2xs ${cardBgColor}`}>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100/30 pb-1.5">
                              <span className="font-black text-xs text-slate-800">{task.textFa}</span>
                              <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">کار فرعی</span>
                            </div>
                            {cat && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>دسته: {cat.nameFa}</span>
                              </div>
                            )}
                            {task.description && (
                              <p className="text-[10px] text-slate-600 leading-relaxed font-medium bg-white/40 p-2 rounded-xl border border-slate-200/40">
                                {task.description}
                              </p>
                            )}
                            {task.link && (
                              <a
                                href={task.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-white/60 self-start px-2 py-0.5 rounded-lg font-bold transition-colors no-underline border border-slate-200/50 mt-0.5"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>{task.linkTitle || 'مشاهده لینک'}</span>
                              </a>
                            )}
                            {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (
                              <span className="text-[9px] bg-white/60 text-slate-700 border border-slate-200/50 px-2 py-0.5 rounded-full font-bold self-start flex items-center gap-1.5 mt-0.5">
                                <CalendarDays className="w-3 h-3 text-slate-500" />
                                <span>ددلاین:</span>
                                <span className="text-indigo-700 font-black">
                                  {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, tempYear)}
                                </span>
                              </span>
                            )}
                            {task.completedLate && (
                              <span className="text-[9px] bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold self-start mt-0.5">
                                ⚠️ انجام شده (دیرهنگام)
                              </span>
                            )}
                            {task.completionDate && (
                              <span className="text-[8px] text-slate-400 font-bold self-end mt-1">تاریخ انجام: {task.completionDate}</span>
                            )}
                          </div>
                        );
                      })}

                      {completedCore.length === 0 && completedSec.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                          <CheckCircle2 className="w-8 h-8 opacity-20" />
                          <span className="text-xs italic font-bold">هیچ کاری هنوز انجام نشده است.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Failed Tasks (کارهای انجام نشده / ضربدر خورده) */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col min-h-[400px] max-h-[65vh]">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                      <div className="p-2 bg-rose-50 rounded-xl">
                        <XCircle className="w-5 h-5 text-rose-600" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-950 text-sm">کارهای انجام نشده</h3>
                        <p className="text-[10px] text-slate-400 font-bold">کارهایی که علامت ضربدر خورده‌اند</p>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                      {/* Core Tasks failed */}
                      {failedCore.map((task) => {
                        const cat = data.categories.find(c => c.id === task.categoryId);
                        const cardBgColor = cat ? cat.color : 'bg-slate-50 border-slate-200 text-slate-800';
                        return (
                          <div key={`fail-core-${task.id}`} className={`p-3.5 border rounded-2xl flex flex-col gap-2 text-right transition-all hover:shadow-2xs ${cardBgColor}`}>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100/30 pb-1.5">
                              <span className="font-black text-xs text-slate-850 line-through">{task.title}</span>
                              <span className="text-[9px] font-black bg-indigo-100/90 text-indigo-800 px-1.5 py-0.5 rounded-md">کار اصلی</span>
                            </div>
                            {cat && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>دسته: {cat.nameFa}</span>
                              </div>
                            )}
                            {task.description && (
                              <p className="text-[10px] text-slate-500 leading-relaxed font-medium bg-white/40 p-2 rounded-xl border border-slate-200/40 line-through">
                                {task.description}
                              </p>
                            )}
                            {task.link && (
                              <a
                                href={task.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-white/60 self-start px-2 py-0.5 rounded-lg font-bold transition-colors no-underline border border-slate-200/50 mt-0.5"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>{task.linkTitle || 'مشاهده لینک'}</span>
                              </a>
                            )}
                            {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (
                              <span className="text-[9px] bg-white/60 text-slate-500 border border-slate-200/50 px-2 py-0.5 rounded-full font-bold self-start flex items-center gap-1.5 mt-0.5 line-through">
                                <CalendarDays className="w-3 h-3 text-slate-400" />
                                <span>ددلاین:</span>
                                <span className="font-black text-slate-500">
                                  {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, tempYear)}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Secondary Tasks failed */}
                      {failedSec.map((task) => {
                        const cat = task.categoryId ? data.categories.find(c => c.id === task.categoryId) : null;
                        const cardBgColor = cat ? cat.color : 'bg-amber-50/45 border-amber-200 text-slate-800';
                        return (
                          <div key={`fail-sec-${task.id}`} className={`p-3.5 border rounded-2xl flex flex-col gap-2 text-right transition-all hover:shadow-2xs ${cardBgColor}`}>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100/30 pb-1.5">
                              <span className="font-black text-xs text-slate-850 line-through">{task.textFa}</span>
                              <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">کار فرعی</span>
                            </div>
                            {cat && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>دسته: {cat.nameFa}</span>
                              </div>
                            )}
                            {task.description && (
                              <p className="text-[10px] text-slate-500 leading-relaxed font-medium bg-white/40 p-2 rounded-xl border border-slate-200/40 line-through">
                                {task.description}
                              </p>
                            )}
                            {task.link && (
                              <a
                                href={task.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-white/60 self-start px-2 py-0.5 rounded-lg font-bold transition-colors no-underline border border-slate-200/50 mt-0.5"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>{task.linkTitle || 'مشاهده لینک'}</span>
                              </a>
                            )}
                            {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (
                              <span className="text-[9px] bg-white/60 text-slate-500 border border-slate-200/50 px-2 py-0.5 rounded-full font-bold self-start flex items-center gap-1.5 mt-0.5 line-through">
                                <CalendarDays className="w-3 h-3 text-slate-400" />
                                <span>ددلاین:</span>
                                <span className="font-black text-slate-500">
                                  {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, tempYear)}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {failedCore.length === 0 && failedSec.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                          <XCircle className="w-8 h-8 opacity-20" />
                          <span className="text-xs italic font-bold">هیچ کار ناموفقی ثبت نشده است.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Pending Tasks (مانده / در حال انجام) */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col min-h-[400px] max-h-[65vh]">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                      <div className="p-2 bg-indigo-50 rounded-xl">
                        <Clock className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-950 text-sm">کارهای باقی‌مانده</h3>
                        <p className="text-[10px] text-slate-400 font-bold">کارهایی که در وضعیت در حال انتظار هستند</p>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                      {/* Core Tasks pending */}
                      {pendingCore.map((task) => {
                        const cat = data.categories.find(c => c.id === task.categoryId);
                        const cardBgColor = cat ? cat.color : 'bg-slate-50 border-slate-200 text-slate-800';
                        return (
                          <div key={`pend-core-${task.id}`} className={`p-3.5 border rounded-2xl flex flex-col gap-2 text-right transition-all hover:shadow-2xs ${cardBgColor}`}>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100/30 pb-1.5">
                              <span className="font-bold text-xs text-slate-800">{task.title}</span>
                              <span className="text-[9px] font-black bg-indigo-100/90 text-indigo-800 px-1.5 py-0.5 rounded-md">کار اصلی</span>
                            </div>
                            {cat && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>دسته: {cat.nameFa}</span>
                              </div>
                            )}
                            {task.description && (
                              <p className="text-[10px] text-slate-600 leading-relaxed font-medium bg-white/40 p-2 rounded-xl border border-slate-200/40">
                                {task.description}
                              </p>
                            )}
                            {task.link && (
                              <a
                                href={task.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-white/60 self-start px-2 py-0.5 rounded-lg font-bold transition-colors no-underline border border-slate-200/50 mt-0.5"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>{task.linkTitle || 'مشاهده لینک'}</span>
                              </a>
                            )}
                            {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (() => {
                              const od = getDeadlineOverdueStatus(task.deadline, tempYear);
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span className="text-[9px] bg-white/60 text-slate-700 border border-slate-200/50 px-2 py-0.5 rounded-full font-bold self-start flex items-center gap-1.5">
                                    <CalendarDays className="w-3 h-3 text-slate-500" />
                                    <span>ددلاین:</span>
                                    <span className="text-indigo-700 font-black">
                                      {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, tempYear)}
                                    </span>
                                  </span>
                                  {od.isOverdue && (
                                    <span className="text-[9px] bg-rose-50 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full font-bold self-start">
                                      ⚠️ سرسید گذشته ({toPersianDigits(od.daysOverdue)} روز عقب‌افتاده)
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}

                      {/* Secondary Tasks pending */}
                      {pendingSec.map((task) => {
                        const cat = task.categoryId ? data.categories.find(c => c.id === task.categoryId) : null;
                        const cardBgColor = cat ? cat.color : 'bg-amber-50/45 border-amber-200 text-slate-800';
                        return (
                          <div key={`pend-sec-${task.id}`} className={`p-3.5 border rounded-2xl flex flex-col gap-2 text-right transition-all hover:shadow-2xs ${cardBgColor}`}>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100/30 pb-1.5">
                              <span className="font-bold text-xs text-slate-800">{task.textFa}</span>
                              <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">کار فرعی</span>
                            </div>
                            {cat && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>دسته: {cat.nameFa}</span>
                              </div>
                            )}
                            {task.description && (
                              <p className="text-[10px] text-slate-600 leading-relaxed font-medium bg-white/40 p-2 rounded-xl border border-slate-200/40">
                                {task.description}
                              </p>
                            )}
                            {task.link && (
                              <a
                                href={task.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-white/60 self-start px-2 py-0.5 rounded-lg font-bold transition-colors no-underline border border-slate-200/50 mt-0.5"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>{task.linkTitle || 'مشاهده لینک'}</span>
                              </a>
                            )}
                            {task.deadline && (task.deadline.day || task.deadline.month || task.deadline.weekday) && (() => {
                              const od = getDeadlineOverdueStatus(task.deadline, tempYear);
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span className="text-[9px] bg-white/60 text-slate-700 border border-slate-200/50 px-2 py-0.5 rounded-full font-bold self-start flex items-center gap-1.5">
                                    <CalendarDays className="w-3 h-3 text-slate-500" />
                                    <span>ددلاین:</span>
                                    <span className="text-indigo-700 font-black">
                                      {getTaskDeadlineCompleteDisplay(task.deadline, weekDates, tempYear)}
                                    </span>
                                  </span>
                                  {od.isOverdue && (
                                    <span className="text-[9px] bg-rose-50 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full font-bold self-start">
                                      ⚠️ سرسید گذشته ({toPersianDigits(od.daysOverdue)} روز عقب‌افتاده)
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}

                      {pendingCore.length === 0 && pendingSec.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                          <Award className="w-8 h-8 text-emerald-500 animate-bounce" />
                          <span className="text-xs font-black text-emerald-600">همه کارها انجام شده است!</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {activeTab === 9 && (
            <AnalyticsTab data={data} onUpdateData={setData} />
          )}

          </div>
          )}

        </main>
      </div>



      {/* ========================================================================= */}
      {/* ======================= GLOBAL INTERACTIVE DIALOGS ====================== */}
      {/* ========================================================================= */}

      {/* 1. CALENDAR RANGE SELECTOR (HOTEL RESERVATION STYLE) */}
      {isCalendarRangeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-slate-100 bg-white shrink-0">
              <h3 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600 shrink-0" />
                تنظیم تقویم هفتگی (انتخاب بازه اول و آخر هفته)
              </h3>
              <button
                type="button"
                onClick={() => setIsCalendarRangeOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* Month & Year Selection Bar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold">سال هجری شمسی</label>
                  <select
                    value={tempYear}
                    onChange={(e) => setTempYear(parseInt(e.target.value) || getTodayJalali().year)}
                    className="p-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-black"
                  >
                    {YEARS_1400_TO_1430.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold">ماه شمسی (شروع بازه)</label>
                  <select
                    value={tempMonth}
                    onChange={(e) => {
                      setTempMonth(e.target.value);
                      setTempStartDay(null);
                      setTempStartMonth(null);
                      setTempEndDay(null);
                      setTempEndMonth(null);
                    }}
                    className="p-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-black"
                  >
                    {['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Permanent Stored Week Banner (W2-3) */}
              <div className="p-3 bg-slate-100 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-500 text-[11px]">
                  بازهٔ فعلی ذخیره‌شده در برنامه:
                </span>
                <span className="font-black text-indigo-950 flex items-center gap-1.5 text-xs sm:text-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  {data.weekStartDay || 1} {data.weekMonth || 'خرداد'} {data.weekYear || 1405} تا {data.weekEndDay || 7} {data.weekEndMonth || data.weekMonth || 'خرداد'} {data.weekEndYear || data.weekYear || 1405}
                </span>
              </div>

              {/* Instruction alert */}
              <div className="p-2.5 sm:p-3 bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-xl text-[11px] sm:text-xs font-bold leading-relaxed">
                👉 بر روی <span className="text-indigo-600">اولین روز هفته</span> و سپس بر روی <span className="text-indigo-600">آخرین روز هفته</span> کلیک کنید تا بازه هفته انتخاب شود (می‌توانید روزهایی از دو ماه متوالی را کنار هم انتخاب کنید).
              </div>

              {/* Days Grids for Two Consecutive Months */}
              {(() => {
                const month1Idx = JALALI_MONTHS.indexOf(tempMonth);
                const month1FirstWeekday = month1Idx >= 0 ? getJalaliWeekday(tempYear, month1Idx + 1, 1).index : 0;

                const month2Name = getNextMonth(tempMonth);
                const month2Idx = JALALI_MONTHS.indexOf(month2Name);
                const month2Year = tempMonth === 'اسفند' ? tempYear + 1 : tempYear;
                const month2FirstWeekday = month2Idx >= 0 ? getJalaliWeekday(month2Year, month2Idx + 1, 1).index : 0;

                const daysInMonth1 = getDaysInMonth(tempMonth);
                const isStartInVisible = tempStartMonth === tempMonth || tempStartMonth === month2Name;
                const isEndInVisible = tempEndMonth === tempMonth || tempEndMonth === month2Name;

                const startAbs = (tempStartDay !== null && isStartInVisible)
                  ? (tempStartMonth === tempMonth ? tempStartDay : (daysInMonth1 + tempStartDay))
                  : null;

                const endAbs = (tempEndDay !== null && isEndInVisible)
                  ? (tempEndMonth === tempMonth ? tempEndDay : (daysInMonth1 + tempEndDay))
                  : null;

                return (
                  <div className="space-y-3">
                    {(!isStartInVisible || !isEndInVisible) && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-[11px] font-bold">
                        ⚠️ ماه شروع یا پایانِ بازه ذخیره‌شده خارج از دو تقویم نمایان است. برای تعیین بازهٔ جدید، روز اول و آخر هفته را کلیک کنید.
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      {/* Month 1: tempMonth */}
                      <div className="border border-slate-150 rounded-2xl p-3 sm:p-4 bg-slate-50/30">
                        <h4 className="text-center font-black text-xs text-indigo-800 mb-2.5 pb-2 border-b border-slate-200/60 flex items-center justify-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                          {tempMonth} {tempYear}
                        </h4>

                        {/* Weekday Header Row */}
                        <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
                          {JALALI_WEEKDAYS.map((w) => (
                            <div key={`m1-w-${w.key}`} className="p-1 text-[9px] font-black text-indigo-600 bg-indigo-50/70 rounded-lg text-center flex items-center justify-center">
                              {lang === 'fa' ? w.fa : w.en.slice(0, 3)}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
                          {/* Empty padding slots before Day 1 */}
                          {Array.from({ length: month1FirstWeekday }).map((_, idx) => (
                            <div key={`m1-pad-${idx}`} className="p-1.5" />
                          ))}

                          {Array.from({ length: daysInMonth1 }, (_, i) => i + 1).map((d) => {
                            const month1 = tempMonth;
                            const absVal = d;
                            const isStart = tempStartDay === d && tempStartMonth === month1;
                            const isEnd = tempEndDay === d && tempEndMonth === month1;
                            const isInRange = startAbs !== null && endAbs !== null && absVal > startAbs && absVal < endAbs;
                            
                            let bgClass = 'bg-white hover:bg-slate-100 text-slate-850 border border-slate-200/60 shadow-2xs';
                            if (isStart) bgClass = 'bg-indigo-600 text-white font-black ring-2 ring-indigo-300';
                            else if (isEnd) bgClass = 'bg-emerald-600 text-white font-black ring-2 ring-emerald-300';
                            else if (isInRange) bgClass = 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold';

                            return (
                              <button
                                key={`m1-${d}`}
                                type="button"
                                onClick={() => handleCalendarDayClick(d, month1)}
                                className={`p-1.5 sm:p-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${bgClass}`}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Month 2: getNextMonth(tempMonth) */}
                      <div className="border border-slate-150 rounded-2xl p-3 sm:p-4 bg-slate-50/30">
                        <h4 className="text-center font-black text-xs text-emerald-850 mb-2.5 pb-2 border-b border-slate-200/60 flex items-center justify-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {getNextMonth(tempMonth)} {month2Year}
                        </h4>

                        {/* Weekday Header Row */}
                        <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
                          {JALALI_WEEKDAYS.map((w) => (
                            <div key={`m2-w-${w.key}`} className="p-1 text-[9px] font-black text-emerald-600 bg-emerald-50/70 rounded-lg text-center flex items-center justify-center">
                              {lang === 'fa' ? w.fa : w.en.slice(0, 3)}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
                          {/* Empty padding slots before Day 1 */}
                          {Array.from({ length: month2FirstWeekday }).map((_, idx) => (
                            <div key={`m2-pad-${idx}`} className="p-1.5" />
                          ))}

                          {Array.from({ length: getDaysInMonth(getNextMonth(tempMonth)) }, (_, i) => i + 1).map((d) => {
                            const month2 = getNextMonth(tempMonth);
                            const absVal = daysInMonth1 + d;
                            const isStart = tempStartDay === d && tempStartMonth === month2;
                            const isEnd = tempEndDay === d && tempEndMonth === month2;
                            const isInRange = startAbs !== null && endAbs !== null && absVal > startAbs && absVal < endAbs;
                            
                            let bgClass = 'bg-white hover:bg-slate-100 text-slate-850 border border-slate-200/60 shadow-2xs';
                            if (isStart) bgClass = 'bg-indigo-600 text-white font-black ring-2 ring-indigo-300';
                            else if (isEnd) bgClass = 'bg-emerald-600 text-white font-black ring-2 ring-emerald-300';
                            else if (isInRange) bgClass = 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold';

                            return (
                              <button
                                key={`m2-${d}`}
                                type="button"
                                onClick={() => handleCalendarDayClick(d, month2)}
                                className={`p-1.5 sm:p-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${bgClass}`}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Selection display */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-100/90 rounded-2xl text-xs font-black text-slate-700 text-center border border-slate-200/60">
                <div>اول هفته (شروع): <span className="text-indigo-600">{tempStartDay && tempStartMonth ? `${tempStartDay} ${tempStartMonth}` : '---'}</span></div>
                <div>آخر هفته (پایان): <span className="text-emerald-600">{tempEndDay && tempEndMonth ? `${tempEndDay} ${tempEndMonth}` : '---'}</span></div>
              </div>
            </div>

            {/* Modal Sticky Footer */}
            <div className="flex items-center justify-between sm:justify-end gap-2 p-3 sm:p-4 border-t border-slate-100 bg-slate-50/90 shrink-0">
              <button
                type="button"
                onClick={() => setIsCalendarRangeOpen(false)}
                className="text-xs text-slate-600 hover:bg-slate-200/60 px-4 py-2.5 rounded-xl font-bold transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={submitCalendarRange}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black shadow-md shadow-indigo-200 transition-all cursor-pointer"
              >
                تایید و ثبت بازه تقویم
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RESET CONFIRMATION MODAL (W1) */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-red-200 overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-red-100 bg-red-50/70 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <h3 className="font-black text-slate-900 text-sm">
                  {lang === 'fa' ? 'حذف کلیه اطلاعات و بازنشانی قالب اولیه' : 'Reset All Planner Data'}
                </h3>
                <span className="text-[11px] font-bold text-red-700">
                  {lang === 'fa' ? 'این عملیات غیرقابل بازگشت است' : 'This action cannot be undone'}
                </span>
              </div>
            </div>
            <div className="p-5 space-y-3 text-xs leading-relaxed text-slate-700 font-normal">
              <p>
                {lang === 'fa'
                  ? 'آیا مطمئن هستید که می‌خواهید تمام داده‌های برنامه‌ریزی (کارهای اصلی، فرعی، امتحانات، اهداف، یادآورها و آرشیو) را حذف کرده و برنامه را به قالب اولیه بازنشانی کنید؟'
                  : 'Are you sure you want to delete all stored tasks, goals, habits, exams, and archives, and restore default empty state?'}
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-bold">
                {lang === 'fa'
                  ? 'توصیه: در صورت نیاز ابتدا از بخش تنظیمات یک نسخه پشتیبان JSON دانلود کنید.'
                  : 'Tip: You can export a JSON backup first from settings.'}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                {lang === 'fa' ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                {lang === 'fa' ? 'بله، همه چیز پاک شود' : 'Yes, Delete & Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
      {completionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all p-6 text-right">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-black text-slate-800 text-xs">
                تاریخ دقیق انجام کار را مشخص کنید
              </h3>
              <button
                onClick={() => setCompletionTarget(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-bold mb-4">لطفا انتخاب کنید در چه تاریخی این کار با موفقیت به پایان رسید:</p>

            {/* 1. BUTTON TODAY AT THE TOP */}
            <div className="mb-4">
              <span className="text-[10px] font-black text-slate-400 block mb-1.5">امروز</span>
              {(() => {
                const today = getTodayJalali();
                const todayFormatted = formatCompletionDate(today.day, today.monthName, today.year);
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (completionTarget.type === 'daily') {
                        saveDailyTaskCompletion(todayFormatted);
                      } else if (completionTarget.type === 'secondary') {
                        saveSecondaryTaskCompletion(todayFormatted);
                      } else if (completionTarget.type === 'core') {
                        saveCoreTaskCompletion(todayFormatted);
                      }
                    }}
                    className="w-full p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 rounded-xl text-xs font-black text-right transition-all flex items-center justify-between cursor-pointer shadow-xs"
                  >
                    <span>امروز ({toPersianDigits(todayFormatted)})</span>
                    <ChevronLeft className="w-4 h-4 text-emerald-600" />
                  </button>
                );
              })()}
            </div>

            <div className="max-h-[50vh] overflow-y-auto overscroll-contain space-y-4 mb-4 pr-1">
              {/* 2. GROUP: هفته جاری (واقعی) */}
              <div>
                <span className="text-[10px] font-black text-slate-400 block mb-1.5">هفته جاری (واقعی)</span>
                <div className="flex flex-col gap-1.5">
                  {(() => {
                    const currentWeekRange = getCurrentJalaliWeekRange();
                    return JALALI_WEEKDAYS.map((wd, idx) => {
                      const dayObj = addJalaliDays(currentWeekRange.startYear, currentWeekRange.startMonthIdx, currentWeekRange.startDay, idx);
                      const formattedDate = formatCompletionDate(dayObj.day, dayObj.monthName, dayObj.year);
                      const label = `${wd.fa} (${dayObj.day} ${dayObj.monthName})`;

                      return (
                        <button
                          key={`real_${idx}`}
                          type="button"
                          onClick={() => {
                            if (completionTarget.type === 'daily') {
                              saveDailyTaskCompletion(formattedDate);
                            } else if (completionTarget.type === 'secondary') {
                              saveSecondaryTaskCompletion(formattedDate);
                            } else if (completionTarget.type === 'core') {
                              saveCoreTaskCompletion(formattedDate);
                            }
                          }}
                          className="p-2.5 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-900 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-bold text-slate-700 text-right transition-all flex items-center justify-between cursor-pointer"
                        >
                          <span>{label}</span>
                          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* 3. GROUP: هفته فعال برنامه */}
              <div>
                <span className="text-[10px] font-black text-slate-400 block mb-1.5">هفته فعال برنامه</span>
                <div className="flex flex-col gap-1.5">
                  {weekDates.map((dateStr, idx) => {
                    const parsed = parsePersianDate(dateStr);
                    const curYear = (parsed && parsed.month === data.weekEndMonth && data.weekEndYear)
                      ? data.weekEndYear
                      : (data.weekYear || getTodayJalali().year);
                    const weekdayName = parsed
                      ? getWeekdayOfPersianDate(curYear, parsed.month, parsed.day)
                      : 'روز هفته';
                    const formattedDate = parsed
                      ? formatCompletionDate(parsed.day, parsed.month, curYear)
                      : dateStr;

                    return (
                      <button
                        key={`active_${idx}`}
                        type="button"
                        onClick={() => {
                          if (completionTarget.type === 'daily') {
                            saveDailyTaskCompletion(formattedDate);
                          } else if (completionTarget.type === 'secondary') {
                            saveSecondaryTaskCompletion(formattedDate);
                          } else if (completionTarget.type === 'core') {
                            saveCoreTaskCompletion(formattedDate);
                          }
                        }}
                        className="p-2.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-900 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-bold text-slate-700 text-right transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span>{weekdayName} ({dateStr})</span>
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCompletionTarget(null)}
                className="text-xs text-slate-500 hover:bg-slate-100 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer"
              >
                انصراف
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= CLASS SLOT & DAILY TASK IN-MODAL EDITORS ================= */}
      
      {/* 1. Class Slot Modal */}
      <ClassSlotModal
        isOpen={isSlotModalOpen}
        onClose={() => {
          setIsSlotModalOpen(false);
          setEditingSlot(null);
        }}
        slot={editingSlot}
        categories={data.categories}
        lang={lang}
        defaultAnchorDate={editingSlot ? getConcreteDateForDayKey(editingSlot.dayKey, data) : undefined}
        onChange={(updated) => setEditingSlot(updated)}
        onSave={() => editingSlot && saveClassSlot(editingSlot)}
        onDelete={editingSlot ? () => deleteClassSlot(editingSlot.id) : undefined}
      />

      {/* Day Inspector (روزبین) Modal */}
      <DayInspectorModal
        isOpen={isDayInspectorOpen}
        onClose={() => setIsDayInspectorOpen(false)}
        data={data}
        lang={lang}
      />

      {/* 2. Daily Task Modal */}
      <DailyTaskModal
        isOpen={isDailyTaskModalOpen}
        onClose={() => {
          setIsDailyTaskModalOpen(false);
          setEditingDailyTask(null);
        }}
        dayKey={editingDailyTask ? editingDailyTask.dayKey : ''}
        task={editingDailyTask ? editingDailyTask.task : null}
        categories={data.categories}
        lang={lang}
        onChange={(updated) => {
          if (editingDailyTask) {
            setEditingDailyTask({ ...editingDailyTask, task: updated });
          }
        }}
        onSave={() => editingDailyTask && saveDailyTask(editingDailyTask.task)}
        onDelete={
          editingDailyTask && editingDailyTask.task && editingDailyTask.task.id
            ? () => handleDeleteDailyTask(editingDailyTask.dayKey, editingDailyTask.task.id)
            : undefined
        }
      />

      {/* User Profile Management Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        onUpdateProfile={(updatedUser) => {
          setCurrentUser(updatedUser);
          localStorage.setItem('user_profile', JSON.stringify(updatedUser));
          localStorage.setItem('planner_user', JSON.stringify(updatedUser));
          showToast(lang === 'fa' ? 'اطلاعات حساب کاربری با موفقیت بروزرسانی شد' : 'Profile updated successfully');
        }}
        onLogout={async () => {
          try {
            await clientSignOut();
          } catch (e) {
            console.error(e);
          }
          setCurrentUser(null);
          localStorage.removeItem('planner_user');
          localStorage.removeItem('user_profile');
          showToast(lang === 'fa' ? 'با موفقیت از حساب کاربری خارج شدید' : 'Signed out successfully');
        }}
        onDeleteAccount={async () => {
          try {
            await clientDeleteAccount();
            setCurrentUser(null);
            localStorage.removeItem('planner_user');
            localStorage.removeItem('user_profile');
            showToast(lang === 'fa' ? 'حساب کاربری و تمامی اطلاعات ابری شما با موفقیت به طور کامل حذف گردید.' : 'Account and data deleted successfully.');
          } catch (e) {
            console.error('Delete account error:', e);
            showToast(lang === 'fa' ? 'خطا در حذف حساب کاربری' : 'Failed to delete account');
          }
        }}
        showToast={showToast}
        lang={lang}
      />

    </div>
  );
}
