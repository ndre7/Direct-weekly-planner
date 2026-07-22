import React, { useState, useMemo } from 'react';
import { PlannerData, ClassSlot, DailyTask, SecondaryTask, ReminderItem, CoreTask } from '../types';
import { 
  X, 
  Calendar, 
  BookOpen, 
  CheckSquare, 
  AlertCircle, 
  Sparkles, 
  Clock, 
  ArrowRight,
  ClipboardList,
  Flame
} from 'lucide-react';

interface DayInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PlannerData;
  lang: 'fa' | 'en';
}

import { JALALI_MONTHS, JALALI_WEEKDAYS, YEARS_1400_TO_1430, getJalaliWeekday, getDaysInJalaliMonth } from '../utils/jalali';

const JALALI_MONTHS_EN = [
  'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar',
  'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'
];

const WEEKDAY_NAMES_MAP: { [key: string]: { fa: string; en: string } } = {
  'saturday': { fa: 'شنبه', en: 'Saturday' },
  'sunday': { fa: 'یکشنبه', en: 'Sunday' },
  'monday': { fa: 'دوشنبه', en: 'Monday' },
  'tuesday': { fa: 'سه‌شنبه', en: 'Tuesday' },
  'wednesday': { fa: 'چهارشنبه', en: 'Wednesday' },
  'thursday': { fa: 'پنج‌شنبه', en: 'Thursday' },
  'friday': { fa: 'جمعه', en: 'Friday' }
};

const PERS_TO_ENG_DIGITS = (str: string) => {
  return str.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString())
            .replace(/[۰-۹]/g, (d) => (d.charCodeAt(0) - 1776).toString());
};

// Simple helper to get days in month
const getDaysInMonth = (monthName: string, year: number): number => {
  return getDaysInJalaliMonth(monthName, year);
};

// Convert Jalali date to standard Gregorian Date to find weekday
function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
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
    const date = new Date(Date.UTC(y, m - 1, mDay));
    return date;
  };

  const jdn = jalaliToJulianDay(jy, jm, jd);
  return julianToGregorian(jdn);
}

