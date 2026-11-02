import { getNow } from './networkTime';

export const YEARS_1400_TO_1430 = Array.from({ length: 31 }, (_, i) => 1400 + i);

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

export const JALALI_MONTHS_EN = [
  'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
  'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'
];

export const JALALI_WEEKDAYS = [
  { fa: 'شنبه', en: 'Saturday', key: 'saturday' },
  { fa: 'یکشنبه', en: 'Sunday', key: 'sunday' },
  { fa: 'دوشنبه', en: 'Monday', key: 'monday' },
  { fa: 'سه‌شنبه', en: 'Tuesday', key: 'tuesday' },
  { fa: 'چهارشنبه', en: 'Wednesday', key: 'wednesday' },
  { fa: 'پنج‌شنبه', en: 'Thursday', key: 'thursday' },
  { fa: 'جمعه', en: 'Friday', key: 'friday' }
];

export const LEAP_YEARS_1400_1430 = [1403, 1408, 1412, 1416, 1420, 1424, 1428];

export const isLeapJalali = (jy: number): boolean => {
  // Always use Standard Birashk Jalali algorithm (E1)
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let bl = breaks.length;
  let jp = breaks[0];
  let jump = 0;
  if (jy < jp || jy >= breaks[bl - 1]) return ((jy % 33) % 4) === 3;
  for (let i = 1; i < bl; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  let N = jy - jp;
  if (jump - N < 6) N = N - jump + Math.floor((jump + 4) / 33) * 33;
  let leap = ((((N + 1) % 33) - 1) % 4);
  if (leap === -1) leap = 4;
  return leap === 0;
};

export const getDaysInJalaliMonth = (monthName: string, year: number): number => {
  const idx = JALALI_MONTHS.indexOf(monthName);
  if (idx >= 0 && idx <= 5) return 31;
  if (idx >= 6 && idx <= 10) return 30;
  if (idx === 11) return isLeapJalali(year) ? 30 : 29;
  return 30;
};

// Convert Jalali date to standard Gregorian Date
export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const jalaliToJulianDay = (y: number, m: number, d: number): number => {
    const epochJalali = 1948320.5;
    let julianYear = y - ((y >= 0) ? 474 : 473);
    let jalaliEpochCycle = 474 + (julianYear % 2820);
    return d + ((m <= 7) ? (m - 1) * 31 : ((m - 7) * 30) + 186) +
           Math.floor((jalaliEpochCycle * 682 - 110) / 2816) +
           (jalaliEpochCycle - 1) * 365 +
           Math.floor(julianYear / 2820) * 1029983 +
           (epochJalali - 1);
  };

  const julianToGregorian = (jdn: number): Date => {
    const w = Math.floor(jdn + 0.5);
    const z = w - 1721119;
    const g = Math.floor((z - 0.25) / 36524.25);
    const b = z + g - Math.floor(g / 4);
    const c = Math.floor((b - 0.25) / 365.25);
    const d = b - Math.floor(c * 365.25);
    const month = Math.floor((5 * d + 456) / 153);
    const mDay = d - Math.floor((153 * month - 457) / 5);
    const m = (month > 12) ? month - 12 : month;
    const y = (month > 12) ? c + 1 : c;
    return new Date(Date.UTC(y, m - 1, mDay));
  };

  const jdn = jalaliToJulianDay(jy, jm, jd);
  return julianToGregorian(jdn);
}

// Get Jalali Weekday (0 = Saturday, ..., 6 = Friday)
export function getJalaliWeekday(jy: number, jm: number, jd: number) {
  const gDate = jalaliToGregorian(jy, jm, jd);
  // Gregorian UTCDay: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  const jalaliWeekdayIdx = (gDate.getUTCDay() + 1) % 7;
  return {
    index: jalaliWeekdayIdx,
    weekday: JALALI_WEEKDAYS[jalaliWeekdayIdx]
  };
}

export function gregorianToJalali(gy: number, gm: number, gd: number) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  let gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  let jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return { jy, jm, jd };
}

export function getTehranDateParts(date: Date = getNow()): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(date);
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth() + 1;
    let day = date.getUTCDate();
    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'day') day = parseInt(p.value, 10);
    }
    return { year, month, day };
  } catch (e) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  }
}

