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
  Flame,
  GraduationCap,
  Activity
} from 'lucide-react';

interface DayInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PlannerData;
  lang: 'fa' | 'en';
}

import { 
  JALALI_MONTHS, 
  JALALI_WEEKDAYS, 
  YEARS_1400_TO_1430, 
  getJalaliWeekday, 
  getDaysInJalaliMonth,
  jalaliToGregorian,
  getTodayJalali,
  isLeapJalali
} from '../utils/jalali';

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

export default function DayInspectorModal({ isOpen, onClose, data, lang }: DayInspectorModalProps) {
  const isRtl = lang === 'fa';

  // E2 & E7: Extract current default month/year from data with correct token indexing:
  // In data.month («1405 خرداد»), year is tokens[0], month is tokens[1]
  const todayJalali = getTodayJalali();

  let initialYear = data.weekYear;
  let initialMonthName = data.weekMonth;

  if ((!initialYear || !initialMonthName) && data.month) {
    const parts = data.month.trim().split(/\s+/);
    if (parts.length >= 2) {
      const p0Num = parseInt(PERS_TO_ENG_DIGITS(parts[0]), 10);
      const p1Num = parseInt(PERS_TO_ENG_DIGITS(parts[1]), 10);
      if (!isNaN(p0Num) && p0Num >= 1300 && p0Num <= 1500) {
        initialYear = initialYear || p0Num;
        if (JALALI_MONTHS.includes(parts[1])) {
          initialMonthName = initialMonthName || parts[1];
        }
      } else if (!isNaN(p1Num) && p1Num >= 1300 && p1Num <= 1500) {
        initialYear = initialYear || p1Num;
        if (JALALI_MONTHS.includes(parts[0])) {
          initialMonthName = initialMonthName || parts[0];
        }
      }
    }
  }

  const defaultYear = (initialYear && initialYear >= 1300 && initialYear <= 1500) ? initialYear : todayJalali.year;
  const defaultMonthName = (initialMonthName && JALALI_MONTHS.includes(initialMonthName)) ? initialMonthName : todayJalali.monthName;
  const defaultDay = (data.weekStartDay && data.weekStartDay >= 1 && data.weekStartDay <= 31) ? data.weekStartDay : todayJalali.day;

  // States
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthName);
  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);
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
    invalidFormat: isRtl ? 'فرمت تاریخ ناهمخوان است (مثال: ۱۴۰۵/۰۳/۱۵)' : 'Invalid date format (e.g., 1405/03/15)',
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
    habitsTitle: isRtl ? 'عادت‌ها و روتین‌های روز' : "Habits & Routines",
    noHabits: isRtl ? 'هیچ عادتی ثبت نشده است.' : 'No habits registered.',
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

  // E3: Calculate corresponding weekday using UTC-safe getJalaliWeekday (no timezone shift)
  const calculatedWeekdayKey = useMemo(() => {
    try {
      const monthIdx = JALALI_MONTHS.indexOf(selectedMonth) + 1;
      if (monthIdx === 0) return null;
      const jw = getJalaliWeekday(selectedYear, monthIdx, selectedDay);
      return jw.weekday.key;
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

  // Helper: Match normalized Jalali date string (YYYY/MM/DD, YYYY-MM-DD, Persian/English digits)
  const matchesTargetDate = (dateStr?: string) => {
    if (!dateStr) return false;
    const clean = PERS_TO_ENG_DIGITS(dateStr).trim();
    const match = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      const monthIdx = JALALI_MONTHS.indexOf(selectedMonth) + 1;
      return y === selectedYear && m === monthIdx && d === selectedDay;
    }
    // Also match "DD MonthName" or "MonthName DD"
    if (selectedMonth && clean.includes(selectedMonth)) {
      const leadingDay = clean.match(/^(\d{1,2})\s+/);
      const trailingDay = clean.match(/(\d{1,2})\s*$/);
      const dayNum = leadingDay ? parseInt(leadingDay[1], 10) : trailingDay ? parseInt(trailingDay[1], 10) : NaN;
      if (dayNum === selectedDay) {
        const yearMatch = clean.match(/(\d{4})/);
        if (!yearMatch || parseInt(yearMatch[1], 10) === selectedYear) {
          return true;
        }
      }
    }
    return false;
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
      const isCompletedToday = task.status === 'completed' && (task.completionDate === dateString || matchesTargetDate(task.completionDate));
      
      // Deadline matches today
      const hasDeadlineToday = task.deadline && 
        task.deadline.day === selectedDay && 
        task.deadline.month === selectedMonth;

      return isCompletedToday || hasDeadlineToday;
    });
  }, [data.secondaryTasks, dateString, selectedDay, selectedMonth, selectedYear]);

  // 4. Gather Core tasks with deadline today
  const todayCoreTasks = useMemo(() => {
    return (data.coreTasks || []).filter(task => {
      return task.deadline && 
        task.deadline.day === selectedDay && 
        task.deadline.month === selectedMonth;
    });
  }, [data.coreTasks, selectedDay, selectedMonth]);

  // 4.5 Gather Exams & Presentations on this day
  const todayExams = useMemo(() => {
    const list: Array<{ id: string; text: string; columnTitle?: string; date?: string; type?: string; description?: string; completed?: boolean; time?: string }> = [];
    (data.examColumns || []).forEach(col => {
      col.items.forEach(item => {
        const matchesDate = matchesTargetDate(item.date);
        const matchesDeadline = item.deadline && item.deadline.day === selectedDay && item.deadline.month === selectedMonth;
        if (matchesDate || matchesDeadline) {
          list.push({ ...item, columnTitle: col.titleFa });
        }
      });
    });
    return list;
  }, [data.examColumns, selectedDay, selectedMonth, selectedYear]);

  // 4.6 Gather Deadlines on this day from Details tab (E4: matching item.date normalized)
  const todayDeadlines = useMemo(() => {
    const list: Array<{ id: string; text: string; columnTitle?: string; completed?: boolean; date?: string }> = [];
    (data.detailsColumns || []).forEach(col => {
      col.items.forEach(item => {
        const matchesDate = matchesTargetDate(item.date);
        const matchesDeadlineObj = item.deadline && item.deadline.day === selectedDay && item.deadline.month === selectedMonth;
        if (matchesDate || matchesDeadlineObj) {
          list.push({ ...item, columnTitle: col.titleFa });
        }
      });
    });
    return list;
  }, [data.detailsColumns, selectedDay, selectedMonth, selectedYear]);

  // E5 & E8: Show ALL reminders (with check status for selected day and guarded checkedDays)
  const todayHabits = useMemo(() => {
    return data.reminders || [];
  }, [data.reminders]);

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
                  onChange={(e) => {
                    const y = parseInt(e.target.value);
                    setSelectedYear(y);
                    const maxD = getDaysInMonth(selectedMonth, y);
                    if (selectedDay > maxD) {
                      setSelectedDay(maxD);
                    }
                  }}
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

          {/* Weekday Banner & Productivity Stats Summary */}
          {currentWeekdayNames && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 text-white rounded-2xl shadow-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-200 shrink-0" />
                  <span className="font-black text-xs sm:text-sm">
                    {t.weekdayLabel} {isRtl ? currentWeekdayNames.fa : currentWeekdayNames.en}
                  </span>
                </div>

                {/* Yesterday / Today / Tomorrow Quick Jump */}
                <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-xl backdrop-blur-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDay > 1) {
                        setSelectedDay(prev => prev - 1);
                      } else {
                        const mIdx = JALALI_MONTHS.indexOf(selectedMonth);
                        if (mIdx > 0) {
                          const prevMonth = JALALI_MONTHS[mIdx - 1];
                          setSelectedMonth(prevMonth);
                          setSelectedDay(getDaysInMonth(prevMonth, selectedYear));
                        } else {
                          // E6: 1 Farvardin -> Esfand of previous year with leap year length
                          const prevYear = selectedYear - 1;
                          const prevMonth = JALALI_MONTHS[11]; // 'اسفند'
                          setSelectedYear(prevYear);
                          setSelectedMonth(prevMonth);
                          setSelectedDay(getDaysInMonth(prevMonth, prevYear));
                        }
                      }
                    }}
                    className="px-2.5 py-1 hover:bg-white/20 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                  >
                    {isRtl ? '← روز قبل' : '← Prev Day'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedYear(defaultYear);
                      setSelectedMonth(defaultMonthName);
                      setSelectedDay(defaultDay);
                    }}
                    className="px-2.5 py-1 bg-white text-indigo-700 hover:bg-indigo-50 text-[10px] font-black rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    {isRtl ? 'امروز هفته' : 'Week Today'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const maxD = getDaysInMonth(selectedMonth, selectedYear);
                      if (selectedDay < maxD) {
                        setSelectedDay(prev => prev + 1);
                      } else {
                        const mIdx = JALALI_MONTHS.indexOf(selectedMonth);
                        if (mIdx < JALALI_MONTHS.length - 1) {
                          const nextMonth = JALALI_MONTHS[mIdx + 1];
                          setSelectedMonth(nextMonth);
                          setSelectedDay(1);
                        } else {
                          // Last day of Esfand -> 1 Farvardin of next year
                          const nextYear = selectedYear + 1;
                          setSelectedYear(nextYear);
                          setSelectedMonth(JALALI_MONTHS[0]);
                          setSelectedDay(1);
                        }
                      }
                    }}
                    className="px-2.5 py-1 hover:bg-white/20 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                  >
                    {isRtl ? 'روز بعد →' : 'Next Day →'}
                  </button>
                </div>

                <span className="font-mono font-bold text-xs bg-indigo-900/60 border border-indigo-400/35 px-3 py-1 rounded-lg">
                  {dateString}
                </span>
              </div>

              {/* Productivity Overview Cards */}
              {(() => {
                const totalItems = todayClasses.length + todayTasks.length + todayExams.length + todayDeadlines.length + todayCoreTasks.length + todayHabits.length + todaySecondaryTasks.length;
                const completedTasks = todayTasks.filter(t => t.status === 'completed' && (t.completionDate === dateString || matchesTargetDate(t.completionDate))).length;
                const completedCore = todayCoreTasks.filter(t => t.status === 'completed').length;
                const completedSec = todaySecondaryTasks.filter(t => t.status === 'completed').length;
                const totalCompleted = completedTasks + completedCore + completedSec;

                const completionPercentage = totalItems > 0 ? Math.round((totalCompleted / Math.max(1, (todayTasks.length + todayCoreTasks.length + todaySecondaryTasks.length))) * 100) : 0;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-black text-indigo-700">{isRtl ? 'مجموع رویدادها و کارها:' : 'Total Items:'}</span>
                      <span className="text-lg font-black text-indigo-900">{totalItems}</span>
                    </div>

                    <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-black text-emerald-700">{isRtl ? 'کارهای تکمیل شده:' : 'Completed Tasks:'}</span>
                      <span className="text-lg font-black text-emerald-900">{totalCompleted}</span>
                    </div>

                    <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-black text-amber-700">{isRtl ? 'کلاس‌ها و امتحانات:' : 'Classes & Exams:'}</span>
                      <span className="text-lg font-black text-amber-900">{todayClasses.length + todayExams.length}</span>
                    </div>

                    <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-black text-blue-700">{isRtl ? 'نرخ موفقیت روز:' : 'Success Rate:'}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-black text-blue-900">{completionPercentage}%</span>
                        <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, completionPercentage)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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

            {/* 3.5 Exams & Presentations */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <GraduationCap className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{isRtl ? 'امتحانات و ارائه‌ها' : 'Exams & Presentations'}</span>
                </div>
                {todayExams.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayExams.map(ex => (
                      <div key={ex.id} className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span className="text-rose-900">{ex.text}</span>
                          {ex.type && (
                            <span className="text-[9px] bg-rose-100 text-rose-800 font-black px-2 py-0.5 rounded-md">
                              {ex.type}
                            </span>
                          )}
                        </div>
                        {ex.description && (
                          <p className="text-[9px] text-slate-500 font-medium leading-relaxed">{ex.description}</p>
                        )}
                        {ex.columnTitle && (
                          <span className="inline-block text-[8px] text-rose-500 font-bold">{ex.columnTitle}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{isRtl ? 'هیچ امتحان یا ارائه‌ای در این روز ثبت نشده است' : 'No exams or presentations on this date'}</p>
                )}
              </div>
            </div>

            {/* 3.6 Deadlines */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <Activity className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{isRtl ? 'ددلاین‌های ثبت شده' : 'Registered Deadlines'}</span>
                </div>
                {todayDeadlines.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayDeadlines.map(d => (
                      <div key={d.id} className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{d.text}</span>
                        {d.columnTitle && (
                          <span className="text-[9px] bg-blue-100 text-blue-800 font-black px-2 py-0.5 rounded-md">
                            {d.columnTitle}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{isRtl ? 'هیچ ددلاینی برای این روز ثبت نشده است' : 'No deadlines on this date'}</p>
                )}
              </div>
            </div>
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

            {/* 4. Habits active on this day (E5: show all reminders with check status for selected day and counter X of Y) */}
            <div className="border border-slate-200/80 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2 mb-2">
                  <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-black text-xs text-slate-700">{t.habitsTitle}</span>
                </div>
                {todayHabits.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {todayHabits.map(h => {
                      const isCheckedToday = calculatedWeekdayKey ? (h.checkedDays || []).includes(calculatedWeekdayKey) : false;
                      const target = h.targetCount || 1;
                      const checkedCount = (h.checkedDays || []).length;

                      let progressCount = checkedCount;
                      let targetGoal = target;
                      let periodText = isRtl ? 'در هفته' : '/ week';

                      if (h.frequency === 'times_per_week') {
                        progressCount = checkedCount;
                        targetGoal = target;
                        periodText = isRtl ? 'در هفته' : '/ week';
                      } else if (h.frequency === 'times_per_month') {
                        progressCount = checkedCount;
                        targetGoal = target;
                        periodText = isRtl ? 'در ماه' : '/ month';
                      } else if (target > 1) {
                        const dayProg = (calculatedWeekdayKey && h.dayProgress && h.dayProgress[calculatedWeekdayKey]) || (isCheckedToday ? target : 0);
                        progressCount = dayProg;
                        targetGoal = target;
                        periodText = isRtl ? 'امروز' : 'today';
                      } else {
                        progressCount = checkedCount;
                        targetGoal = 7;
                        periodText = isRtl ? 'روز در هفته' : 'days/week';
                      }

                      return (
                        <div key={h.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isCheckedToday ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'}`} />
                            <span className={isCheckedToday ? 'text-slate-900 font-bold' : 'text-slate-600'}>
                              {isRtl ? h.textFa : (h.textEn || h.textFa)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-500 font-medium">
                              {progressCount} {isRtl ? 'از' : 'of'} {targetGoal} {periodText}
                            </span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black ${
                              isCheckedToday ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isCheckedToday ? (isRtl ? '✓ انجام شده' : '✓ Done') : (isRtl ? 'انجام نشده' : 'Pending')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