export default function DayInspectorModal({ isOpen, onClose, data, lang }: DayInspectorModalProps) {
  const isRtl = lang === 'fa';

  // Extract current default month/year from data
  const defaultMonthName = data.weekMonth || (data.month ? data.month.split(' ')[0] : 'خرداد');
  const defaultYear = data.weekYear || (data.month && parseInt(data.month.split(' ')[1]) ? parseInt(data.month.split(' ')[1]) : 1406);

  // States
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthName);
  const [selectedDay, setSelectedDay] = useState<number>(data.weekStartDay || 15);
  const [typedDate, setTypedDate] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Synchronize state when dropdowns change, or when text is parsed
  const dateString = useMemo(() => {
    const monthIdx = JALALI_MONTHS.indexOf(selectedMonth) + 1;
    const mStr = monthIdx < 10 ? `0${monthIdx}` : `${monthIdx}`;
    const dStr = selectedDay < 10 ? `0${selectedDay}` : `${selectedDay}`;
    return `${selectedYear}/${mStr}/${dStr}`;
  }, [selectedYear, selectedMonth, selectedDay]);

  // Translate labels
  const t = {
    title: isRtl ? 'روزبین (جستجو و بررسی روزنامه)' : 'Day Inspector (Day at a Glance)',
    subtitle: isRtl ? 'مشاهده تمامی کلاس‌ها، کارهای انجام شده، ددلاین‌ها و عادت‌های یک تاریخ خاص' : 'Inspect classes, completed tasks, deadlines, and habits of any date',
    yearLabel: isRtl ? 'سال' : 'Year',
    monthLabel: isRtl ? 'ماه' : 'Month',
    dayLabel: isRtl ? 'روز' : 'Day',
    typeOrSelect: isRtl ? 'یا وارد کردن دستی تاریخ:' : 'Or enter manually (YYYY/MM/DD):',
    invalidFormat: isRtl ? 'فرمت تاریخ ناهمخوان است (مثال: ۱۴۰۶/۰۳/۱۵)' : 'Invalid date format (e.g., 1406/03/15)',
    summaryTitle: isRtl ? `خلاصه وضعیت روز: ${dateString}` : `Day Summary: ${dateString}`,
    weekdayLabel: isRtl ? 'روز هفته:' : 'Day of Week:',
    classesTitle: isRtl ? 'کلاس‌های ثبت‌شده امروز' : "Today's Scheduled Classes",
    noClasses: isRtl ? 'امروز هیچ کلاسی ثبت نشده است.' : 'No classes scheduled for today.',
    tasksTitle: isRtl ? 'کارهای اصلی روز (TO DO LIST)' : "Daily Tasks",
    noTasks: isRtl ? 'امروز هیچ کار زمان‌داری ثبت نشده است.' : 'No daily tasks scheduled for today.',
    secTitle: isRtl ? 'کارهای فرعی تکمیل شده یا ددلاین‌دار' : 'Completed / Due Secondary Tasks',
    noSec: isRtl ? 'هیچ کار فرعی برای امروز یافت نشد.' : 'No secondary tasks for today.',
    coreDeadlinesTitle: isRtl ? 'ددلاین کارهای اصلی' : 'Core Task Deadlines',
    noCore: isRtl ? 'هیچ ددلاین اصلی برای امروز وجود ندارد.' : 'No core task deadlines today.',
    habitsTitle: isRtl ? 'عادت‌ها و روتین‌های فعال امروز' : "Today's Active Habits",
    noHabits: isRtl ? 'هیچ عادتی برای این روز هفته فعال نیست.' : 'No active habits for this day.',
    closeBtn: isRtl ? 'بستن' : 'Close',
    completed: isRtl ? 'انجام شده' : 'Completed',
    pending: isRtl ? 'در حال انجام' : 'Pending',
    failed: isRtl ? 'گذشته/تعلیق' : 'Expired'
  };

  // Convert month indices to bilingual labels
  const getMonthDisplayName = (mName: string) => {
    const idx = JALALI_MONTHS.indexOf(mName);
    if (idx === -1) return mName;
    return isRtl ? mName : JALALI_MONTHS_EN[idx];
  };

  // Calculate corresponding weekday
  const calculatedWeekdayKey = useMemo(() => {
    try {
      const monthIdx = JALALI_MONTHS.indexOf(selectedMonth) + 1;
      if (monthIdx === 0) return null;
      const gDate = jalaliToGregorian(selectedYear, monthIdx, selectedDay);
      const gDay = gDate.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
      
      const weekdayIndexMap: { [key: number]: string } = {
        0: 'sunday',
        1: 'monday',
        2: 'tuesday',
        3: 'wednesday',
        4: 'thursday',
        5: 'friday',
        6: 'saturday'
      };
      return weekdayIndexMap[gDay];
    } catch {
      return null;
    }
  }, [selectedYear, selectedMonth, selectedDay]);

  // Handle typing manual date
  const handleTypeDateChange = (val: string) => {
    setTypedDate(val);
    const cleanVal = PERS_TO_ENG_DIGITS(val).trim();
    if (!cleanVal) {
      setInputError(null);
      return;
    }
    
    // Check regex like YYYY/MM/DD
    const match = cleanVal.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (match) {
      const y = parseInt(match[1]);
      const mIdx = parseInt(match[2]) - 1;
      const d = parseInt(match[3]);

      if (y >= 1300 && y <= 1500 && mIdx >= 0 && mIdx <= 11 && d >= 1 && d <= 31) {
        setSelectedYear(y);
        setSelectedMonth(JALALI_MONTHS[mIdx]);
        // Cap day to month length
        const maxD = getDaysInMonth(JALALI_MONTHS[mIdx], y);
        setSelectedDay(Math.min(d, maxD));
        setInputError(null);
      } else {
        setInputError(t.invalidFormat);
      }
    } else {
      setInputError(t.invalidFormat);
    }
  };

  // 1. Gather Classes on this weekday
  const todayClasses = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.classesSchedule || []).filter(c => c.dayKey === calculatedWeekdayKey);
  }, [data.classesSchedule, calculatedWeekdayKey]);

  // 2. Gather Daily tasks on this weekday
  const todayTasks = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.dailyTasks || {})[calculatedWeekdayKey] || [];
  }, [data.dailyTasks, calculatedWeekdayKey]);

  // 3. Gather Secondary Tasks: completed on this date OR deadline is today
  const todaySecondaryTasks = useMemo(() => {
    return (data.secondaryTasks || []).filter(task => {
      // Completed on this date
      const isCompletedToday = task.status === 'completed' && task.completionDate === dateString;
      
      // Deadline matches today
      const hasDeadlineToday = task.deadline && 
        task.deadline.day === selectedDay && 
        task.deadline.month === selectedMonth;

      return isCompletedToday || hasDeadlineToday;
    });
  }, [data.secondaryTasks, dateString, selectedDay, selectedMonth]);

  // 4. Gather Core tasks with deadline today
  const todayCoreTasks = useMemo(() => {
    return (data.coreTasks || []).filter(task => {
      return task.deadline && 
        task.deadline.day === selectedDay && 
        task.deadline.month === selectedMonth;
    });
  }, [data.coreTasks, selectedDay, selectedMonth]);

  // 5. Gather Habits active on this weekday
  const todayHabits = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.reminders || []).filter(r => r.checkedDays.includes(calculatedWeekdayKey));
  }, [data.reminders, calculatedWeekdayKey]);

  if (!isOpen) return null;

  const currentWeekdayNames = calculatedWeekdayKey ? WEEKDAY_NAMES_MAP[calculatedWeekdayKey] : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div 
        className="bg-white rounded-3xl border border-slate-200/85 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-right animate-in fade-in zoom-in duration-150"
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-3xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <h3 className="font-black text-sm text-slate-800">{t.title}</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t.subtitle}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer shadow-3xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Wrapper */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top Control Block: Selectors & Manual Type */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-5 bg-indigo-50/20 border border-indigo-100/50 rounded-2xl">
            
            {/* Dropdown selectors */}
            <div className="md:col-span-8 grid grid-cols-3 gap-3">
              {/* Year */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-black block text-right">{t.yearLabel}</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {YEARS_1400_TO_1430.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Month */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-black block text-right">{t.monthLabel}</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    const m = e.target.value;
                    setSelectedMonth(m);
                    // Adjust day if it exceeds max days in new month
                    const maxD = getDaysInMonth(m, selectedYear);
                    if (selectedDay > maxD) {
                      setSelectedDay(maxD);
                    }
                  }}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {JALALI_MONTHS.map(m => (
                    <option key={m} value={m}>{getMonthDisplayName(m)}</option>
                  ))}
                </select>
              </div>

              {/* Day */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-black block text-right">{t.dayLabel}</label>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {Array.from({ length: getDaysInMonth(selectedMonth, selectedYear) }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Manual Type Input */}
            <div className="md:col-span-4 space-y-1">
              <label className="text-[10px] text-slate-400 font-black block text-right">{t.typeOrSelect}</label>
              <input
                type="text"
                value={typedDate}
                onChange={(e) => handleTypeDateChange(e.target.value)}
                placeholder="۱۴۰۶/۰۳/۱۵"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {inputError && (
                <p className="text-[8px] font-bold text-red-500 mt-1">{inputError}</p>
              )}
            </div>

          </div>

          {/* Interactive Visual Calendar Grid with Weekday Headers */}
          {(() => {
            const mIdx = JALALI_MONTHS.indexOf(selectedMonth);
            const firstDayWeekdayIdx = mIdx >= 0 ? getJalaliWeekday(selectedYear, mIdx + 1, 1).index : 0;
            const daysCount = getDaysInJalaliMonth(selectedMonth, selectedYear);

            return (
              <div className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 px-1 mb-1">
                  <span>{isRtl ? `تقویم ماهانه: ${selectedMonth} ${selectedYear}` : `Monthly Calendar: ${selectedMonth} ${selectedYear}`}</span>
                  <span className="text-[10px] text-indigo-600 font-bold">{isRtl ? 'انتخاب مستقیم روزها' : 'Select date directly'}</span>
                </div>

                {/* Weekday headers row */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {JALALI_WEEKDAYS.map(w => (
                    <div key={`dim-w-${w.key}`} className="p-1 text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100/60 rounded-lg text-center flex items-center justify-center">
                      {isRtl ? w.fa : w.en.slice(0, 3)}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {/* Empty padding cells */}
                  {Array.from({ length: firstDayWeekdayIdx }).map((_, idx) => (
                    <div key={`dim-pad-${idx}`} className="p-1.5" />
                  ))}

                  {Array.from({ length: daysCount }, (_, i) => i + 1).map(d => {
                    const isSelected = selectedDay === d;
                    return (
                      <button
                        key={`dim-day-${d}`}
                        type="button"
                        onClick={() => setSelectedDay(d)}
                        className={`p-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300 scale-105'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/70 shadow-2xs'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Weekday Banner Summary */}
          {currentWeekdayNames && (
            <div className="flex items-center justify-between p-4 bg-indigo-600 text-white rounded-2xl shadow-3xs">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-200 shrink-0" />
                <span className="font-black text-xs">
                  {t.weekdayLabel} {isRtl ? currentWeekdayNames.fa : currentWeekdayNames.en}
                </span>
              </div>
              <span className="font-mono font-bold text-xs bg-indigo-700/60 border border-indigo-400/35 px-3 py-1 rounded-lg">
                {dateString}
              </span>
            </div>
          )}

          {/* Bento-Grid Day Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* 1. Classes Schedule Grid */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{t.classesTitle}</span>
                </div>
                {todayClasses.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayClasses.map(c => (
                      <div key={c.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{isRtl ? c.textFa : (c.textEn || c.textFa)}</span>
                        <span className="text-[9px] bg-slate-200/80 px-2 py-0.5 rounded-md font-mono text-slate-500">{isRtl ? c.timeFa : (c.timeEn || c.timeFa)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noClasses}</p>
                )}
              </div>
            </div>

            {/* 2. Daily Tasks Grid */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{t.tasksTitle}</span>
                </div>
                {todayTasks.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayTasks.map(t => {
                      const isCompletedOnThisDay = t.status === 'completed' && t.completionDate === dateString;
                      const isCompletedOnOtherDay = t.status === 'completed' && t.completionDate !== dateString;
                      
                      let badgeClass = 'bg-slate-200 text-slate-600';
                      let statusLabel = isRtl ? 'در انتظار' : 'Pending';
                      
                      if (isCompletedOnThisDay) {
                        badgeClass = 'bg-emerald-100 text-emerald-800';
                        statusLabel = isRtl ? '✓ انجام شده در این روز' : '✓ Completed today';
                      } else if (isCompletedOnOtherDay) {
                        badgeClass = 'bg-amber-100 text-amber-800';
                        statusLabel = isRtl ? `تکمیل شده در روز دیگر (${t.completionDate})` : `Completed on other date (${t.completionDate})`;
                      } else if (t.status === 'failed') {
                        badgeClass = 'bg-red-100 text-red-800';
                        statusLabel = isRtl ? '✗ ناموفق' : '✗ Failed';
                      }

                      return (
                        <div key={t.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                          <span>{isRtl ? t.textFa : (t.textEn || t.textFa)}</span>
                          <span className={`text-[8px] px-2 py-0.5 rounded-md font-black ${badgeClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noTasks}</p>
                )}
              </div>
            </div>

            {/* 3. Core Task Deadlines */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{t.coreDeadlinesTitle}</span>
                </div>
                {todayCoreTasks.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayCoreTasks.map(t => {
                      let badgeClass = 'bg-amber-100 text-amber-800';
                      let statusLabel = isRtl ? 'در انتظار ددلاین' : 'Pending';
                      
                      if (t.status === 'completed') {
                        badgeClass = 'bg-emerald-100 text-emerald-800';
                        statusLabel = isRtl ? '✓ انجام شده' : '✓ Completed';
                      } else if (t.status === 'failed') {
                        badgeClass = 'bg-red-100 text-red-800';
                        statusLabel = isRtl ? '✗ ناموفق' : '✗ Failed';
                      }

                      return (
                        <div key={t.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span>{t.title}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black ${badgeClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                          {t.description && (
                            <p className="text-[9px] text-slate-400 font-medium leading-relaxed">{t.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noCore}</p>
                )}
              </div>
            </div>

            {/* 4. Habits active on this day */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{t.habitsTitle}</span>
                </div>
                {todayHabits.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayHabits.map(h => (
                      <div key={h.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{isRtl ? h.textFa : (h.textEn || h.textFa)}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400">
                            {h.checkedDays.length} {isRtl ? 'روز در هفته' : 'days/week'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noHabits}</p>
                )}
              </div>
            </div>

            {/* 5. Secondary Tasks completed / due */}
            <div className="md:col-span-2 border border-slate-200/80 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                <ClipboardList className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="font-black text-xs text-slate-700">{t.secTitle}</span>
              </div>
              {todaySecondaryTasks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                  {todaySecondaryTasks.map(t => {
                    let badgeClass = 'bg-slate-200 text-slate-600';
                    let statusLabel = isRtl ? 'در انتظار' : 'Pending';
                    
                    if (t.status === 'completed') {
                      badgeClass = 'bg-emerald-100 text-emerald-800';
                      statusLabel = isRtl ? '✓ انجام شده' : '✓ Completed';
                    } else if (t.status === 'failed') {
                      badgeClass = 'bg-red-100 text-red-800';
                      statusLabel = isRtl ? '✗ ناموفق / تعلیق' : '✗ Failed';
                    }

                    return (
                      <div key={t.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex flex-col justify-between gap-1 text-xs font-bold text-slate-800">
                        <div className="flex justify-between gap-2">
                          <span>{isRtl ? t.textFa : (t.textEn || t.textFa)}</span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black whitespace-nowrap self-start ${badgeClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                        {t.completionDate === dateString && (
                          <p className="text-[8px] text-emerald-600 font-bold">
                            {isRtl ? `✓ تکمیل شده در این تاریخ` : `✓ Completed on this date`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 font-bold py-1">{t.noSec}</p>
              )}
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-xs rounded-xl transition-all cursor-pointer shadow-3xs"
          >
            {t.closeBtn}
          </button>
        </div>

      </div>
    </div>
  );
}