export function getTodayTehranISO(date: Date = getNow()): string {
  const { year, month, day } = getTehranDateParts(date);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function getTodayJalali(date: Date = getNow()) {
  try {
    const { year: gy, month: gm, day: gd } = getTehranDateParts(date);
    const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
    const monthName = JALALI_MONTHS[jm - 1] || 'فروردین';
    return { year: jy, monthIdx: jm - 1, monthName, day: jd };
  } catch (e) {
    return { year: 1405, monthIdx: 4, monthName: 'مرداد', day: 4 };
  }
}

export function addJalaliDays(year: number, monthIdx: number, day: number, offsetDays: number) {
  let y = year;
  let m = monthIdx;
  let d = day + offsetDays;

  while (d > getDaysInJalaliMonth(JALALI_MONTHS[m], y)) {
    d -= getDaysInJalaliMonth(JALALI_MONTHS[m], y);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }

  while (d < 1) {
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
    d += getDaysInJalaliMonth(JALALI_MONTHS[m], y);
  }

  return { year: y, monthIdx: m, monthName: JALALI_MONTHS[m], day: d };
}

export function getCurrentJalaliWeekRange(date: Date = getNow()) {
  const today = getTodayJalali(date);
  const { index: todayWeekdayIdx } = getJalaliWeekday(today.year, today.monthIdx + 1, today.day);

  // Saturday (start of week)
  const start = addJalaliDays(today.year, today.monthIdx, today.day, -todayWeekdayIdx);
  // Friday (end of week)
  const end = addJalaliDays(today.year, today.monthIdx, today.day, 6 - todayWeekdayIdx);

  const monthLabel = start.monthName === end.monthName 
    ? `${start.day} تا ${end.day} ${start.monthName} ${start.year}`
    : `${start.day} ${start.monthName} تا ${end.day} ${end.monthName} ${start.year}`;

  return {
    startYear: start.year,
    startMonth: start.monthName,
    startMonthIdx: start.monthIdx,
    startDay: start.day,
    endYear: end.year,
    endMonth: end.monthName,
    endMonthIdx: end.monthIdx,
    endDay: end.day,
    month: monthLabel
  };
}

export function getNextWeekRangeFromEnd(endYear: number, endMonthName: string, endDay: number) {
  const endMonthIdx = JALALI_MONTHS.indexOf(endMonthName);
  const mIdx = endMonthIdx >= 0 ? endMonthIdx : 0;
  const start = addJalaliDays(endYear, mIdx, endDay, 1);
  const end = addJalaliDays(start.year, start.monthIdx, start.day, 6);

  return {
    weekStartDay: start.day,
    weekMonth: start.monthName,
    weekEndDay: end.day,
    weekEndMonth: end.monthName,
    weekYear: start.year
  };
}

// Centralized completion date formatting: formatCompletionDate(day, monthName, year) -> 'YYYY/MM/DD'
export const formatCompletionDate = (day: number, monthName: string, year: number): string => {
  const mIndex = JALALI_MONTHS.indexOf(monthName);
  const m = mIndex !== -1 ? mIndex + 1 : 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${year}/${mm}/${dd}`;
};

// Convert Persian and Arabic digits to Latin/English digits
export function toAsciiDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

// Convert Latin digits to Persian digits
export function toPersianDigits(str: number | string): string {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 1728));
}

export interface JalaliDeadlineInfo {
  year: number;
  month: number;
  monthName: string;
  day: number;
  weekday: string;
  time?: string;
  shortDate: string; // YYYY/MM/DD or YYYY/MM/DD HH:mm
  fullDate: string;  // e.g. "چهارشنبه، ۱۵ خرداد ۱۴۰۵" or "چهارشنبه، ۱۵ خرداد ۱۴۰۵ — ۱۰:۳۰"
}

export function parseAndFormatJalaliDeadline(val: unknown): JalaliDeadlineInfo | null {
  if (!val || typeof val !== 'string') return null;
  const clean = toAsciiDigits(val.trim());
  const match = clean.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (!match) return null;

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  if (isNaN(y) || isNaN(m) || isNaN(d) || y < 1300 || y > 1500 || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }

  const monthName = JALALI_MONTHS[m - 1] || '';
  let wd = '';
  try {
    const res = getJalaliWeekday(y, m, d);
    wd = res?.weekday?.fa || '';
  } catch (_) {}

  // Optional time parsing e.g. "1405/03/15 10:30"
  const timeMatch = clean.match(/(?:[ T])(\d{1,2}):(\d{2})/);
  let timeStr = '';
  if (timeMatch) {
    const hh = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    const mmTime = String(parseInt(timeMatch[2], 10)).padStart(2, '0');
    timeStr = `${hh}:${mmTime}`;
  }

  const dFa = toPersianDigits(d);
  const yFa = toPersianDigits(y);
  const timeFa = timeStr ? toPersianDigits(timeStr) : '';

  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const shortDate = timeStr ? `${y}/${mm}/${dd} ${timeStr}` : `${y}/${mm}/${dd}`;
  const baseFullDate = wd ? `${wd}، ${dFa} ${monthName} ${yFa}` : `${dFa} ${monthName} ${yFa}`;
  const fullDate = timeFa ? `${baseFullDate} — ${timeFa}` : baseFullDate;

  return {
    year: y,
    month: m,
    monthName,
    day: d,
    weekday: wd,
    time: timeStr || undefined,
    shortDate,
    fullDate
  };
}

export interface OverdueStatus {
  isOverdue: boolean;
  daysOverdue: number;
  deadlineDisplay: string;
}

export function getDeadlineOverdueStatus(deadline: unknown, fallbackYear?: number): OverdueStatus {
  if (!deadline) {
    return { isOverdue: false, daysOverdue: 0, deadlineDisplay: '' };
  }

  let y: number | null = null;
  let m: number | null = null;
  let d: number | null = null;
  let display = '';

  if (typeof deadline === 'string') {
    const parsed = parseAndFormatJalaliDeadline(deadline);
    if (parsed) {
      y = parsed.year;
      m = parsed.month;
      d = parsed.day;
      display = parsed.fullDate;
    }
  } else if (typeof deadline === 'object' && deadline !== null) {
    const obj = deadline as any;
    d = typeof obj.day === 'number' ? obj.day : parseInt(obj.day, 10);
    if (obj.month && typeof obj.month === 'string') {
      const idx = JALALI_MONTHS.indexOf(obj.month);
      m = idx !== -1 ? idx + 1 : (parseInt(obj.month, 10) || null);
    } else if (typeof obj.month === 'number') {
      m = obj.month;
    }
    y = typeof obj.year === 'number' ? obj.year : parseInt(obj.year, 10);
    if (!y || isNaN(y)) {
      y = fallbackYear || getTodayJalali().year;
    }
    if (d && m && y && !isNaN(d) && !isNaN(m) && !isNaN(y)) {
      const parsed = parseAndFormatJalaliDeadline(`${y}/${m}/${d}${obj.time ? ' ' + obj.time : ''}`);
      if (parsed) display = parsed.fullDate;
    }
  }

  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) {
    return { isOverdue: false, daysOverdue: 0, deadlineDisplay: display };
  }

  try {
    const today = getTodayJalali();
    const gToday = jalaliToGregorian(today.year, today.monthIdx + 1, today.day);
    const gDeadline = jalaliToGregorian(y, m, d);
    const diffMs = gToday.getTime() - gDeadline.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return { isOverdue: true, daysOverdue: diffDays, deadlineDisplay: display };
    }
    return { isOverdue: false, daysOverdue: 0, deadlineDisplay: display };
  } catch (_) {
    return { isOverdue: false, daysOverdue: 0, deadlineDisplay: display };
  }
}

/**
 * Computes difference in days between two Jalali dates (inclusive of both start and end day).
 * e.g., Sat 1st to Fri 7th of same month -> 7 days.
 */
export function getJalaliDateDiffDays(sy: number, smIdx: number, sd: number, ey: number, emIdx: number, ed: number): number {
  try {
    const g1 = jalaliToGregorian(sy, smIdx + 1, sd);
    const g2 = jalaliToGregorian(ey, emIdx + 1, ed);
    return Math.round((g2.getTime() - g1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  } catch (_) {
    return 0;
  }
}

/**
 * Checks if the stored week date range represents an exact 7-day week (Saturday to Friday).
 */
export function isWeekRangeValid(data: {
  weekStartDay?: number;
  weekMonth?: string;
  weekYear?: number;
  weekEndDay?: number;
  weekEndMonth?: string;
  weekEndYear?: number;
}): boolean {
  if (!data.weekStartDay || !data.weekMonth || !data.weekEndDay) return false;
  const sMonthName = data.weekMonth;
  const eMonthName = data.weekEndMonth || data.weekMonth;
  const sMonthIdx = JALALI_MONTHS.indexOf(sMonthName);
  const eMonthIdx = JALALI_MONTHS.indexOf(eMonthName);
  if (sMonthIdx < 0 || eMonthIdx < 0) return false;
  const sy = data.weekYear || getTodayJalali().year;
  const ey = data.weekEndYear || sy;
  const diffDays = getJalaliDateDiffDays(sy, sMonthIdx, data.weekStartDay, ey, eMonthIdx, data.weekEndDay);
  return diffDays === 7;
}



