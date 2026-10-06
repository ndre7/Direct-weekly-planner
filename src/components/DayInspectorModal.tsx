import React, { useState, useMemo, useEffect } from 'react';
import { PlannerData } from '../types';
import { 
  X, 
  Calendar, 
  BookOpen, 
  CheckSquare, 
  AlertCircle, 
  Clock, 
  ClipboardList, 
  Flame, 
  GraduationCap, 
  Activity,
  FileText,
  Ban,
  Lightbulb,
  ListTodo
} from 'lucide-react';
import { 
  JALALI_MONTHS, 
  JALALI_WEEKDAYS, 
  YEARS_1400_TO_1430, 
  getJalaliWeekday, 
  getDaysInJalaliMonth,
  jalaliToGregorian,
  getTodayJalali
} from '../utils/jalali';
import { db, auth } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface DayInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PlannerData;
  lang: 'fa' | 'en';
}

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

const getDaysInMonth = (monthName: string, year: number): number => {
  return getDaysInJalaliMonth(monthName, year);
};

export type DayRecordKind = 
  | 'daily' 
  | 'class' 
  | 'core' 
  | 'secondary' 
  | 'habit' 
  | 'exam' 
  | 'detail' 
  | 'postponed' 
  | 'event' 
  | 'thought' 
  | 'todo' 
  | 'freeNote';

export interface UnifiedDayRecord {
  id: string;
  kind: DayRecordKind;
  title: string;
  subtitle?: string;
  status: 'completed' | 'pending' | 'failed' | 'postponed' | 'cancelled' | 'info';
  time?: string;
  date?: string;
  categoryName?: string;
  raw?: any;
}

