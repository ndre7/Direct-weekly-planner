import React, { useState, useEffect, useCallback } from 'react';
import { PlannerData, User } from '../types';
import { jalaliToGregorian as jalaliToGregorianShared } from '../utils/jalali.ts';
import { 
  connectGoogleCalendar, 
  getCachedGoogleCalendarToken, 
  setCachedGoogleCalendarToken 
} from '../lib/auth.ts';
import { 
  Calendar, 
  Check, 
  Cloud, 
  Loader2, 
  RefreshCw, 
  CalendarDays,
  Clock,
  BookOpen,
  CheckSquare,
  AlertTriangle,
  ListTodo,
  Terminal,
  Copy,
  ChevronDown,
  ChevronUp,
  Info,
  Bug,
  Eye,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface GoogleCalendarSyncProps {
  data: PlannerData;
  weekDates: string[];
  currentUser: User | null;
  lang: 'fa' | 'en';
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

// Normalize Persian/Arabic characters and whitespace for string comparisons
const normalizePersianText = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u200c\u200b\xa0]/g, ' ') // replace ZWNJ, zero-width space, and non-breaking space with regular space
    .replace(/ي/g, 'ی')                 // Arabic Yeh to Farsi Yeh
    .replace(/ك/g, 'ک')                 // Arabic Kaf to Farsi Kaf
    .replace(/\s+/g, ' ')                 // collapse multiple spaces
    .trim();
};

// Persian/English Month-to-Number mapping
const MONTHS_MAP: { [key: string]: string } = {
  // Persian
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
  
  // English Phonetic/Translation
  'farvardin': '01',
  'ordibehesht': '02',
  'khordad': '03',
  'tir': '04',
  'mordad': '05',
  'shahrivar': '06',
  'mehr': '07',
  'aban': '08',
  'azar': '09',
  'dey': '10',
  'bahman': '11',
  'esfand': '12',
};

// Robust helper to match month names safely supporting misspellings, Arabic/Farsi variations, and partials
const getNormalizedMonthNum = (monthStr: string): string | undefined => {
  if (!monthStr) return undefined;
  const cleaned = normalizePersianText(monthStr).toLowerCase();
  
  // Try direct match
  if (MONTHS_MAP[cleaned]) return MONTHS_MAP[cleaned];
  
  // Try substring search
  for (const [mName, mNum] of Object.entries(MONTHS_MAP)) {
    const normName = normalizePersianText(mName).toLowerCase();
    if (cleaned.includes(normName) || normName.includes(cleaned)) {
      return mNum;
    }
  }
  return undefined;
};

const toEnglishDigits = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (w) => String.fromCharCode(w.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (w) => String.fromCharCode(w.charCodeAt(0) - 1632));
};

// Jalali to Gregorian converter (using shared utils/jalali.ts implementation)
function jalaliToGregorian(jyInput: any, jmInput: any, jdInput: any): Date {
  const jy = parseInt(toEnglishDigits(String(jyInput)), 10);
  const jm = parseInt(toEnglishDigits(String(jmInput)), 10);
  const jd = parseInt(toEnglishDigits(String(jdInput)), 10);
  if (isNaN(jy) || isNaN(jm) || isNaN(jd)) {
    return new Date(NaN);
  }
  return jalaliToGregorianShared(jy, jm, jd);
}

