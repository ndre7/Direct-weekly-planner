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

export const LEAP_YEARS_1400_1430 = new Set([1403, 1407, 1411, 1415, 1419, 1423, 1428]);

export const isLeapJalali = (jy: number): boolean => {
  if (jy >= 1400 && jy <= 1430) {
    return LEAP_YEARS_1400_1430.has(jy);
  }
  // Standard Birashk Jalali algorithm for other years
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

export function getTodayJalali(date: Date = new Date()) {
  try {
    const gy = date.getFullYear();
    const gm = date.getMonth() + 1;
    const gd = date.getDate();
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

export function getCurrentJalaliWeekRange(date: Date = new Date()) {
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