export default function DayInspectorModal({ isOpen, onClose, data, lang }: DayInspectorModalProps) {
  const isRtl = lang === 'fa';

  // E2 & E7: Extract current default month/year from data with correct token indexing
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

  // I6: On-demand Daily Snapshot cache state
  const [snapshotData, setSnapshotData] = useState<any>(null);

  // Synchronize state when dropdowns change
  const dateString = useMemo(() => {
    const monthIdx = JALALI_MONTHS.indexOf(selectedMonth) + 1;
    const mStr = monthIdx < 10 ? `0${monthIdx}` : `${monthIdx}`;
    const dStr = selectedDay < 10 ? `0${selectedDay}` : `${selectedDay}`;
    return `${selectedYear}/${mStr}/${dStr}`;
  }, [selectedYear, selectedMonth, selectedDay]);

  // Gregorian ISO date string for snapshot query
  const dateISO = useMemo(() => {
    try {
      const monthIdx = JALALI_MONTHS.indexOf(selectedMonth) + 1;
      const gDate = jalaliToGregorian(selectedYear, monthIdx, selectedDay);
      const gy = gDate.getUTCFullYear();
      const gm = String(gDate.getUTCMonth() + 1).padStart(2, '0');
      const gd = String(gDate.getUTCDate()).padStart(2, '0');
      return `${gy}-${gm}-${gd}`;
    } catch {
      return '';
    }
  }, [selectedYear, selectedMonth, selectedDay]);

  // I6: On-demand fetch of dailySnapshots/{dateISO}
  useEffect(() => {
    if (!isOpen || !dateISO) {
      setSnapshotData(null);
      return;
    }

    let isMounted = true;
    const fetchSnapshot = async () => {
      try {
        const currentUid = auth.currentUser?.uid;
        if (!currentUid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          setSnapshotData(null);
          return;
        }
        const snapRef = doc(db, 'planners', currentUid, 'dailySnapshots', dateISO);
        const snap = await getDoc(snapRef);
        if (isMounted) {
          if (snap.exists()) {
            setSnapshotData(snap.data());
          } else {
            setSnapshotData(null);
          }
        }
      } catch (err) {
        console.warn('[DayInspector] Snapshot fetch error:', err);
      }
    };

    fetchSnapshot();
    return () => { isMounted = false; };
  }, [isOpen, dateISO]);

  // Bilingual UI labels
  const t = {
    title: isRtl ? 'روزبین ۳۶۰ درجه (داشبورد کامل روز)' : '360° Day Inspector (Complete Daily View)',
    subtitle: isRtl ? 'مشاهده جامع تمام کلاس‌ها، تسک‌ها، ددلاین‌ها، امتحانات، رویدادها، افکار و یادداشت‌های ثبت‌شده' : 'Inspect all scheduled classes, tasks, deadlines, exams, thoughts, and notes',
    yearLabel: isRtl ? 'سال' : 'Year',
    monthLabel: isRtl ? 'ماه' : 'Month',
    dayLabel: isRtl ? 'روز' : 'Day',
    typeOrSelect: isRtl ? 'یا وارد کردن دستی تاریخ:' : 'Or enter manually (YYYY/MM/DD):',
    invalidFormat: isRtl ? 'فرمت تاریخ ناهمخوان است (مثال: ۱۴۰۵/۰۳/۱۵)' : 'Invalid date format (e.g. 1405/03/15)',
    summaryTitle: isRtl ? `خلاصه وضعیت روز: ${dateString}` : `Day Summary: ${dateString}`,
    weekdayLabel: isRtl ? 'روز هفته:' : 'Day of Week:',
    classesTitle: isRtl ? 'کلاس‌های ثبت‌شده امروز' : "Today's Scheduled Classes",
    noClasses: isRtl ? 'امروز هیچ کلاسی ثبت نشده است.' : 'No classes scheduled for today.',
    tasksTitle: isRtl ? 'کارهای روزانه (Daily Tasks)' : "Daily Tasks",
    noTasks: isRtl ? 'امروز هیچ کار زمان‌داری ثبت نشده است.' : 'No daily tasks scheduled for today.',
    coreDeadlinesTitle: isRtl ? 'کارهای اصلی (Core Tasks)' : 'Core Tasks with Deadlines',
    noCore: isRtl ? 'هیچ ددلاین اصلی برای امروز وجود ندارد.' : 'No core task deadlines today.',
    secTitle: isRtl ? 'کارهای فرعی (Secondary Tasks)' : 'Secondary Tasks Due/Completed',
    noSec: isRtl ? 'هیچ کار فرعی برای امروز یافت نشد.' : 'No secondary tasks for today.',
    examsTitle: isRtl ? 'امتحانات و ارائه‌ها' : 'Exams & Presentations',
    noExams: isRtl ? 'هیچ امتحان یا ارائه‌ای در این روز ثبت نشده است.' : 'No exams or presentations on this date.',
    deadlinesTitle: isRtl ? 'ددلاین‌های ستون‌ها (جزئیات)' : 'Column & Detail Deadlines',
    noDeadlines: isRtl ? 'هیچ ددلاینی برای این روز ثبت نشده است.' : 'No column deadlines on this date.',
    habitsTitle: isRtl ? 'عادت‌ها و روتین‌های روز' : "Habits & Routines",
    noHabits: isRtl ? 'هیچ عادتی ثبت نشده است.' : 'No habits registered.',
    postponedTitle: isRtl ? 'رویدادهای لغو شده یا به تعویق افتاده' : 'Cancelled / Postponed Events',
    noPostponed: isRtl ? 'هیچ مورد لغو یا تعویقی برای این روز ثبت نشده است.' : 'No cancelled or postponed events for today.',
    weeklyEventsTitle: isRtl ? 'رویدادهای هفته در این روز' : 'Weekly Events (This Day)',
    noEvents: isRtl ? 'هیچ رویدادی برای این روز هفته ثبت نشده است.' : 'No weekly events for this day.',
    dailyThoughtsTitle: isRtl ? 'افکار و ایده‌های روزانه' : 'Daily Thoughts & Reflections',
    noThoughts: isRtl ? 'هیچ فکری برای این روز هفته ثبت نشده است.' : 'No thoughts recorded for this day.',
    todoTitle: isRtl ? 'فهرست چک‌لیست هفته (To-Do)' : 'Weekly To-Do Items',
    noTodo: isRtl ? 'هیچ مورد To-Do برای این روز ثبت نشده است.' : 'No to-do items for this day.',
    freeNotesTitle: isRtl ? 'یادداشت‌های آزاد هفته (بدون تاریخ مشخص)' : 'Free Weekly Notes (Undated)',
    noFreeNotes: isRtl ? 'هیچ یادداشت آزادی برای این هفته ثبت نشده است.' : 'No free notes recorded for this week.',
    closeBtn: isRtl ? 'بستن' : 'Close',
    readOnlyBadge: isRtl ? 'فقط‌خواندنی' : 'Read-only',
    undatedBadge: isRtl ? 'بدون تاریخ مشخص' : 'Undated'
  };

  const getMonthDisplayName = (mName: string) => {
    const idx = JALALI_MONTHS.indexOf(mName);
    if (idx === -1) return mName;
    return isRtl ? mName : JALALI_MONTHS_EN[idx];
  };

  // Calculate corresponding Jalali weekday
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

  // Handle manual date typing
  const handleTypeDateChange = (val: string) => {
    setTypedDate(val);
    const cleanVal = PERS_TO_ENG_DIGITS(val).trim();
    if (!cleanVal) {
      setInputError(null);
      return;
    }
    const match = cleanVal.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (match) {
      const y = parseInt(match[1]);
      const mIdx = parseInt(match[2]) - 1;
      const d = parseInt(match[3]);

      if (y >= 1300 && y <= 1500 && mIdx >= 0 && mIdx <= 11 && d >= 1 && d <= 31) {
        setSelectedYear(y);
        setSelectedMonth(JALALI_MONTHS[mIdx]);
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

  // Robust three-format date matcher (normalized slash/dash, "DD MonthName", and Gregorian ISO)
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
    // "DD MonthName" or "MonthName DD"
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
    // Gregorian ISO
    if (dateISO && clean.startsWith(dateISO)) {
      return true;
    }
    return false;
  };

  // 1. Classes on this weekday
  const todayClasses = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.classesSchedule || []).filter(c => c.dayKey === calculatedWeekdayKey);
  }, [data.classesSchedule, calculatedWeekdayKey]);

  // 2. Daily tasks on this weekday
  const todayTasks = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.dailyTasks || {})[calculatedWeekdayKey] || [];
  }, [data.dailyTasks, calculatedWeekdayKey]);

  // 3. Core tasks with deadline today or completed today
  const todayCoreTasks = useMemo(() => {
    return (data.coreTasks || []).filter(task => {
      const matchesDeadline = task.deadline && 
        task.deadline.day === selectedDay && 
        task.deadline.month === selectedMonth &&
        (!task.deadline.year || task.deadline.year === selectedYear);
      const isCompletedToday = task.status === 'completed' && matchesTargetDate(task.completionDate);
      return matchesDeadline || isCompletedToday;
    });
  }, [data.coreTasks, selectedDay, selectedMonth, selectedYear]);

  // 4. Secondary tasks: completed on this date OR deadline is today
  const todaySecondaryTasks = useMemo(() => {
    return (data.secondaryTasks || []).filter(task => {
      const isCompletedToday = task.status === 'completed' && (task.completionDate === dateString || matchesTargetDate(task.completionDate));
      const hasDeadlineToday = task.deadline && 
        task.deadline.day === selectedDay && 
        task.deadline.month === selectedMonth &&
        (!task.deadline.year || task.deadline.year === selectedYear);
      return isCompletedToday || hasDeadlineToday;
    });
  }, [data.secondaryTasks, dateString, selectedDay, selectedMonth, selectedYear]);

  // 5. Exams & Presentations on this day
  const todayExams = useMemo(() => {
    const list: Array<{ id: string; text: string; columnTitle?: string; date?: string; type?: string; description?: string; completed?: boolean; time?: string }> = [];
    (data.examColumns || []).forEach(col => {
      col.items.forEach(item => {
        const matchesDate = matchesTargetDate(item.date);
        const matchesDeadline = item.deadline && 
          item.deadline.day === selectedDay && 
          item.deadline.month === selectedMonth &&
          (!item.deadline.year || item.deadline.year === selectedYear);
        if (matchesDate || matchesDeadline) {
          list.push({ ...item, columnTitle: col.titleFa });
        }
      });
    });
    return list;
  }, [data.examColumns, selectedDay, selectedMonth, selectedYear]);

  // 6. Deadlines from Details columns
  const todayDeadlines = useMemo(() => {
    const list: Array<{ id: string; text: string; columnTitle?: string; completed?: boolean; date?: string; description?: string }> = [];
    (data.detailsColumns || []).forEach(col => {
      col.items.forEach(item => {
        const matchesDate = matchesTargetDate(item.date);
        const matchesDeadlineObj = item.deadline && 
          item.deadline.day === selectedDay && 
          item.deadline.month === selectedMonth &&
          (!item.deadline.year || item.deadline.year === selectedYear);
        if (matchesDate || matchesDeadlineObj) {
          list.push({ ...item, columnTitle: col.titleFa });
        }
      });
    });
    return list;
  }, [data.detailsColumns, selectedDay, selectedMonth, selectedYear]);

  // 7. Habits active on this day
  const todayHabits = useMemo(() => {
    return data.reminders || [];
  }, [data.reminders]);

  // 8. Postponed / Cancelled events matching today
  const todayPostponed = useMemo(() => {
    return (data.postponedEvents || []).filter(e => {
      return matchesTargetDate(e.date) || matchesTargetDate(e.newDate);
    });
  }, [data.postponedEvents, selectedDay, selectedMonth, selectedYear]);

  // 9. Weekly Events of this weekday
  const todayWeeklyEvents = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.weeklyEvents || []).filter(e => e.weekday === calculatedWeekdayKey);
  }, [data.weeklyEvents, calculatedWeekdayKey]);

  // 10. Daily Thoughts of this weekday
  const todayDailyThoughts = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.dailyThoughts || []).filter(t => t.weekday === calculatedWeekdayKey);
  }, [data.dailyThoughts, calculatedWeekdayKey]);

  // 11. To-Do List of this weekday
  const todayTodoList = useMemo(() => {
    if (!calculatedWeekdayKey) return [];
    return (data.todoList || []).filter(t => t.weekday === calculatedWeekdayKey);
  }, [data.todoList, calculatedWeekdayKey]);

  // 12. Free Notes of the week (undated)
  const freeNotesContent = useMemo(() => {
    return (data.notes || '').trim();
  }, [data.notes]);

  // I1: Unified dayRecords collection
  const dayRecords = useMemo(() => {
    const records: UnifiedDayRecord[] = [];

    // Include snapshot records if present
    if (snapshotData && Array.isArray(snapshotData.records)) {
      snapshotData.records.forEach((r: any) => {
        records.push({
          id: r.id || `snap_${Math.random()}`,
          kind: (r.kind as DayRecordKind) || 'daily',
          title: r.text || r.title || '',
          status: r.status === 'completed' ? 'completed' : r.status === 'failed' ? 'failed' : 'pending',
          date: r.completionDate || snapshotData.date,
          raw: r
        });
      });
    }

    // Live daily tasks
    todayTasks.forEach(t => {
      const isCompletedToday = t.status === 'completed' && (t.completionDate === dateString || matchesTargetDate(t.completionDate));
      records.push({
        id: t.id,
        kind: 'daily',
        title: isRtl ? t.textFa : (t.textEn || t.textFa),
        status: isCompletedToday ? 'completed' : t.status === 'failed' ? 'failed' : 'pending',
        date: t.completionDate,
        raw: t
      });
    });

    // Live classes
    todayClasses.forEach(c => {
      records.push({
        id: c.id,
        kind: 'class',
        title: isRtl ? c.textFa : (c.textEn || c.textFa),
        time: isRtl ? c.timeFa : (c.timeEn || c.timeFa),
        status: 'info',
        raw: c
      });
    });

    // Live core tasks
    todayCoreTasks.forEach(ct => {
      records.push({
        id: ct.id,
        kind: 'core',
        title: ct.title,
        subtitle: ct.description,
        status: ct.status,
        raw: ct
      });
    });

    // Live secondary tasks
    todaySecondaryTasks.forEach(st => {
      records.push({
        id: st.id,
        kind: 'secondary',
        title: isRtl ? st.textFa : (st.textEn || st.textFa),
        status: st.status,
        date: st.completionDate,
        raw: st
      });
    });

    // Live habits
    todayHabits.forEach(h => {
      const isDone = calculatedWeekdayKey ? (h.checkedDays || []).includes(calculatedWeekdayKey) : false;
      records.push({
        id: h.id,
        kind: 'habit',
        title: isRtl ? h.textFa : (h.textEn || h.textFa),
        status: isDone ? 'completed' : 'pending',
        raw: h
      });
    });

    // Live exams
    todayExams.forEach(ex => {
      records.push({
        id: ex.id,
        kind: 'exam',
        title: ex.text,
        subtitle: ex.description || ex.columnTitle,
        status: ex.completed ? 'completed' : 'pending',
        time: ex.time,
        raw: ex
      });
    });

    // Live details deadlines
    todayDeadlines.forEach(d => {
      records.push({
        id: d.id,
        kind: 'detail',
        title: d.text,
        subtitle: d.columnTitle,
        status: d.completed ? 'completed' : 'pending',
        raw: d
      });
    });

    // Live postponed / cancelled
    todayPostponed.forEach(p => {
      const isCancelled = p.action?.includes('لغو') || p.action?.toLowerCase().includes('cancel');
      records.push({
        id: p.id,
        kind: 'postponed',
        title: p.title,
        subtitle: p.description || p.type,
        status: isCancelled ? 'cancelled' : 'postponed',
        raw: p
      });
    });

    // Live weekly events
    todayWeeklyEvents.forEach(we => {
      records.push({
        id: we.id,
        kind: 'event',
        title: we.text,
        status: we.completed ? 'completed' : 'pending',
        raw: we
      });
    });

    // Live daily thoughts
    todayDailyThoughts.forEach(th => {
      records.push({
        id: th.id,
        kind: 'thought',
        title: th.text,
        status: th.completed ? 'completed' : 'pending',
        raw: th
      });
    });

    // Live to-do list
    todayTodoList.forEach(td => {
      records.push({
        id: td.id,
        kind: 'todo',
        title: td.text,
        status: td.completed ? 'completed' : 'pending',
        raw: td
      });
    });

    return records;
  }, [
    snapshotData,
    todayTasks,
    todayClasses,
    todayCoreTasks,
    todaySecondaryTasks,
    todayHabits,
    todayExams,
    todayDeadlines,
    todayPostponed,
    todayWeeklyEvents,
    todayDailyThoughts,
    todayTodoList,
    calculatedWeekdayKey,
    dateString,
    isRtl
  ]);

  // I4: Recalculated Productivity Overview stats
  const stats = useMemo(() => {
    const totalItems = todayClasses.length +
      todayTasks.length +
      todayCoreTasks.length +
      todaySecondaryTasks.length +
      todayExams.length +
      todayDeadlines.length +
      todayHabits.length +
      todayPostponed.length +
      todayWeeklyEvents.length +
      todayDailyThoughts.length +
      todayTodoList.length +
      (freeNotesContent ? 1 : 0);

    const totalActionable = todayTasks.length +
      todayCoreTasks.length +
      todaySecondaryTasks.length +
      todayHabits.length +
      todayExams.length +
      todayDeadlines.length +
      todayWeeklyEvents.length +
      todayDailyThoughts.length +
      todayTodoList.length;

    const completedTasks = todayTasks.filter(t => t.status === 'completed' && (t.completionDate === dateString || matchesTargetDate(t.completionDate))).length;
    const completedCore = todayCoreTasks.filter(t => t.status === 'completed').length;
    const completedSec = todaySecondaryTasks.filter(t => t.status === 'completed').length;
    const completedHabits = todayHabits.filter(h => calculatedWeekdayKey ? (h.checkedDays || []).includes(calculatedWeekdayKey) : false).length;
    const completedExams = todayExams.filter(e => !!e.completed).length;
    const completedDeadlines = todayDeadlines.filter(d => !!d.completed).length;
    const completedEvents = todayWeeklyEvents.filter(e => !!e.completed).length;
    const completedThoughts = todayDailyThoughts.filter(t => !!t.completed).length;
    const completedTodo = todayTodoList.filter(t => !!t.completed).length;

    const totalCompleted = completedTasks + completedCore + completedSec + completedHabits +
      completedExams + completedDeadlines + completedEvents + completedThoughts + completedTodo;

    const successRate = totalActionable > 0 ? Math.round((totalCompleted / totalActionable) * 100) : 0;

    return {
      totalItems,
      totalActionable,
      totalCompleted,
      successRate
    };
  }, [
    todayClasses.length,
    todayTasks,
    todayCoreTasks,
    todaySecondaryTasks,
    todayExams,
    todayDeadlines,
    todayHabits,
    todayPostponed.length,
    todayWeeklyEvents,
    todayDailyThoughts,
    todayTodoList,
    freeNotesContent,
    calculatedWeekdayKey,
    dateString
  ]);

  if (!isOpen) return null;

  const currentWeekdayNames = calculatedWeekdayKey ? WEEKDAY_NAMES_MAP[calculatedWeekdayKey] : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div 
        className="bg-white rounded-3xl border border-slate-200/85 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-right animate-in fade-in zoom-in duration-150"
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-3xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-slate-800">{t.title}</h3>
                <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                  {dayRecords.length} {isRtl ? 'مورد ثبتی' : 'records'}
                </span>
              </div>
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

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* Top Control Block: Selectors & Manual Type */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-indigo-50/25 border border-indigo-100/50 rounded-2xl">
            
            {/* Dropdown selectors */}
            <div className="md:col-span-8 grid grid-cols-3 gap-2.5">
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
                  className="w-full text-xs p-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                    const maxD = getDaysInMonth(m, selectedYear);
                    if (selectedDay > maxD) {
                      setSelectedDay(maxD);
                    }
                  }}
                  className="w-full text-xs p-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full text-xs p-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                className="w-full text-xs p-2 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              <div className="border border-slate-200/80 rounded-2xl p-3 sm:p-4 bg-slate-50/50 space-y-2">
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
                  {Array.from({ length: firstDayWeekdayIdx }).map((_, idx) => (
                    <div key={`dim-pad-${idx}`} className="p-1" />
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

          {/* Weekday Banner & Quick Jump */}
          {currentWeekdayNames && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-700 text-white rounded-2xl shadow-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-200 shrink-0" />
                  <span className="font-black text-xs sm:text-sm">
                    {t.weekdayLabel} {isRtl ? currentWeekdayNames.fa : currentWeekdayNames.en}
                  </span>
                </div>

                {/* Quick Day Navigator */}
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
                          const prevYear = selectedYear - 1;
                          const prevMonth = JALALI_MONTHS[11];
                          setSelectedYear(prevYear);
                          setSelectedMonth(prevMonth);
                          setSelectedDay(getDaysInMonth(prevMonth, prevYear));
                        }
                      }
                    }}
                    className="px-2 py-1 hover:bg-white/20 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
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
                          const nextYear = selectedYear + 1;
                          setSelectedYear(nextYear);
                          setSelectedMonth(JALALI_MONTHS[0]);
                          setSelectedDay(1);
                        }
                      }
                    }}
                    className="px-2 py-1 hover:bg-white/20 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                  >
                    {isRtl ? 'روز بعد →' : 'Next Day →'}
                  </button>
                </div>

                <span className="font-mono font-bold text-xs bg-indigo-900/60 border border-indigo-400/35 px-3 py-1 rounded-lg">
                  {dateString}
                </span>
              </div>

              {/* I4: Productivity Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-indigo-700">{isRtl ? 'مجموع رویدادها و کارها:' : 'Total Items:'}</span>
                  <span className="text-lg font-black text-indigo-900">{stats.totalItems}</span>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-emerald-700">{isRtl ? 'کارهای تکمیل شده:' : 'Completed Items:'}</span>
                  <span className="text-lg font-black text-emerald-900">{stats.totalCompleted}</span>
                </div>

                <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-amber-700">{isRtl ? 'کلاس‌ها و امتحانات:' : 'Classes & Exams:'}</span>
                  <span className="text-lg font-black text-amber-900">{todayClasses.length + todayExams.length}</span>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black text-blue-700">{isRtl ? 'نرخ موفقیت روز:' : 'Success Rate:'}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-blue-900">{stats.successRate}%</span>
                    <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, stats.successRate)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* I5: Bento-Grid 360° Day Dashboard (Ordered as specified in I5) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            
            {/* 1. Daily Tasks Grid */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.tasksTitle}</span>
                  </div>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    {todayTasks.length}
                  </span>
                </div>
                {todayTasks.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayTasks.map(tItem => {
                      const isCompletedOnThisDay = tItem.status === 'completed' && (tItem.completionDate === dateString || matchesTargetDate(tItem.completionDate));
                      const isCompletedOnOtherDay = tItem.status === 'completed' && !isCompletedOnThisDay;
                      
                      let badgeClass = 'bg-slate-200 text-slate-600';
                      let statusLabel = isRtl ? 'در انتظار' : 'Pending';
                      
                      if (isCompletedOnThisDay) {
                        badgeClass = 'bg-emerald-100 text-emerald-800';
                        statusLabel = isRtl ? '✓ انجام شده در این روز' : '✓ Completed today';
                      } else if (isCompletedOnOtherDay) {
                        badgeClass = 'bg-amber-100 text-amber-800';
                        statusLabel = isRtl ? `تکمیل در روز دیگر (${tItem.completionDate})` : `Done on other date (${tItem.completionDate})`;
                      } else if (tItem.status === 'failed') {
                        badgeClass = 'bg-red-100 text-red-800';
                        statusLabel = isRtl ? '✗ ناموفق' : '✗ Failed';
                      }

                      return (
                        <div key={tItem.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                          <span>{isRtl ? tItem.textFa : (tItem.textEn || tItem.textFa)}</span>
                          <span className={`text-[8px] px-2 py-0.5 rounded-md font-black shrink-0 ${badgeClass}`}>
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

            {/* 2. Classes Schedule Grid */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.classesTitle}</span>
                  </div>
                  <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                    {todayClasses.length}
                  </span>
                </div>
                {todayClasses.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayClasses.map(c => (
                      <div key={c.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{isRtl ? c.textFa : (c.textEn || c.textFa)}</span>
                        <span className="text-[9px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-mono font-bold">
                          {isRtl ? c.timeFa : (c.timeEn || c.timeFa)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noClasses}</p>
                )}
              </div>
            </div>

            {/* 3. Core Task Deadlines */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.coreDeadlinesTitle}</span>
                  </div>
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    {todayCoreTasks.length}
                  </span>
                </div>
                {todayCoreTasks.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayCoreTasks.map(ct => {
                      let badgeClass = 'bg-amber-100 text-amber-800';
                      let statusLabel = isRtl ? 'در انتظار ددلاین' : 'Pending';
                      
                      if (ct.status === 'completed') {
                        badgeClass = 'bg-emerald-100 text-emerald-800';
                        statusLabel = isRtl ? '✓ انجام شده' : '✓ Completed';
                      } else if (ct.status === 'failed') {
                        badgeClass = 'bg-red-100 text-red-800';
                        statusLabel = isRtl ? '✗ ناموفق' : '✗ Failed';
                      }

                      return (
                        <div key={ct.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span>{ct.title}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black shrink-0 ${badgeClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                          {ct.description && (
                            <p className="text-[9px] text-slate-400 font-medium leading-relaxed">{ct.description}</p>
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

            {/* 4. Secondary Tasks Due or Completed */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.secTitle}</span>
                  </div>
                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                    {todaySecondaryTasks.length}
                  </span>
                </div>
                {todaySecondaryTasks.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todaySecondaryTasks.map(st => {
                      let badgeClass = 'bg-slate-200 text-slate-600';
                      let statusLabel = isRtl ? 'در انتظار' : 'Pending';
                      
                      if (st.status === 'completed') {
                        badgeClass = 'bg-emerald-100 text-emerald-800';
                        statusLabel = isRtl ? '✓ انجام شده' : '✓ Completed';
                      } else if (st.status === 'failed') {
                        badgeClass = 'bg-red-100 text-red-800';
                        statusLabel = isRtl ? '✗ ناموفق' : '✗ Failed';
                      }

                      return (
                        <div key={st.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                          <span>{isRtl ? st.textFa : (st.textEn || st.textFa)}</span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black shrink-0 ${badgeClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noSec}</p>
                )}
              </div>
            </div>

            {/* 5. Exams & Presentations */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.examsTitle}</span>
                  </div>
                  <span className="text-[9px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                    {todayExams.length}
                  </span>
                </div>
                {todayExams.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayExams.map(ex => (
                      <div key={ex.id} className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span className="text-rose-900">{ex.text}</span>
                          <span className="text-[9px] bg-rose-100 text-rose-800 font-black px-2 py-0.5 rounded-md">
                            {ex.type || (ex.completed ? (isRtl ? '✓ تکمیل' : 'Done') : (isRtl ? 'در انتظار' : 'Pending'))}
                          </span>
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
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noExams}</p>
                )}
              </div>
            </div>

            {/* 6. Column Deadlines (Details tab) */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.deadlinesTitle}</span>
                  </div>
                  <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                    {todayDeadlines.length}
                  </span>
                </div>
                {todayDeadlines.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayDeadlines.map(d => (
                      <div key={d.id} className="p-2.5 bg-purple-50/50 border border-purple-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{d.text}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {d.columnTitle && (
                            <span className="text-[8px] bg-purple-100 text-purple-800 font-black px-1.5 py-0.5 rounded-md">
                              {d.columnTitle}
                            </span>
                          )}
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black ${
                            d.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {d.completed ? (isRtl ? '✓ تکمیل' : 'Done') : (isRtl ? 'در انتظار' : 'Pending')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noDeadlines}</p>
                )}
              </div>
            </div>

            {/* 7. Habits & Routines */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.habitsTitle}</span>
                  </div>
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    {todayHabits.length}
                  </span>
                </div>
                {todayHabits.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayHabits.map(h => {
                      const isCheckedToday = calculatedWeekdayKey ? (h.checkedDays || []).includes(calculatedWeekdayKey) : false;
                      const target = h.targetCount || 1;
                      const checkedCount = (h.checkedDays || []).length;

                      return (
                        <div key={h.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isCheckedToday ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'}`} />
                            <span className={isCheckedToday ? 'text-slate-900 font-bold' : 'text-slate-600'}>
                              {isRtl ? h.textFa : (h.textEn || h.textFa)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] text-slate-500 font-medium">
                              {checkedCount}/{target}
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

            {/* 8. Postponed & Cancelled Events */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-orange-500 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.postponedTitle}</span>
                  </div>
                  <span className="text-[9px] bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full">
                    {todayPostponed.length}
                  </span>
                </div>
                {todayPostponed.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayPostponed.map(p => {
                      const isCancelled = p.action?.includes('لغو') || p.action?.toLowerCase().includes('cancel');
                      return (
                        <div key={p.id} className="p-2.5 bg-orange-50/50 border border-orange-100 rounded-xl space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span>{p.title}</span>
                            <span className={`text-[8px] px-2 py-0.5 rounded-md font-black ${
                              isCancelled ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {p.action || (isCancelled ? 'لغو شده' : 'تعویق')}
                            </span>
                          </div>
                          {p.description && (
                            <p className="text-[9px] text-slate-500">{p.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-[8px] text-slate-400 font-bold">
                            <span>{p.type}</span>
                            {p.newDate && (
                              <span>• {isRtl ? `موکول به: ${p.newDate}` : `Postponed to: ${p.newDate}`}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noPostponed}</p>
                )}
              </div>
            </div>

            {/* 9. Weekly Events (Read-only) */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.weeklyEventsTitle}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{t.readOnlyBadge}</span>
                    <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full">
                      {todayWeeklyEvents.length}
                    </span>
                  </div>
                </div>
                {todayWeeklyEvents.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayWeeklyEvents.map(e => (
                      <div key={e.id} className="p-2.5 bg-teal-50/40 border border-teal-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span className={e.completed ? 'line-through text-slate-400' : 'text-slate-800'}>{e.text}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black shrink-0 ${
                          e.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {e.completed ? (isRtl ? '✓ ثبت/انجام' : 'Done') : (isRtl ? 'در انتظار' : 'Pending')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noEvents}</p>
                )}
              </div>
            </div>

            {/* 10. Daily Thoughts (Read-only) */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.dailyThoughtsTitle}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{t.readOnlyBadge}</span>
                    <span className="text-[9px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-full">
                      {todayDailyThoughts.length}
                    </span>
                  </div>
                </div>
                {todayDailyThoughts.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayDailyThoughts.map(th => (
                      <div key={th.id} className="p-2.5 bg-sky-50/40 border border-sky-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span className={th.completed ? 'line-through text-slate-400' : 'text-slate-800'}>{th.text}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black shrink-0 ${
                          th.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {th.completed ? (isRtl ? '✓ مرور شده' : 'Reviewed') : (isRtl ? 'یادداشت' : 'Note')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noThoughts}</p>
                )}
              </div>
            </div>

            {/* 11. To-Do List (Read-only) */}
            <div className="border border-slate-200/80 p-4 sm:p-5 rounded-2xl space-y-3 flex flex-col justify-between bg-white shadow-3xs">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-black text-xs text-slate-700">{t.todoTitle}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{t.readOnlyBadge}</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      {todayTodoList.length}
                    </span>
                  </div>
                </div>
                {todayTodoList.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {todayTodoList.map(td => (
                      <div key={td.id} className="p-2.5 bg-emerald-50/40 border border-emerald-100 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
                        <span className={td.completed ? 'line-through text-slate-400' : 'text-slate-800'}>{td.text}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black shrink-0 ${
                          td.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {td.completed ? (isRtl ? '✓ انجام شده' : 'Done') : (isRtl ? 'در انتظار' : 'Pending')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold py-3">{t.noTodo}</p>
                )}
              </div>
            </div>

            {/* 12. Free Notes of the Week (I2 & I8: Dedicated Distinct Panel, Undated) */}
            <div className="col-span-1 md:col-span-2 lg:col-span-3 border border-indigo-200/80 p-4 sm:p-5 rounded-2xl space-y-3 bg-gradient-to-br from-indigo-50/30 via-white to-slate-50/40 shadow-3xs">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2 mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="font-black text-xs text-slate-800">{t.freeNotesTitle}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-black px-2 py-0.5 rounded-full">
                    {t.undatedBadge}
                  </span>
                  <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                    {t.readOnlyBadge}
                  </span>
                </div>
              </div>
              {freeNotesContent ? (
                <div className="p-3.5 bg-white border border-indigo-100/70 rounded-xl text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                  {freeNotesContent}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 font-bold py-3">{t.noFreeNotes}</p>
              )}
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="text-[10px] text-slate-400 font-bold">
            {isRtl ? 'حالت نمایش ۳۶۰ درجه • غیرقابل ویرایش از این پنجره' : '360° Inspection View • Read-only'}
          </div>
          <button 
            onClick={onClose} 
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-xs rounded-xl transition-all cursor-pointer shadow-3xs"
          >
            {t.closeBtn}
          </button>
        </div>

      </div>
    </div>
  );
}