// Convert Date object to local ISO string (YYYY-MM-DDTHH:mm:ss±HH:MM) to be fully RFC3339 compliant and offset-safe for Google Calendar
const formatLocalISO = (date: Date): string => {
  const pad = (num: number) => String(num).padStart(2, '0');
  const tzo = -date.getTimezoneOffset();
  const dif = tzo >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(tzo) / 60));
  const minutes = pad(Math.abs(tzo) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${dif}${hours}:${minutes}`;
};

// Sanitizes standard string or UUID to comply with Google Calendar Event ID format rules: lowercase alphanumeric characters, dots, underscores, or hyphens, between 5 and 1024 characters.
const sanitizeGCalEventId = (rawId: string): string => {
  let cleaned = rawId
    .toLowerCase()
    .replace(/[^a-z0-9_\-\.]/g, '') // remove any invalid characters
    .replace(/^[^a-z0-9]/, '0'); // must start with alphanumeric
  
  while (cleaned.length < 5) {
    cleaned += '0';
  }
  return cleaned.substring(0, 1024);
};

// Robust function to resolve any Persian/Jalali date format to a Gregorian Date
const resolveAnyPersianDate = (
  dateInput: any,
  weekDates: string[],
  currentYear: number
): Date | null => {
  if (!dateInput) return null;

  // Case 1: If it is a string (e.g., "1405/03/10", "10 خرداد", "شنبه")
  if (typeof dateInput === 'string') {
    const normalized = normalizePersianText(toEnglishDigits(dateInput));

    // Remove any spaces around slashes or hyphens to ensure robust matching (e.g. "1405 / 03 / 10" -> "1405/03/10")
    const cleanedSlash = normalized.replace(/\s*([/\-])\s*/g, '$1');

    // 1a. Match YYYY/MM/DD or YYYY-MM-DD
    const slashMatch = cleanedSlash.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
    if (slashMatch) {
      const y = parseInt(slashMatch[1], 10);
      const m = parseInt(slashMatch[2], 10);
      const d = parseInt(slashMatch[3], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return jalaliToGregorian(y, m, d);
      }
    }

    // 1b. Match "DD MonthName" / "DD MonthName YYYY" / "MonthName DD" / "MonthName DD YYYY"
    const parts = normalized.split(/\s+/);
    if (parts.length >= 2) {
      // Check Pattern 1: DD MonthName (e.g., "10 خرداد")
      let d = parseInt(parts[0], 10);
      let monthName = parts[1];
      let mNum = getNormalizedMonthNum(monthName);
      let possibleYearIdx = 2;

      // Check Pattern 2: MonthName DD (e.g., "خرداد 10")
      if (isNaN(d)) {
        monthName = parts[0];
        mNum = getNormalizedMonthNum(monthName);
        d = parseInt(parts[1], 10);
        possibleYearIdx = 2;
      }

      if (!isNaN(d) && mNum) {
        let y = currentYear;
        if (parts.length > possibleYearIdx) {
          const possibleYear = parseInt(parts[possibleYearIdx].replace(/[,،]/g, ''), 10);
          if (!isNaN(possibleYear) && possibleYear > 1300) {
            y = possibleYear;
          }
        }
        return jalaliToGregorian(y, parseInt(mNum, 10), d);
      }
    }

    // 1c. Match Weekday Name (e.g., "شنبه")
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
      return w.replace(/\s+/g, '').replace(/[\u200c\u200b]/g, '');
    };
    const norm = normalizeWeekday(normalized);
    const idx = NORMALIZED_WEEKDAYS.indexOf(norm);
    if (idx !== -1 && weekDates[idx]) {
      return resolveAnyPersianDate(weekDates[idx], weekDates, currentYear);
    }
  }

  // Case 2: If it is a deadline object (e.g., { day, month, weekday })
  if (typeof dateInput === 'object') {
    const { day, month, weekday } = dateInput;

    if (day && month) {
      const mNum = getNormalizedMonthNum(month);
      if (mNum) {
        return jalaliToGregorian(currentYear, parseInt(mNum, 10), day);
      }
    }

    if (weekday) {
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
        return w.replace(/\s+/g, '').replace(/[\u200c\u200b]/g, '');
      };
      const norm = normalizeWeekday(weekday);
      const idx = NORMALIZED_WEEKDAYS.indexOf(norm);
      if (idx !== -1 && weekDates[idx]) {
        return resolveAnyPersianDate(weekDates[idx], weekDates, currentYear);
      }
    }
  }

  return null;
};

// Robust class schedule time parsing function that handles formats like "10:30 to 12 & 13 to 14"
const parseClassTimes = (timeStr: string): { startHour: number; startMin: number; endHour: number; endMin: number }[] => {
  if (!timeStr) return [{ startHour: 8, startMin: 0, endHour: 9, endMin: 30 }];
  const norm = toEnglishDigits(timeStr).toLowerCase();
  
  // Find all times in the string like HH:MM or HH
  const timeRegex = /(\d{1,2})(?::(\d{2}))?/g;
  const matches = [];
  let match;
  while ((match = timeRegex.exec(norm)) !== null) {
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    matches.push({ hours, minutes });
  }

  const slots: { startHour: number; startMin: number; endHour: number; endMin: number }[] = [];

  // Pair them up as start and end times
  for (let i = 0; i < matches.length - 1; i += 2) {
    const start = matches[i];
    const end = matches[i + 1];
    
    if (start.hours >= 0 && start.hours < 24 && end.hours >= 0 && end.hours < 24) {
      slots.push({
        startHour: start.hours,
        startMin: start.minutes,
        endHour: end.hours,
        endMin: end.minutes,
      });
    }
  }

  // Fallback if we couldn't parse any valid slot
  if (slots.length === 0) {
    slots.push({ startHour: 8, startMin: 0, endHour: 9, endMin: 30 });
  }

  return slots;
};

interface PreparedEvent {
  id: string;
  sourceType: string;
  sourceTitle: string;
  persianDateStr: string;
  gregorianDateStr: string;
  payload: {
    summary: string;
    description: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  };
  status: 'idle' | 'pending' | 'success' | 'failed';
  errorMsg?: string | null;
}

export default function GoogleCalendarSync({
  data,
  weekDates,
  currentUser,
  lang,
  showToast
}: GoogleCalendarSyncProps) {
  const isRtl = lang === 'fa';
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [useDedicatedCalendar, setUseDedicatedCalendar] = useState<boolean>(true);
  
  // Selection States
  const [syncClasses, setSyncClasses] = useState<boolean>(true);
  const [syncCoreTasks, setSyncCoreTasks] = useState<boolean>(true);
  const [syncSecondaryTasks, setSyncSecondaryTasks] = useState<boolean>(true);
  const [syncDetailsDeadlines, setSyncDetailsDeadlines] = useState<boolean>(true);
  const [syncExams, setSyncExams] = useState<boolean>(true);
  const [syncHabits, setSyncHabits] = useState<boolean>(false);
  const [syncTodoList, setSyncTodoList] = useState<boolean>(false);
  const [syncPostponed, setSyncPostponed] = useState<boolean>(true);
  const [syncDailyTasks, setSyncDailyTasks] = useState<boolean>(false);

  // Diagnostic states
  const [preparedEvents, setPreparedEvents] = useState<PreparedEvent[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [selectedPayloadId, setSelectedPayloadId] = useState<string | null>(null);

  // Check if token already exists in memory
  useEffect(() => {
    const token = getCachedGoogleCalendarToken();
    if (token) {
      setIsConnected(true);
    }
  }, []);

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setDiagnosticLogs(prev => [`[${timestamp}] ${msg}`, ...prev]);
  }, []);

  // Live payload & events compilation logic
  const updatePreparedEvents = useCallback(() => {
    const events: PreparedEvent[] = [];
    const currentYear = data.weekYear || 1405;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tehran';

    // Helper to format Persian date labels nicely
    const formatDeadlineLabel = (dl: any): string => {
      if (!dl) return '';
      if (typeof dl === 'string') return dl;
      const parts = [];
      if (dl.weekday) parts.push(dl.weekday);
      if (dl.day) parts.push(dl.day);
      if (dl.month) parts.push(dl.month);
      return parts.join(' ');
    };

    // A. Classes Sync
    if (syncClasses && data.classesSchedule && data.classesSchedule.length > 0) {
      const weekdayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      
      data.classesSchedule.forEach((slot, idx) => {
        if (!slot.textFa && !slot.textEn) return;
        
        const dayIdx = weekdayKeys.indexOf(slot.dayKey);
        if (dayIdx !== -1 && weekDates[dayIdx]) {
          const parsedDate = resolveAnyPersianDate(weekDates[dayIdx], weekDates, currentYear);
          if (parsedDate) {
            const times = parseClassTimes(slot.timeEn || slot.timeFa);
            times.forEach((t, tIdx) => {
              const startDateTime = new Date(parsedDate);
              startDateTime.setHours(t.startHour, t.startMin, 0);
              
              const endDateTime = new Date(parsedDate);
              endDateTime.setHours(t.endHour, t.endMin, 0);

              const summary = isRtl ? slot.textFa : slot.textEn || slot.textFa;
              events.push({
                id: `class-${slot.id}-${idx}-${tIdx}`,
                sourceType: isRtl ? 'برنامه کلاسی' : 'Class Schedule',
                sourceTitle: summary,
                persianDateStr: weekDates[dayIdx],
                gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                payload: {
                  summary: summary,
                  description: isRtl ? 'کلاس آموزشی برنامه هفتگی' : 'Weekly Planner Class Schedule',
                  start: {
                    dateTime: formatLocalISO(startDateTime),
                    timeZone: timezone
                  },
                  end: {
                    dateTime: formatLocalISO(endDateTime),
                    timeZone: timezone
                  }
                },
                status: 'idle'
              });
            });
          }
        }
      });
    }

    // B. Core Tasks
    if (syncCoreTasks && data.coreTasks && data.coreTasks.length > 0) {
      data.coreTasks.forEach((task, idx) => {
        if (!task.title) return;
        
        const eventDate = resolveAnyPersianDate(task.deadline, weekDates, currentYear);
        if (eventDate) {
          const startDateTime = new Date(eventDate);
          startDateTime.setHours(9, 0, 0);
          
          const endDateTime = new Date(eventDate);
          endDateTime.setHours(10, 0, 0);

          events.push({
            id: `core-${task.id || idx}`,
            sourceType: isRtl ? 'کار اصلی' : 'Core Task',
            sourceTitle: task.title,
            persianDateStr: formatDeadlineLabel(task.deadline),
            gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            payload: {
              summary: `🎯 ${task.title}`,
              description: task.description || (isRtl ? 'کار اصلی برنامه‌ریزی' : 'Weekly Planner Core Task'),
              start: {
                dateTime: formatLocalISO(startDateTime),
                timeZone: timezone
              },
              end: {
                dateTime: formatLocalISO(endDateTime),
                timeZone: timezone
              }
            },
            status: 'idle'
          });
        }
      });
    }

    // C. Secondary Tasks
    if (syncSecondaryTasks && data.secondaryTasks && data.secondaryTasks.length > 0) {
      data.secondaryTasks.forEach((task, idx) => {
        const title = isRtl ? task.textFa : task.textEn || task.textFa;
        if (!title) return;

        const eventDate = resolveAnyPersianDate(task.deadline, weekDates, currentYear);
        if (eventDate) {
          const startDateTime = new Date(eventDate);
          startDateTime.setHours(11, 0, 0);
          
          const endDateTime = new Date(eventDate);
          endDateTime.setHours(12, 0, 0);

          events.push({
            id: `sec-${task.id || idx}`,
            sourceType: isRtl ? 'کار فرعی' : 'Secondary Task',
            sourceTitle: title,
            persianDateStr: formatDeadlineLabel(task.deadline),
            gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            payload: {
              summary: `📌 ${title}`,
              description: task.description || (isRtl ? 'کار فرعی برنامه‌ریزی' : 'Weekly Planner Secondary Task'),
              start: {
                dateTime: formatLocalISO(startDateTime),
                timeZone: timezone
              },
              end: {
                dateTime: formatLocalISO(endDateTime),
                timeZone: timezone
              }
            },
            status: 'idle'
          });
        }
      });
    }

    // D. Detailed Deadlines (Column Tasks)
    if (syncDetailsDeadlines && data.detailsColumns && data.detailsColumns.length > 0) {
      data.detailsColumns.forEach((col) => {
        const colTitle = isRtl ? col.titleFa : col.titleEn || col.titleFa;
        col.items.forEach((item, itemIdx) => {
          if (!item.text || !item.date) return;
          const eventDate = resolveAnyPersianDate(item.date, weekDates, currentYear);
          if (eventDate) {
            const startDateTime = new Date(eventDate);
            startDateTime.setHours(10, 0, 0);

            const endDateTime = new Date(eventDate);
            endDateTime.setHours(11, 0, 0);

            events.push({
              id: `detail-${col.id}-${item.id || itemIdx}`,
              sourceType: isRtl ? 'ددلاین ستون' : 'Column Deadline',
              sourceTitle: `${colTitle}: ${item.text}`,
              persianDateStr: item.date,
              gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
              payload: {
                summary: `⏰ ${colTitle}: ${item.text}`,
                description: isRtl ? 'ددلاین ثبت شده در برنامه هفتگی' : 'Weekly Planner Detailed Deadline',
                start: {
                  dateTime: formatLocalISO(startDateTime),
                  timeZone: timezone
                },
                end: {
                  dateTime: formatLocalISO(endDateTime),
                  timeZone: timezone
                }
              },
              status: 'idle'
            });
          }
        });
      });
    }

    // E. Urgent To-Do List
    if (syncTodoList && data.todoList && data.todoList.length > 0) {
      data.todoList.forEach((item, idx) => {
        if (!item.text) return;
        const eventDate = resolveAnyPersianDate(item.weekday, weekDates, currentYear);
        if (eventDate) {
          const startDateTime = new Date(eventDate);
          startDateTime.setHours(13, 0, 0);

          const endDateTime = new Date(eventDate);
          endDateTime.setHours(14, 0, 0);

          events.push({
            id: `todo-${item.id || idx}`,
            sourceType: isRtl ? 'لیست کارهای فوری' : 'Urgent To-Do',
            sourceTitle: item.text,
            persianDateStr: item.weekday || '',
            gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            payload: {
              summary: `📋 ToDo: ${item.text}`,
              description: isRtl ? 'ثبت شده در لیست کارهای فوری' : 'Weekly Planner Urgent To-Do',
              start: {
                dateTime: formatLocalISO(startDateTime),
                timeZone: timezone
              },
              end: {
                dateTime: formatLocalISO(endDateTime),
                timeZone: timezone
              }
            },
            status: 'idle'
          });
        }
      });
    }

    // F. Postponed/Cancelled Events
    if (syncPostponed && data.postponedEvents && data.postponedEvents.length > 0) {
      data.postponedEvents.forEach((event, idx) => {
        if (!event.title) return;
        const eventDate = resolveAnyPersianDate(event.newDate || event.date, weekDates, currentYear);
        if (eventDate) {
          const startDateTime = new Date(eventDate);
          startDateTime.setHours(12, 0, 0);

          const endDateTime = new Date(eventDate);
          endDateTime.setHours(13, 0, 0);

          events.push({
            id: `postponed-${event.id || idx}`,
            sourceType: isRtl ? 'رویداد معوقه/لغو شده' : 'Postponed Event',
            sourceTitle: event.title,
            persianDateStr: event.newDate || event.date,
            gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
            payload: {
              summary: `⚠️ [${event.action || event.type}] ${event.title}`,
              description: event.description || '',
              start: {
                dateTime: formatLocalISO(startDateTime),
                timeZone: timezone
              },
              end: {
                dateTime: formatLocalISO(endDateTime),
                timeZone: timezone
              }
            },
            status: 'idle'
          });
        }
      });
    }

    // G. Daily Tasks Checklist
    if (syncDailyTasks && data.dailyTasks) {
      const weekdayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      
      weekdayKeys.forEach((dayKey, dayIdx) => {
        const tasks = data.dailyTasks[dayKey] || [];
        if (tasks.length === 0) return;
        
        if (weekDates[dayIdx]) {
          const parsedDate = resolveAnyPersianDate(weekDates[dayIdx], weekDates, currentYear);
          if (parsedDate) {
            tasks.forEach((task, taskIdx) => {
              const title = isRtl ? task.textFa : task.textEn || task.textFa;
              if (!title) return;

              const startDateTime = new Date(parsedDate);
              startDateTime.setHours(14 + taskIdx, 0, 0); // Stagger tasks hourly in afternoon
              
              const endDateTime = new Date(parsedDate);
              endDateTime.setHours(15 + taskIdx, 0, 0);

              events.push({
                id: `daily-${dayKey}-${task.id || taskIdx}`,
                sourceType: isRtl ? 'کار چک‌لیست روزانه' : 'Daily Checklist Task',
                sourceTitle: title,
                persianDateStr: weekDates[dayIdx],
                gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                payload: {
                  summary: `✅ ${title}`,
                  description: isRtl ? 'کار روزانه برنامه‌ریزی' : 'Weekly Planner Daily Task',
                  start: {
                    dateTime: formatLocalISO(startDateTime),
                    timeZone: timezone
                  },
                  end: {
                    dateTime: formatLocalISO(endDateTime),
                    timeZone: timezone
                  }
                },
                status: 'idle'
              });
            });
          }
        }
      });
    }

    // H. Exams and Presentations
    if (syncExams && data.examColumns && data.examColumns.length > 0) {
      data.examColumns.forEach((col) => {
        const colTitle = isRtl ? col.titleFa : col.titleEn || col.titleFa;
        col.items.forEach((item, itemIdx) => {
          if (!item.text) return;
          const eventDate = resolveAnyPersianDate(item.date || item.deadline, weekDates, currentYear);
          if (eventDate) {
            const startDateTime = new Date(eventDate);
            startDateTime.setHours(9, 0, 0);

            const endDateTime = new Date(eventDate);
            endDateTime.setHours(11, 0, 0);

            events.push({
              id: `exam-${col.id}-${item.id || itemIdx}`,
              sourceType: isRtl ? 'امتحان / ارائه' : 'Exam / Presentation',
              sourceTitle: `${colTitle}: ${item.text}`,
              persianDateStr: formatDeadlineLabel(item.date || item.deadline),
              gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
              payload: {
                summary: `🎓 [${item.type || 'امتحان'}] ${colTitle}: ${item.text}`,
                description: item.description || (isRtl ? 'امتحان / ارائه ثبت شده در برنامه هفتگی' : 'Weekly Planner Exam/Presentation'),
                start: {
                  dateTime: formatLocalISO(startDateTime),
                  timeZone: timezone
                },
                end: {
                  dateTime: formatLocalISO(endDateTime),
                  timeZone: timezone
                }
              },
              status: 'idle'
            });
          }
        });
      });
    }

    // I. Habits & Reminders
    if (syncHabits && data.reminders && data.reminders.length > 0) {
      data.reminders.forEach((rem, remIdx) => {
        const remTitle = isRtl ? rem.textFa : rem.textEn || rem.textFa;
        if (!remTitle) return;
        (rem.checkedDays || []).forEach(dayIdx => {
          if (weekDates[dayIdx]) {
            const eventDate = resolveAnyPersianDate(weekDates[dayIdx], weekDates, currentYear);
            if (eventDate) {
              const startDateTime = new Date(eventDate);
              startDateTime.setHours(20, 0, 0);
              const endDateTime = new Date(eventDate);
              endDateTime.setHours(20, 30, 0);

              events.push({
                id: `habit-${rem.id || remIdx}-${dayIdx}`,
                sourceType: isRtl ? 'عادت / یادآوری' : 'Habit / Reminder',
                sourceTitle: remTitle,
                persianDateStr: weekDates[dayIdx],
                gregorianDateStr: startDateTime.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                payload: {
                  summary: `🌱 ${remTitle}`,
                  description: isRtl ? 'عادت و پیگیری هفتگی' : 'Weekly Habit Tracking',
                  start: {
                    dateTime: formatLocalISO(startDateTime),
                    timeZone: timezone
                  },
                  end: {
                    dateTime: formatLocalISO(endDateTime),
                    timeZone: timezone
                  }
                },
                status: 'idle'
              });
            }
          }
        });
      });
    }

    setPreparedEvents(events);
  }, [
    data,
    weekDates,
    syncClasses,
    syncCoreTasks,
    syncSecondaryTasks,
    syncDetailsDeadlines,
    syncTodoList,
    syncPostponed,
    syncDailyTasks,
    syncExams,
    syncHabits,
    isRtl
  ]);

  // Re-run whenever selection flags or parameters change
  useEffect(() => {
    updatePreparedEvents();
  }, [updatePreparedEvents]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connectGoogleCalendar();
      setIsConnected(true);
      showToast(
        isRtl 
          ? 'گوگل کلندر با موفقیت متصل شد!' 
          : 'Google Calendar connected successfully!',
        'success'
      );
    } catch (err: any) {
      console.error(err);
      showToast(
        isRtl 
          ? 'اتصال به گوگل کلندر ناموفق بود. لطفاً دوباره تلاش کنید.' 
          : 'Connection to Google Calendar failed. Please try again.',
        'error'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setCachedGoogleCalendarToken(null);
    setIsConnected(false);
    showToast(
      isRtl 
        ? 'اتصال گوگل کلندر قطع شد.' 
        : 'Google Calendar disconnected.',
      'success'
    );
  };

  // Refactored Sync Loop with Real-Time Logging, Duplicate-Free Upserting, and proper URL Encoding
  const handleSync = async () => {
    const token = getCachedGoogleCalendarToken();
    if (!token) {
      showToast(
        isRtl 
          ? 'ابتدا باید به حساب گوگل خود متصل شوید.' 
          : 'Please connect to your Google Account first.',
        'error'
      );
      return;
    }

    if (preparedEvents.length === 0) {
      showToast(
        isRtl 
          ? 'هیچ رویدادی با تاریخ معتبر برای انتقال یافت نشد.' 
          : 'No valid dated events found to sync.',
        'error'
      );
      return;
    }

    const confirmMsg = isRtl
      ? `آیا مایلید تعداد ${preparedEvents.length} رویداد را به تقویم گوگل منتقل و ثبت کنید؟`
      : `Are you sure you want to push ${preparedEvents.length} events to your Google Calendar?`;
    
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setSyncing(true);
    setDiagnosticLogs([]);
    addLog('Starting calendar sync execution...');

    try {
      // 1. Determine or Create Google Calendar
      let calendarId = 'primary';
      
      if (useDedicatedCalendar) {
        const calTitle = isRtl ? 'برنامه‌ریزی هفتگی (Weekly Planner)' : 'Weekly Planner';
        addLog(`Searching for secondary calendar titled: "${calTitle}"...`);
        
        // Search if calendar already exists
        const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (listRes.ok) {
          const listData = await listRes.json();
          const existingCal = listData.items?.find((item: any) => item.summary === calTitle);
          if (existingCal) {
            calendarId = existingCal.id;
            addLog(`Found existing secondary calendar. ID: ${calendarId}`);
          } else {
            addLog(`Secondary calendar not found. Creating a new one...`);
            // Create a new calendar
            const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ summary: calTitle })
            });
            if (createRes.ok) {
              const createData = await createRes.json();
              calendarId = createData.id;
              addLog(`Successfully created secondary calendar. ID: ${calendarId}`);
            } else {
              const createErr = await createRes.text();
              addLog(`Failed to create secondary calendar: ${createErr}. Falling back to 'primary' calendar.`);
            }
          }
        } else {
          const listErr = await listRes.text();
          addLog(`Failed to query calendarList: ${listErr}. Falling back to 'primary' calendar.`);
        }
      }

      addLog(`Calendar target selected: ${calendarId}`);

      // Sync sequentially and update status of each prepared event
      let successCount = 0;
      const eventsWithStatus = [...preparedEvents];
      
      for (let i = 0; i < eventsWithStatus.length; i++) {
        const item = eventsWithStatus[i];
        
        // Update local array status to pending
        eventsWithStatus[i] = { ...item, status: 'pending' };
        setPreparedEvents([...eventsWithStatus]);
        addLog(`[${i + 1}/${eventsWithStatus.length}] Syncing event: "${item.payload.summary}"...`);

        // Generate a standard, lowercase alphanumeric event ID to support idempotent upserts (PUT)
        const gcalEventId = sanitizeGCalEventId(item.id);

        try {
          // Attempt PUT (Upsert) to create/update event. This prevents duplicates if sync is run multiple times!
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${gcalEventId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              ...item.payload,
              id: gcalEventId
            })
          });
          
          if (res.ok) {
            successCount++;
            eventsWithStatus[i] = { ...item, status: 'success', errorMsg: null };
            addLog(`✓ Synchronized/Updated event successfully: "${item.payload.summary}"`);
          } else if (res.status === 404) {
            // Event not found (404), fall back to POST with the custom ID inside the body to create it
            addLog(`Event does not exist yet. Creating via POST with ID: ${gcalEventId}...`);
            const postRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                ...item.payload,
                id: gcalEventId
              })
            });

            if (postRes.ok) {
              successCount++;
              eventsWithStatus[i] = { ...item, status: 'success', errorMsg: null };
              addLog(`✓ Created event successfully: "${item.payload.summary}"`);
            } else {
              const errText = await postRes.text();
              eventsWithStatus[i] = { ...item, status: 'failed', errorMsg: errText };
              addLog(`✗ Failed to create event (POST): "${item.payload.summary}". Status: ${postRes.status}. Response: ${errText}`);
            }
          } else {
            const errText = await res.text();
            eventsWithStatus[i] = { ...item, status: 'failed', errorMsg: errText };
            addLog(`✗ Failed to sync (PUT): "${item.payload.summary}". Status: ${res.status}. Response: ${errText}`);
          }
        } catch (postErr: any) {
          eventsWithStatus[i] = { ...item, status: 'failed', errorMsg: postErr?.message || String(postErr) };
          addLog(`✗ Exception during sync of "${item.payload.summary}": ${postErr?.message || postErr}`);
        }
        
        // Sync back up with reactive state
        setPreparedEvents([...eventsWithStatus]);
      }

      addLog(`Sync process complete. ${successCount} out of ${eventsWithStatus.length} events synced successfully.`);

      showToast(
        isRtl
          ? `با موفقیت تعداد ${successCount} رویداد به تقویم گوگل شما اضافه شد!`
          : `Successfully synchronized ${successCount} events with your Google Calendar!`,
        successCount === eventsWithStatus.length ? 'success' : 'error'
      );
    } catch (err: any) {
      console.error('Calendar sync error:', err);
      addLog(`SYSTEM FATAL ERROR: ${err?.message || err}`);
      showToast(
        isRtl 
          ? 'بروز خطا در هنگام انتقال به تقویم گوگل.' 
          : 'An error occurred while syncing with Google Calendar.',
        'error'
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600 animate-pulse" />
          <h3 className="font-black text-sm text-slate-800">
            {isRtl ? 'همگام‌سازی کاملاً خودکار با تقویم گوگل' : 'Automated Google Calendar Sync'}
          </h3>
        </div>
        {isConnected ? (
          <span className="text-[9px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-lg flex items-center gap-1">
            <Check className="w-3 h-3" />
            {isRtl ? 'متصل شده' : 'Connected'}
          </span>
        ) : (
          <span className="text-[9px] font-bold bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-lg">
            {isRtl ? 'غیرفعال' : 'Disconnected'}
          </span>
        )}
      </div>

      <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-indigo-950">
        <p className={`text-xs font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
          {isRtl 
            ? '💡 نکته بسیار مهم: فرآیند انتقال به صورت کاملاً خودکار و مستقیم با فشردن دکمه زیر انجام خواهد شد. نیازی به کپی کردن هیچ کدی در گوگل کلندر یا تنظیمات دستی دیگر نیست!'
            : '💡 Important: The synchronization process runs entirely automatically upon clicking the button below. There is no need to write any code or manually copy-paste configurations inside your Google Calendar account!'}
        </p>
      </div>

      <p className={`text-xs text-slate-400 font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
        {isRtl 
          ? 'تمام تاریخ‌ها، مهلت کارهای اصلی و فرعی، کارهای اختصاصی ستون‌ها و برنامه کلاسی هفتگی خود را با استفاده از الگوریتم دقیق تبدیل تقویم شمسی به میلادی به صورت رویداد مستقیم در تقویم گوگل خود ثبت و همگام‌سازی کنید.' 
          : 'Sync your study planning dates, classes, core assignments deadlines, column tasks and daily checklists directly into your Google Calendar using our precise Jalaali-to-Gregorian converter.'}
      </p>

      {/* Connection Buttons */}
      {!isConnected ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2 p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs transition-all active:scale-98 cursor-pointer shadow-sm disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Cloud className="w-4 h-4" />
            )}
            <span>{isRtl ? 'اتصال مستقیم به حساب گوگل و تقویم' : 'Connect Google Calendar'}</span>
          </button>
          
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[10px] font-bold leading-relaxed">
            {isRtl 
              ? '⚠️ در صورتی که دکمه بالا در پیش‌نمایش به درستی باز نمی‌شود، لطفاً برنامه را با استفاده از دکمه بالا سمت راست در یک تب جدید (New Tab) باز کرده و در آنجا اقدام به اتصال تقویم نمایید.'
              : '⚠️ If the popup fails to open in the embedded preview, please open the application in a New Tab (using the button in the top-right corner) and connect your Google Calendar there.'}
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-150">
          
          {/* Options checkboxes */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 flex flex-col gap-3">
            <span className={`text-[10px] font-black text-slate-400 ${isRtl ? 'text-right' : 'text-left'}`}>
              {isRtl ? 'چه مواردی همگام‌سازی شوند؟' : 'Choose what to synchronize:'}
            </span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncClasses} 
                  onChange={(e) => setSyncClasses(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <CalendarDays className="w-4 h-4 text-indigo-500" />
                <span>{isRtl ? 'برنامه کلاسی هفتگی' : 'Weekly Class Schedule'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncCoreTasks} 
                  onChange={(e) => setSyncCoreTasks(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <BookOpen className="w-4 h-4 text-emerald-500" />
                <span>{isRtl ? 'کارهای اصلی (ددلاین‌ها)' : 'Core Tasks (Deadlines)'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncSecondaryTasks} 
                  onChange={(e) => setSyncSecondaryTasks(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <CheckSquare className="w-4 h-4 text-amber-500" />
                <span>{isRtl ? 'کارهای فرعی و فرآیندها' : 'Secondary Tasks'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncDetailsDeadlines} 
                  onChange={(e) => setSyncDetailsDeadlines(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <Clock className="w-4 h-4 text-rose-500" />
                <span>{isRtl ? 'ددلاین‌های ستون‌ها (جزئیات)' : 'Column Tasks (Deadlines)'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncExams} 
                  onChange={(e) => setSyncExams(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <BookOpen className="w-4 h-4 text-red-500" />
                <span>{isRtl ? 'امتحانات و ارائه‌ها' : 'Exams & Presentations'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncHabits} 
                  onChange={(e) => setSyncHabits(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>{isRtl ? 'عادت‌ها و پیگیری‌ها' : 'Habits & Reminders'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncTodoList} 
                  onChange={(e) => setSyncTodoList(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <ListTodo className="w-4 h-4 text-purple-500" />
                <span>{isRtl ? 'لیست کارهای فوری (ToDo)' : 'Urgent To-Do List'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncPostponed} 
                  onChange={(e) => setSyncPostponed(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span>{isRtl ? 'رویدادهای معوقه و لغو شده' : 'Postponed Events'}</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-150 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={syncDailyTasks} 
                  onChange={(e) => setSyncDailyTasks(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{isRtl ? 'کارهای چک‌لیست روزانه' : 'Daily Checklist'}</span>
              </label>
            </div>

            {/* Dedicated Calendar Option */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-1">
              <span className="text-[11px] font-black text-slate-600">
                {isRtl ? 'تقویم اختصاصی "Weekly Planner"' : 'Use Dedicated "Weekly Planner" Calendar'}
              </span>
              <button
                type="button"
                onClick={() => setUseDedicatedCalendar(!useDedicatedCalendar)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${ useDedicatedCalendar ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${ useDedicatedCalendar ? (isRtl ? 'translate-x-[-16px]' : 'translate-x-[16px]') : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs transition-all active:scale-98 cursor-pointer shadow-3xs disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{isRtl ? 'شروع همگام‌سازی و انتقال به تقویم گوگل' : 'Synchronize with Google Calendar'}</span>
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-950 border border-red-200 rounded-2xl font-black text-xs transition-all active:scale-98 cursor-pointer"
            >
              {isRtl ? 'قطع اتصال' : 'Disconnect'}
            </button>
          </div>

          {/* Collapsible Diagnostics Panel */}
          <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
            <button
              type="button"
              onClick={() => {
                setShowDiagnostics(!showDiagnostics);
                if (!showDiagnostics && diagnosticLogs.length === 0) {
                  addLog('Diagnostic panel expanded. Total events prepared: ' + preparedEvents.length);
                }
              }}
              className="w-full flex items-center justify-between p-3.5 bg-slate-100 hover:bg-slate-150 transition-colors cursor-pointer text-slate-700 font-black text-xs select-none"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-500" />
                <span>{isRtl ? 'بخش پیشرفته: عیب‌یابی وب‌سرویس گوگل (مخصوص توسعه‌دهندگان)' : 'Advanced: Google Calendar Web-service Diagnostics (For Developers)'}</span>
                <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                  {preparedEvents.length}
                </span>
              </div>
              {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDiagnostics && (
              <div className="p-4 flex flex-col gap-4 max-h-[500px] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex flex-col gap-1.5 bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-indigo-950 text-[10px] leading-relaxed">
                  <span className="font-black flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-indigo-500" />
                    {isRtl ? 'نیازی به کپی کردن کدهای زیر یا انجام هیچ کاری در گوگل کلندر نیست.' : 'No action or copy-pasting is required inside Google Calendar.'}
                  </span>
                  <span>
                    {isRtl 
                      ? 'کدهای زیر صرفاً ساختار جیسون ارسالی به سرورهای گوگل را برای اطمینان از سلامت وب‌سرویس نمایش می‌دهند. دکمه انتقال خودکار بالا تمام این رویدادها را به طور مستقیم در تقویم شما درج خواهد کرد.' 
                      : 'The JSON structure below is shown purely for diagnostic and verification purposes. The automatic sync button above directly imports these events into your Google Calendar.'}
                  </span>
                </div>

                {/* Live Events Table/List */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black text-slate-500">{isRtl ? 'رویدادهای آماده همگام‌سازی:' : 'Events Scheduled to Sync:'}</span>
                  {preparedEvents.length === 0 ? (
                    <div className="text-center py-4 bg-white border border-slate-200 rounded-xl text-slate-400 text-xs font-bold">
                      {isRtl ? 'هیچ رویدادی با تاریخ معتبر برای گزینه‌های انتخابی یافت نشد.' : 'No events match the current selection.'}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {preparedEvents.map((item) => (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded">
                                {item.sourceType}
                              </span>
                              <span className="text-xs font-black text-slate-800 line-clamp-1">
                                {item.sourceTitle}
                              </span>
                            </div>
                            
                            {/* Sync status badge */}
                            <div className="flex items-center gap-1">
                              {item.status === 'idle' && (
                                <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  {isRtl ? 'آماده ارسال' : 'Ready'}
                                </span>
                              )}
                              {item.status === 'pending' && (
                                <span className="text-[9px] font-bold text-indigo-500 flex items-center gap-0.5 animate-pulse">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  {isRtl ? 'در حال ارسال...' : 'Syncing...'}
                                </span>
                              )}
                              {item.status === 'success' && (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  {isRtl ? 'موفق' : 'Success'}
                                </span>
                              )}
                              {item.status === 'failed' && (
                                <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={item.errorMsg || ''}>
                                  <XCircle className="w-3.5 h-3.5" />
                                  {isRtl ? 'خطا' : 'Failed'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Date details and Payload viewer buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500 font-bold">
                            <div className="flex items-center gap-2">
                              <span>{isRtl ? `تقویم شمسی: ${item.persianDateStr}` : `Jalali: ${item.persianDateStr}`}</span>
                              <span className="text-slate-300">|</span>
                              <span>{isRtl ? `تقویم میلادی: ${item.gregorianDateStr}` : `Gregorian: ${item.gregorianDateStr}`}</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedPayloadId(selectedPayloadId === item.id ? null : item.id)}
                                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 cursor-pointer select-none"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{selectedPayloadId === item.id ? (isRtl ? 'بستن وب‌سرویس' : 'Hide JSON') : (isRtl ? 'نمایش وب‌سرویس' : 'View Payload')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(JSON.stringify(item.payload, null, 2));
                                  showToast(isRtl ? 'محتوای جیسون کپی شد' : 'JSON payload copied to clipboard', 'success');
                                }}
                                className="flex items-center gap-1 text-slate-500 hover:text-slate-700 cursor-pointer select-none border border-slate-200 px-1 rounded hover:bg-slate-50"
                                title={isRtl ? 'کپی کدهای جیسون' : 'Copy JSON payload'}
                              >
                                <Copy className="w-3 h-3" />
                                <span>{isRtl ? 'کپی' : 'Copy'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Expanded Payload Code Block */}
                          {selectedPayloadId === item.id && (
                            <div className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-[9px] overflow-x-auto border border-slate-800 mt-1 select-all relative animate-in fade-in duration-150">
                              <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                              {item.errorMsg && (
                                <div className="mt-2 p-2 border-t border-rose-900 bg-rose-950/50 text-rose-300 text-[9px] font-sans">
                                  <span className="font-bold flex items-center gap-1 text-rose-400">
                                    <Bug className="w-3.5 h-3.5" /> {isRtl ? 'پاسخ خطای سرور گوگل:' : 'Google Server Error Response:'}
                                  </span>
                                  <div className="mt-1 whitespace-pre-wrap">{item.errorMsg}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Diagnostic Log Output Console */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-slate-500">{isRtl ? 'گزارش همگام‌سازی (Diagnostic Log):' : 'Live Sync Diagnostics & Steps Log:'}</span>
                  <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[10px] h-32 overflow-y-auto flex flex-col-reverse border border-slate-800">
                    {diagnosticLogs.length === 0 ? (
                      <span className="text-slate-500 text-[9px]">{isRtl ? '[آماده فعالیت - گزارشی یافت نشد]' : '[System idle - No logs recorded yet]'}</span>
                    ) : (
                      diagnosticLogs.map((log, i) => (
                        <div key={i} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
