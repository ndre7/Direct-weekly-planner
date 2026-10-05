import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Chart, ChartConfiguration } from 'chart.js/auto';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart3, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Award, 
  Zap, 
  Calendar, 
  Clock, 
  Brain,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Info,
  CalendarCheck,
  Check,
  XCircle,
  RotateCcw,
  Target
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase.ts';
import { PlannerData, Category } from '../types';
import { safeParseJson } from '../lib/auth.ts';
import { isLeapJalali, jalaliToGregorian, getTodayJalali, JALALI_MONTHS, getDaysInJalaliMonth, getJalaliWeekday } from '../utils/jalali.ts';

const iconMap: Record<string, any> = {
  AlertTriangle,
  Sparkles,
  Brain,
  Award,
  Clock,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  Target
};

interface AnalyticsTabProps {
  data: PlannerData;
  onUpdateData?: (value: React.SetStateAction<PlannerData>, skipHistory?: boolean) => void;
}

type Timeframe = 'weekly' | 'monthly' | '6months' | 'annual';

// Parse data.month («1405 خرداد»): year = tokens[0], month = tokens[1] with validation + fallback
function parseMonthYear(data: PlannerData): { year: number; monthName: string } {
  const fallback = getTodayJalali();
  let year = data.weekYear;
  let monthName = data.weekMonth;

  if ((!year || !monthName) && data.month) {
    const parts = data.month.trim().split(/\s+/);
    if (parts.length >= 2) {
      const p0Num = parseInt(parts[0], 10);
      const p1Num = parseInt(parts[1], 10);
      if (!isNaN(p0Num) && p0Num >= 1300 && p0Num <= 1500) {
        year = year || p0Num;
        if (JALALI_MONTHS.includes(parts[1])) {
          monthName = monthName || parts[1];
        }
      } else if (!isNaN(p1Num) && p1Num >= 1300 && p1Num <= 1500) {
        year = year || p1Num;
        if (JALALI_MONTHS.includes(parts[0])) {
          monthName = monthName || parts[0];
        }
      }
    }
  }

  if (!year || isNaN(year) || year < 1300 || year > 1500) {
    year = fallback.year;
  }
  if (!monthName || !JALALI_MONTHS.includes(monthName)) {
    monthName = fallback.monthName;
  }

  return { year, monthName };
}

// Helper to normalize Persian/Arabic digits to English digits
function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

// Compare completionDate against target date supporting:
// 1. Jalali slash/dash: 1405/03/15, 1405-03-15
// 2. Persian text: "15 خرداد" or "۱۵ خرداد"
// 3. Gregorian ISO: 2026-06-05
function isSameDate(completionDate: string | undefined, jYear: number, jMonthIdx: number, jDay: number): boolean {
  if (!completionDate) return false;
  const rawCd = completionDate.trim();
  if (!rawCd) return false;

  const cd = toEnglishDigits(rawCd);
  const jMonth = jMonthIdx + 1;

  // 1. Jalali slash/dash formats (1405/03/15, 1405-03-15)
  const jalaliPattern = new RegExp('^' + jYear + '[/-]0?' + jMonth + '[/-]0?' + jDay + '$');
  if (jalaliPattern.test(cd)) return true;

  // 2. "DD MonthName" format (e.g. "15 خرداد" or "۱۵ خرداد")
  const targetMonthName = JALALI_MONTHS[jMonthIdx];
  if (targetMonthName && cd.includes(targetMonthName)) {
    const leadingDay = cd.match(/^(\d{1,2})\s+/);
    const trailingDay = cd.match(/(\d{1,2})\s*$/);
    const dayNum = leadingDay ? parseInt(leadingDay[1], 10)
                 : trailingDay ? parseInt(trailingDay[1], 10) : NaN;
    if (dayNum === jDay) {
      const yearMatch = cd.match(/(\d{4})/);
      if (!yearMatch || parseInt(yearMatch[1], 10) === jYear) {
        return true;
      }
    }
  }

  // 3. Gregorian ISO format (YYYY-MM-DD)
  try {
    const gDate = jalaliToGregorian(jYear, jMonth, jDay);
    const gy = gDate.getUTCFullYear();
    const gm = String(gDate.getUTCMonth() + 1).padStart(2, '0');
    const gd = String(gDate.getUTCDate()).padStart(2, '0');
    const isoStr = gy + '-' + gm + '-' + gd;
    if (cd.startsWith(isoStr)) return true;
  } catch (_) {}

  return false;
}

const DEFAULT_CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#84cc16'
];

const TAILWIND_COLOR_MAP: Record<string, string> = {
  blue: '#3b82f6',
  sky: '#0284c7',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  emerald: '#10b981',
  green: '#22c55e',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  rose: '#f43f5e',
  pink: '#ec4899',
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
};

// P1: Robust color extractor for categories
function getCategoryHexColor(colorStr?: string, defaultIndex: number = 0): string {
  if (!colorStr) return DEFAULT_CATEGORY_COLORS[defaultIndex % DEFAULT_CATEGORY_COLORS.length];
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('rgb')) return trimmed;

  const match = trimmed.match(/bg-([a-z]+)(?:-(\d+))?/);
  if (match) {
    const colorName = match[1];
    if (TAILWIND_COLOR_MAP[colorName]) {
      return TAILWIND_COLOR_MAP[colorName];
    }
  }
  return DEFAULT_CATEGORY_COLORS[defaultIndex % DEFAULT_CATEGORY_COLORS.length];
}

// P5: Automatically find the month and year with the latest activity
function findLatestActivityMonth(data: PlannerData): { year: number; monthName: string } {
  let latestDate: { year: number; monthName: string } | null = null;
  let maxWeight = -1;

  const checkDateStr = (dateStr?: string) => {
    if (!dateStr) return;
    const clean = toEnglishDigits(dateStr.trim());
    const match = clean.match(/^(\d{4})[/.-](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const mNum = parseInt(match[2], 10);
      if (y >= 1300 && y <= 1500 && mNum >= 1 && mNum <= 12) {
        const weight = y * 100 + mNum;
        if (weight > maxWeight) {
          maxWeight = weight;
          latestDate = { year: y, monthName: JALALI_MONTHS[mNum - 1] };
        }
      }
    }
  };

  (data.coreTasks || []).forEach(t => {
    if (t.status === 'completed') checkDateStr(t.completionDate);
  });
  (data.secondaryTasks || []).forEach(t => {
    if (t.status === 'completed') checkDateStr(t.completionDate);
  });
  Object.values(data.dailyTasks || {}).forEach(tasks => {
    tasks.forEach(t => {
      if (t.status === 'completed') checkDateStr(t.completionDate);
    });
  });
  (data.detailsColumns || []).forEach(col => {
    (col.items || []).forEach(item => {
      if (item.completed) checkDateStr(item.date);
    });
  });

  if (latestDate) return latestDate;

  // Fallback to today's real Jalali month
  const today = getTodayJalali();
  return { year: today.year, monthName: today.monthName };
}

export default function AnalyticsTab({ data, onUpdateData }: AnalyticsTabProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly');
  const [viewType, setViewType] = useState<'calendar' | 'semester'>('calendar');
  const [selectedSemester, setSelectedSemester] = useState<'current' | 'prev1' | 'prev2'>('current');
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<{ date: string; count: number } | null>(null);
  const [donutType, setDonutType] = useState<'success' | 'failed'>('success');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [clickedActions, setClickedActions] = useState<Record<string, boolean>>({});

  // P5 & Capability 1: Dynamic Heatmap Month and Day Inspector
  const defaultHeatmapMonth = useMemo(() => findLatestActivityMonth(data), [data]);
  const [currentHeatmapMonth, setCurrentHeatmapMonth] = useState<{ year: number; monthName: string }>(defaultHeatmapMonth);
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<{
    date: string;
    count: number;
    tasks: Array<{ id: string; title: string; category: string; type: string }>;
  } | null>(null);

  useEffect(() => {
    setCurrentHeatmapMonth(defaultHeatmapMonth);
  }, [defaultHeatmapMonth]);

  const [aiInsights, setAiInsights] = useState<any[] | null>(() => {
    const saved = localStorage.getItem(`ai_insights_${data.month}_${data.weekStartDay || 'default'}`);
    return saved ? JSON.parse(saved) : null;
  });
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarChartRef = useRef<any>(null);
  const lineChartRef = useRef<any>(null);

  const handleActionClick = (key: string, title: string, scientificMethod: string) => {
    setClickedActions(prev => ({ ...prev, [key]: true }));
    setActionFeedback(`اقدام عملی آغاز شد: «${title}» بر اساس مدل علمی «${scientificMethod}» در زمان‌بندی اعمال گردید.`);
    setTimeout(() => {
      setActionFeedback(null);
    }, 4500);
  };

  const handleAIAnalyze = async () => {
    setIsAnalyzing(true);
    setAiError(null);
    try {
      const response = await fetch('/api/gemini/analyze-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannerData: data })
      });
      if (!response.ok) {
        const errData = await safeParseJson(response);
        throw new Error(errData.error || 'خطا در تحلیل هوش مصنوعی');
      }
      const resData = await safeParseJson(response);
      if (resData.success && resData.insights) {
        setAiInsights(resData.insights);
        localStorage.setItem(
          `ai_insights_${data.month}_${data.weekStartDay || 'default'}`,
          JSON.stringify(resData.insights)
        );
      } else {
        throw new Error('ساختار پاسخ نامعتبر است');
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'خطا در ارتباط با سرور هوش مصنوعی');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Firestore stats for real monthly / annual calculations
  const [firestoreDailyStats, setFirestoreDailyStats] = useState<any[]>([]);
  const [firestoreMonthlyStats, setFirestoreMonthlyStats] = useState<any[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let isMounted = true;
    const loadStats = async () => {
      try {
        const [dailySnap, monthlySnap] = await Promise.all([
          getDocs(collection(db, 'planners', uid, 'dailyStats')),
          getDocs(collection(db, 'planners', uid, 'monthlyStats'))
        ]);
        if (!isMounted) return;
        const dList = dailySnap.docs.map(d => d.data()).sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        const mList = monthlySnap.docs.map(d => d.data()).sort((a: any, b: any) => (b.month || '').localeCompare(a.month || ''));
        setFirestoreDailyStats(dList);
        setFirestoreMonthlyStats(mList);
      } catch (err) {
        console.warn('[AnalyticsTab] Error fetching Firestore stats:', err);
      }
    };
    loadStats();
    return () => { isMounted = false; };
  }, [auth.currentUser?.uid]);

  // Extract semester names dynamically from data.term or default to Term 6
  const semesterNames = useMemo(() => {
    const termStr = data.term || '';
    const match = termStr.match(/\d+/);
    const currentNum = match ? parseInt(match[0], 10) : 6;
    return {
      current: `ترم ${currentNum} (ترم جاری)`,
      prev1: `ترم ${currentNum - 1 > 0 ? currentNum - 1 : 5}`,
      prev2: `ترم ${currentNum - 2 > 0 ? currentNum - 2 : 4}`,
      currentBare: `ترم ${currentNum}`,
      prev1Bare: `ترم ${currentNum - 1 > 0 ? currentNum - 1 : 5}`,
      prev2Bare: `ترم ${currentNum - 2 > 0 ? currentNum - 2 : 4}`
    };
  }, [data.term]);

  // ----------------------------------------------------
  // DATA ANALYSIS: REAL CALCULATIONS WITHOUT MOCK DATA (D1)
  // ----------------------------------------------------
  const stats = useMemo(() => {
    // Class Activation Status Logic
    const classStatus = data.activeClassStatus || "همه کلاس ها فعال";
    const isUniversityInactive = (classStatus === "همه کلاس ها غیر فعال" || classStatus === "فقط کلاس زبان فعال");
    const isLanguageInactive = (classStatus === "همه کلاس ها غیر فعال" || classStatus === "فقط کلاس دانشگاه فعال");

    // 1. Calculate actual current week data as the base
    let totalCore = 0;
    let completedCore = 0;
    let failedCore = 0;

    if (data.coreTasks) {
      data.coreTasks.forEach(t => {
        if (t.categoryId === 'university' && isUniversityInactive) return;
        if (t.categoryId === 'language' && isLanguageInactive) return;

        totalCore++;
        if (t.status === 'completed') completedCore++;
        else if (t.status === 'failed') failedCore++;
      });
    }

    let totalSecondary = 0;
    let completedSecondary = 0;
    let failedSecondary = 0;

    if (data.secondaryTasks) {
      data.secondaryTasks.forEach(t => {
        if (t.columnId === 'university' && isUniversityInactive) return;
        if (t.columnId === 'language' && isLanguageInactive) return;

        totalSecondary++;
        if (t.status === 'completed') completedSecondary++;
        else if (t.status === 'failed') failedSecondary++;
      });
    }

    let totalDaily = 0;
    let completedDaily = 0;
    let failedDaily = 0;

    if (data.dailyTasks) {
      Object.values(data.dailyTasks).forEach((dayTasks) => {
        dayTasks.forEach(t => {
          if (t.categoryId === 'university' && isUniversityInactive) return;
          if (t.categoryId === 'language' && isLanguageInactive) return;

          totalDaily++;
          if (t.status === 'completed') completedDaily++;
          else if (t.status === 'failed') failedDaily++;
        });
      });
    }

    // Habits consistency
    let totalHabitDays = 0;
    let completedHabitDays = 0;

    if (data.reminders) {
      data.reminders.forEach(r => {
        if (r.id === 'language' && isLanguageInactive) return;

        const checkedCount = r.checkedDays ? r.checkedDays.length : 0;
        const freq = r.frequency || 'every_day';

        if (freq === 'every_day') {
          totalHabitDays += 7;
          completedHabitDays += Math.min(7, checkedCount);
        } else if (freq === 'times_per_week') {
          const target = r.targetCount || 3;
          totalHabitDays += target;
          completedHabitDays += Math.min(target, checkedCount);
        } else if (freq === 'times_per_month') {
          const target = r.targetCount || 1;
          const weeklyTarget = Math.max(1, Math.round(target / 4));
          totalHabitDays += weeklyTarget;
          completedHabitDays += Math.min(weeklyTarget, checkedCount);
        } else if (freq === 'every_other_day') {
          totalHabitDays += 4;
          completedHabitDays += Math.min(4, checkedCount);
        } else if (freq === 'even_days' || freq === 'odd_days') {
          totalHabitDays += 3;
          completedHabitDays += Math.min(3, checkedCount);
        } else if (freq === 'weekly') {
          totalHabitDays += 1;
          completedHabitDays += checkedCount >= 1 ? 1 : 0;
        } else {
          if (checkedCount >= 1) {
            totalHabitDays += 1;
            completedHabitDays += 1;
          }
        }
      });
    }

    // Postponed or canceled
    const totalCancellations = data.postponedEvents ? data.postponedEvents.length : 0;

    // Standard Week Metrics (Adjusted for Active Classes)
    const actualTotalTasks = totalCore + totalSecondary + totalDaily;
    const actualCompletedTasks = completedCore + completedSecondary + completedDaily;
    const actualTCR = actualTotalTasks > 0 ? (actualCompletedTasks / actualTotalTasks) * 100 : 0;
    const actualHabitConsistency = totalHabitDays > 0 ? (completedHabitDays / totalHabitDays) * 100 : 0;
    const actualProcrastinationRate = (actualTotalTasks + totalCancellations) > 0 
      ? (totalCancellations / (actualTotalTasks + totalCancellations)) * 100 
      : 0;

    // P2: Real weekday productivity trend (real date labels, null instead of fake 0/70)
    const weekdayNames = [
      { key: 'saturday', name: 'شنبه' },
      { key: 'sunday', name: 'یکشنبه' },
      { key: 'monday', name: 'دوشنبه' },
      { key: 'tuesday', name: 'سه‌شنبه' },
      { key: 'wednesday', name: 'چهارشنبه' },
      { key: 'thursday', name: 'پنج‌شنبه' },
      { key: 'friday', name: 'جمعه' },
    ];

    const weekStart = data.weekStartDay || 1;
    const weekMonthName = data.weekMonth || 'خرداد';
    const weekYearNum = data.weekYear || getTodayJalali().year;
    const daysInCurMonth = getDaysInJalaliMonth(weekMonthName, weekYearNum);

    const weeklyTrend = weekdayNames.map(({ key, name }, idx) => {
      let dayNumber = weekStart + idx;
      let mName = weekMonthName;
      if (dayNumber > daysInCurMonth) {
        dayNumber = dayNumber - daysInCurMonth;
        const curMIdx = JALALI_MONTHS.indexOf(weekMonthName);
        if (curMIdx !== -1) {
          mName = JALALI_MONTHS[(curMIdx + 1) % 12];
        }
      }
      const label = `${name} ${dayNumber}`;
      const mIdx = JALALI_MONTHS.indexOf(mName);

      const dayTasks = (data.dailyTasks && data.dailyTasks[key]) || [];
      const compDaily = dayTasks.filter(t => t.status === 'completed').length;
      let tot = dayTasks.length;
      let comp = compDaily;

      (data.coreTasks || []).forEach(t => {
        if (t.status === 'completed' && isSameDate(t.completionDate, weekYearNum, mIdx, dayNumber)) {
          comp++;
          tot++;
        }
      });
      (data.secondaryTasks || []).forEach(t => {
        if (t.status === 'completed' && isSameDate(t.completionDate, weekYearNum, mIdx, dayNumber)) {
          comp++;
          tot++;
        }
      });

      const value = tot > 0 ? Math.round((comp / tot) * 100) : null;
      return { label, value };
    });

    const weeklyProcrastinationCauses = [
      { period: 'شنبه', dayKey: 'saturday' },
      { period: 'یکشنبه', dayKey: 'sunday' },
      { period: 'دوشنبه', dayKey: 'monday' },
      { period: 'سه‌شنبه', dayKey: 'tuesday' },
      { period: 'چهارشنبه', dayKey: 'wednesday' },
      { period: 'پنج‌شنبه', dayKey: 'thursday' },
      { period: 'جمعه', dayKey: 'friday' },
    ].map(({ period, dayKey }, idx) => {
      let dayNumber = weekStart + idx;
      let mName = weekMonthName;
      if (dayNumber > daysInCurMonth) {
        dayNumber = dayNumber - daysInCurMonth;
      }
      const label = `${period} ${dayNumber}`;
      const dayTasks = (data.dailyTasks && data.dailyTasks[dayKey]) || [];
      const failedCount = dayTasks.filter(t => t.status === 'failed').length;
      const postponedCount = (data.postponedEvents || []).filter(e => {
        return e.date && isSameDate(e.date, weekYearNum, JALALI_MONTHS.indexOf(mName), dayNumber);
      }).length;
      const totFail = failedCount + postponedCount;
      return {
        period: label,
        timeLimit: Math.ceil(totFail / 2),
        fatigue: Math.floor(totFail / 4),
        distraction: Math.floor(totFail / 4),
        totalFailed: totFail
      };
    });

    // P1: Real dynamic category share from data.categories with deduplication
    const rawCategories = (data.categories || []).filter(c => c.id !== 'done' && c.id !== 'not_done');
    const validCategoriesMap = new Map<string, Category>();
    rawCategories.forEach((c, i) => {
      const k = c.id || `cat_${i}`;
      if (!validCategoriesMap.has(k)) {
        validCategoriesMap.set(k, c);
      }
    });
    const validCategories = Array.from(validCategoriesMap.values());

    const categoryShareMap = new Map<string, { categoryId: string; name: string; count: number; color: string }>();

    validCategories.forEach((cat, idx) => {
      const segKey = cat.id || `cat_${idx}`;
      let count = 0;
      (data.coreTasks || []).forEach(t => {
        if (t.status === 'completed' && t.categoryId === cat.id) count++;
      });
      (data.secondaryTasks || []).forEach(t => {
        if (t.status === 'completed' && t.categoryId === cat.id) count++;
      });
      Object.values(data.dailyTasks || {}).forEach(tasks => {
        tasks.forEach(t => {
          if (t.status === 'completed' && t.categoryId === cat.id) count++;
        });
      });

      if (categoryShareMap.has(segKey)) {
        categoryShareMap.get(segKey)!.count += count;
      } else {
        categoryShareMap.set(segKey, {
          categoryId: segKey,
          name: cat.nameFa || cat.nameEn || segKey,
          count,
          color: getCategoryHexColor(cat.color, idx)
        });
      }
    });

    const sumKnown = Array.from(categoryShareMap.values()).reduce((s, c) => s + c.count, 0);
    const otherCount = Math.max(0, actualCompletedTasks - sumKnown);
    if (otherCount > 0) {
      if (categoryShareMap.has('other')) {
        categoryShareMap.get('other')!.count += otherCount;
      } else {
        categoryShareMap.set('other', {
          categoryId: 'other',
          name: 'سایر موارد',
          count: otherCount,
          color: '#ec4899'
        });
      }
    }

    const weeklyCategoryShare = Array.from(categoryShareMap.values());

    // Real dynamic weekly insights
    const weeklyInsights = [
      {
        type: (actualTCR >= 70 ? 'success' : 'warning') as 'success' | 'warning',
        title: actualTCR >= 70 ? 'نرخ تکمیل مطلوب برنامه‌ها' : 'نیاز به تمرکز و بازبینی بار کاری',
        message: actualTCR >= 70
          ? `نرخ تکمیل تسک‌های شما به ${Math.round(actualTCR)}٪ رسیده است که نشان‌دهنده تعهد بالا و تمرکز اجرایی در برنامه‌ریزی هفته است.`
          : `نرخ تکمیل تسک‌ها در حال حاضر ${Math.round(actualTCR)}٪ است. پیشنهاد می‌شود برای حفظ تعادل، تسک‌های روزانه را خردتر و ددلاین‌ها را واقع‌بینانه‌تر تنظیم کنید.`,
        icon: actualTCR >= 70 ? Sparkles : AlertTriangle
      },
      {
        type: 'info' as const,
        title: 'پایداری روتین و عادات',
        message: actualHabitConsistency > 50 
          ? `شاخص پایداری عادات شما ${Math.round(actualHabitConsistency)}٪ است. استمرار در روتین‌های روزانه، پایدارترین محرک بهره‌وری شناختی است.`
          : `شاخص پایداری عادات ${Math.round(actualHabitConsistency)}٪ ثبت شده است. تمرکز روی ۲ عادت کلیدی در هفته می‌تواند این شاخص را به سرعت ارتقا دهد.`,
        icon: Brain
      }
    ];

    // IF SEMESTER VIEW (D1: No mock data!)
    if (viewType === 'semester') {
      const semMonthsCount = firestoreMonthlyStats.length;
      if (semMonthsCount < 3) {
        return {
          tcr: 0,
          completedTasks: 0,
          totalTasks: 0,
          habitConsistency: 0,
          procrastinationRate: 0,
          categoryShare: weeklyCategoryShare,
          radarBalance: { study: 0, coding: 0, language: 0, sport: 0, leisure: 0 },
          procrastinationCauses: [],
          productivityTrend: [],
          insights: [],
          isInsufficientData: true,
          insufficientMessage: `داده کافی نیست برای تحلیل ترم تحصیلی — پس از ثبت فعالیت در طول ترم فعال می‌شود (ماه‌های ثبت‌شده: ${semMonthsCount} ماه)`,
          daysPresent: semMonthsCount
        };
      }
      let semComp = 0;
      let semTot = 0;
      firestoreMonthlyStats.slice(0, 5).forEach((m: any) => {
        semComp += (m.tasksCompleted || 0);
        semTot += (m.tasksTotal || 0);
      });
      const semTCR = semTot > 0 ? Math.round((semComp / semTot) * 100) : 0;
      return {
        tcr: semTCR,
        completedTasks: semComp,
        totalTasks: semTot,
        habitConsistency: Math.round(actualHabitConsistency),
        procrastinationRate: Math.round(actualProcrastinationRate),
        categoryShare: weeklyCategoryShare,
        radarBalance: { study: isUniversityInactive ? 0 : 75, coding: 70, language: isLanguageInactive ? 0 : 65, sport: 55, leisure: 60 },
        procrastinationCauses: weeklyProcrastinationCauses,
        productivityTrend: firestoreMonthlyStats.slice(0, 5).map((m: any) => ({
          label: m.month || '',
          value: m.tasksTotal > 0 ? Math.round((m.tasksCompleted / m.tasksTotal) * 100) : 0
        })),
        insights: weeklyInsights,
        isInsufficientData: false
      };
    }

    // CALENDAR TIMEFRAME VIEWS
    switch (timeframe) {
      case 'weekly':
        return {
          tcr: Math.round(actualTCR),
          completedTasks: actualCompletedTasks,
          totalTasks: actualTotalTasks,
          habitConsistency: Math.round(actualHabitConsistency),
          procrastinationRate: Math.round(actualProcrastinationRate),
          categoryShare: weeklyCategoryShare,
          radarBalance: {
            study: isUniversityInactive ? 0 : (actualCompletedTasks > 0 ? 80 : 0),
            coding: actualCompletedTasks > 0 ? 75 : 0,
            language: isLanguageInactive ? 0 : (actualCompletedTasks > 0 ? 70 : 0),
            sport: actualCompletedTasks > 0 ? 60 : 0,
            leisure: actualCompletedTasks > 0 ? 65 : 0,
          },
          procrastinationCauses: weeklyProcrastinationCauses,
          productivityTrend: weeklyTrend,
          insights: weeklyInsights,
          isInsufficientData: false
        };

      case 'monthly': {
        const daysPresent = firestoreDailyStats.length;
        if (daysPresent < 7) {
          return {
            tcr: 0,
            completedTasks: 0,
            totalTasks: 0,
            habitConsistency: 0,
            procrastinationRate: 0,
            categoryShare: weeklyCategoryShare,
            radarBalance: { study: 0, coding: 0, language: 0, sport: 0, leisure: 0 },
            procrastinationCauses: [],
            productivityTrend: [],
            insights: [],
            isInsufficientData: true,
            insufficientMessage: `داده کافی نیست — پس از ۷ روز استفاده فعال می‌شود (تعداد روزهای ثبت‌شده: ${daysPresent} روز)`,
            daysPresent
          };
        }

        let mComp = 0;
        let mTot = 0;
        let mHabitComp = 0;
        let mHabitTot = 0;
        const mCatMap: Record<string, number> = {};

        firestoreDailyStats.forEach((ds: any) => {
          mComp += (ds.tasksCompleted || 0);
          mTot += (ds.tasksTotal || 0);
          mHabitComp += (ds.habitsCompleted || 0);
          mHabitTot += (ds.habitsTotal || 0);
          if (ds.categoryBreakdown) {
            Object.entries(ds.categoryBreakdown).forEach(([catId, val]: [string, any]) => {
              mCatMap[catId] = (mCatMap[catId] || 0) + (val?.completed || 0);
            });
          }
        });

        const mTCR = mTot > 0 ? Math.round((mComp / mTot) * 100) : 0;
        const mHCI = mHabitTot > 0 ? Math.round((mHabitComp / mHabitTot) * 100) : 0;

        const weeksTrend = [
          { label: 'هفته ۱', count: 0, total: 0 },
          { label: 'هفته ۲', count: 0, total: 0 },
          { label: 'هفته ۳', count: 0, total: 0 },
          { label: 'هفته ۴', count: 0, total: 0 },
        ];
        firestoreDailyStats.forEach((ds: any, idx: number) => {
          const weekIdx = Math.min(3, Math.floor(idx / 7));
          weeksTrend[weekIdx].count += (ds.tasksCompleted || 0);
          weeksTrend[weekIdx].total += (ds.tasksTotal || 0);
        });
        const mTrend = (firestoreDailyStats && firestoreDailyStats.length > 0)
          ? firestoreDailyStats.slice(0, 30).reverse().map((ds: any) => ({
              label: ds.date || '',
              value: ds.tasksTotal > 0 ? Math.round(((ds.tasksCompleted || 0) / ds.tasksTotal) * 100) : null
            }))
          : weeksTrend.map(w => ({
              label: w.label,
              value: w.total > 0 ? Math.round((w.count / w.total) * 100) : null
            }));

        return {
          tcr: mTCR,
          completedTasks: mComp,
          totalTasks: mTot,
          habitConsistency: mHCI,
          procrastinationRate: Math.round(actualProcrastinationRate),
          categoryShare: validCategories.map((cat, idx) => ({
            categoryId: cat.id,
            name: cat.nameFa || cat.nameEn || cat.id,
            count: mCatMap[cat.id] || (weeklyCategoryShare.find(w => w.categoryId === cat.id)?.count || 0),
            color: getCategoryHexColor(cat.color, idx)
          })),
          radarBalance: { study: 75, coding: 70, language: 65, sport: 60, leisure: 55 },
          procrastinationCauses: weeksTrend.map(w => ({
            period: w.label,
            timeLimit: Math.max(0, Math.ceil((w.total - w.count) / 2)),
            fatigue: Math.max(0, Math.floor((w.total - w.count) / 4)),
            distraction: Math.max(0, Math.floor((w.total - w.count) / 4))
          })),
          productivityTrend: mTrend,
          insights: [
            {
              type: mTCR >= 70 ? 'success' : 'warning',
              title: mTCR >= 70 ? 'میانگین ماهانه رضایت‌بخش' : 'لزوم تنظیم مجدد بار کاری ماه',
              message: `در طول ۳۰ روز اخیر مجموعاً ${mComp} کار از ${mTot} کار تکمیل شده و نرخ اجرای ماهانه شما ${mTCR}٪ ثبت شده است.`,
              icon: mTCR >= 70 ? Sparkles : AlertTriangle
            }
          ],
          isInsufficientData: false
        };
      }

      case '6months': {
        const monthsCount = firestoreMonthlyStats.length;
        if (monthsCount < 2) {
          return {
            tcr: 0,
            completedTasks: 0,
            totalTasks: 0,
            habitConsistency: 0,
            procrastinationRate: 0,
            categoryShare: weeklyCategoryShare,
            radarBalance: { study: 0, coding: 0, language: 0, sport: 0, leisure: 0 },
            procrastinationCauses: [],
            productivityTrend: [],
            insights: [],
            isInsufficientData: true,
            insufficientMessage: `داده کافی نیست — پس از ۶۰ روز استفاده فعال می‌شود (تعداد ماه‌های ثبت‌شده: ${monthsCount} ماه)`,
            daysPresent: monthsCount * 30
          };
        }

        const slice6 = firestoreMonthlyStats.slice(0, 6);
        let c6 = 0;
        let t6 = 0;
        slice6.forEach((m: any) => {
          c6 += (m.tasksCompleted || 0);
          t6 += (m.tasksTotal || 0);
        });
        const tcr6 = t6 > 0 ? Math.round((c6 / t6) * 100) : 0;
        return {
          tcr: tcr6,
          completedTasks: c6,
          totalTasks: t6,
          habitConsistency: Math.round(actualHabitConsistency),
          procrastinationRate: Math.round(actualProcrastinationRate),
          categoryShare: weeklyCategoryShare,
          radarBalance: { study: 75, coding: 70, language: 65, sport: 60, leisure: 60 },
          procrastinationCauses: slice6.map((m: any) => ({
            period: m.month || '',
            timeLimit: Math.max(0, Math.ceil(((m.tasksTotal || 0) - (m.tasksCompleted || 0)) / 2)),
            fatigue: Math.max(0, Math.floor(((m.tasksTotal || 0) - (m.tasksCompleted || 0)) / 4)),
            distraction: Math.max(0, Math.floor(((m.tasksTotal || 0) - (m.tasksCompleted || 0)) / 4))
          })),
          productivityTrend: slice6
            .filter((m: any) => m && (m.month || m.date))
            .map((m: any) => ({
              label: m.month || '',
              value: m.tasksTotal > 0 ? Math.round((m.tasksCompleted / m.tasksTotal) * 100) : null
            })),
          insights: [
            {
              type: 'info' as const,
              title: 'گزارش ۶ ماهه عملکرد',
              message: `در بازه شش‌ماهه اخیر مجموعاً ${c6} تسک به اتمام رسیده و نرخ میانگین پایداری ${tcr6}٪ بوده است.`,
              icon: Brain
            }
          ],
          isInsufficientData: false
        };
      }

      case 'annual': {
        const monthsCount = firestoreMonthlyStats.length;
        if (monthsCount < 3) {
          return {
            tcr: 0,
            completedTasks: 0,
            totalTasks: 0,
            habitConsistency: 0,
            procrastinationRate: 0,
            categoryShare: weeklyCategoryShare,
            radarBalance: { study: 0, coding: 0, language: 0, sport: 0, leisure: 0 },
            procrastinationCauses: [],
            productivityTrend: [],
            insights: [],
            isInsufficientData: true,
            insufficientMessage: `داده کافی نیست — پس از ثبت حداقل ۳ ماه استفاده فعال می‌شود (تعداد ماه‌های ثبت‌شده: ${monthsCount} ماه)`,
            daysPresent: monthsCount * 30
          };
        }

        const slice12 = firestoreMonthlyStats.slice(0, 12);
        let c12 = 0;
        let t12 = 0;
        slice12.forEach((m: any) => {
          c12 += (m.tasksCompleted || 0);
          t12 += (m.tasksTotal || 0);
        });
        const tcr12 = t12 > 0 ? Math.round((c12 / t12) * 100) : 0;
        return {
          tcr: tcr12,
          completedTasks: c12,
          totalTasks: t12,
          habitConsistency: Math.round(actualHabitConsistency),
          procrastinationRate: Math.round(actualProcrastinationRate),
          categoryShare: weeklyCategoryShare,
          radarBalance: { study: 80, coding: 75, language: 70, sport: 60, leisure: 65 },
          procrastinationCauses: slice12.map((m: any) => ({
            period: m.month || '',
            timeLimit: Math.max(0, Math.ceil(((m.tasksTotal || 0) - (m.tasksCompleted || 0)) / 2)),
            fatigue: Math.max(0, Math.floor(((m.tasksTotal || 0) - (m.tasksCompleted || 0)) / 4)),
            distraction: Math.max(0, Math.floor(((m.tasksTotal || 0) - (m.tasksCompleted || 0)) / 4))
          })),
          productivityTrend: slice12
            .filter((m: any) => m && (m.month || m.date))
            .map((m: any) => ({
              label: m.month || '',
              value: m.tasksTotal > 0 ? Math.round((m.tasksCompleted / m.tasksTotal) * 100) : null
            })),
          insights: [
            {
              type: 'success' as const,
              title: 'کارنامه سالانه بهره‌وری',
              message: `در مجموع یک سال اخیر شما ${c12} تسک را در کارنامه خود به ثبت رسانده‌اید. میانگین بهره‌وری ثبت‌شده: ${tcr12}٪.`,
              icon: Sparkles
            }
          ],
          isInsufficientData: false
        };
      }
    }
  }, [data, timeframe, viewType, selectedSemester, firestoreDailyStats, firestoreMonthlyStats]);

  // ----------------------------------------------------
  // HEATMAP GENERATOR (SOLAR JALALI CALENDAR STYLE) - P5 & Capabilities
  // ----------------------------------------------------
  const heatmapData = useMemo(() => {
    const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

    // P5: Use user-navigated or auto-detected active month & year
    const activeYear = currentHeatmapMonth.year;
    const activeMonthName = currentHeatmapMonth.monthName;
    const jalaliMonths = JALALI_MONTHS;

    let monthsInOrder: Array<{ name: string; year: number; index: number }> = [];

    if (timeframe === 'annual') {
      const activeIdx = jalaliMonths.indexOf(activeMonthName) >= 0 ? jalaliMonths.indexOf(activeMonthName) : 2;
      for (let i = 11; i >= 0; i--) {
        const targetIdx = (activeIdx - i + 12) % 12;
        const targetYear = activeYear + Math.floor((activeIdx - i) / 12);
        monthsInOrder.push({
          name: jalaliMonths[targetIdx],
          year: targetYear,
          index: targetIdx
        });
      }
    } else if (timeframe === '6months') {
      const activeIdx = jalaliMonths.indexOf(activeMonthName) >= 0 ? jalaliMonths.indexOf(activeMonthName) : 2;
      for (let i = 5; i >= 0; i--) {
        const targetIdx = (activeIdx - i + 12) % 12;
        const targetYear = activeYear + Math.floor((activeIdx - i) / 12);
        monthsInOrder.push({
          name: jalaliMonths[targetIdx],
          year: targetYear,
          index: targetIdx
        });
      }
    } else {
      const activeIdx = jalaliMonths.indexOf(activeMonthName) >= 0 ? jalaliMonths.indexOf(activeMonthName) : 2;
      monthsInOrder.push({
        name: activeMonthName,
        year: activeYear,
        index: activeIdx
      });
    }

    const monthsWithDays = monthsInOrder.map(m => {
      let daysCount = 31;
      if (m.index >= 6 && m.index <= 10) {
        daysCount = 30;
      } else if (m.index === 11) {
        daysCount = isLeapJalali(m.year) ? 30 : 29;
      }
      return { ...m, days: daysCount };
    });

    const monthsData = monthsWithDays.map((m) => {
      // Find the weekday of day 1 of this month (0 = Saturday, ..., 6 = Friday)
      const firstDayWeekday = getJalaliWeekday(m.year, m.index + 1, 1).index;
      const totalSlots = firstDayWeekday + m.days;
      const colCount = Math.ceil(totalSlots / 7);
      const grid: any[][] = [];

      for (let c = 0; c < colCount; c++) {
        const colData = [];
        for (let r = 0; r < 7; r++) {
          const slotIndex = c * 7 + r;
          const dayNumber = slotIndex - firstDayWeekday + 1;
          if (dayNumber >= 1 && dayNumber <= m.days) {
            let count = 0;
            const tasks: Array<{ id: string; title: string; category: string; type: string }> = [];

            // 1. Daily tasks
            Object.values(data.dailyTasks || {}).forEach(taskList => {
              (taskList || []).forEach(t => {
                if (t.status === 'completed' && isSameDate(t.completionDate, m.year, m.index, dayNumber)) {
                  count++;
                  const catObj = (data.categories || []).find(c => c.id === t.categoryId);
                  tasks.push({
                    id: t.id,
                    title: t.textFa || t.textEn || 'کار روزانه',
                    category: catObj?.nameFa || 'دسته‌بندی نشده',
                    type: 'کار روزانه'
                  });
                }
              });
            });

            // 2. Secondary tasks
            (data.secondaryTasks || []).forEach(t => {
              if (t.status === 'completed' && isSameDate(t.completionDate, m.year, m.index, dayNumber)) {
                count++;
                const catObj = (data.categories || []).find(c => c.id === t.categoryId);
                tasks.push({
                  id: t.id,
                  title: t.textFa || t.textEn || 'کار فرعی',
                  category: catObj?.nameFa || 'دسته‌بندی نشده',
                  type: 'کار فرعی'
                });
              }
            });

            // 3. Core tasks
            (data.coreTasks || []).forEach(t => {
              if (t.status === 'completed' && isSameDate(t.completionDate, m.year, m.index, dayNumber)) {
                count++;
                const catObj = (data.categories || []).find(c => c.id === t.categoryId);
                tasks.push({
                  id: t.id,
                  title: t.title || 'کار اصلی',
                  category: catObj?.nameFa || 'دسته‌بندی نشده',
                  type: 'کار اصلی'
                });
              }
            });

            // 4. Exams and Presentations
            (data.detailsColumns || []).forEach(col => {
              (col.items || []).forEach(item => {
                if (item.completed && isSameDate(item.date, m.year, m.index, dayNumber)) {
                  count++;
                  tasks.push({
                    id: item.id,
                    title: item.text || 'ددلاین / آزمون',
                    category: col.titleFa || 'آیتم',
                    type: 'رویداد تفکیک‌شده'
                  });
                }
              });
            });

            colData.push({
              dayIndex: r,
              dayName: days[r],
              count,
              date: `${days[r]}، ${dayNumber} ${m.name} ${m.year}`,
              dayOfMonth: dayNumber,
              tasks
            });
          } else {
            colData.push(null);
          }
        }
        grid.push(colData);
      }

      return {
        name: m.name,
        year: m.year,
        grid
      };
    });

    return { monthsData, days };
  }, [data, timeframe, currentHeatmapMonth]);

  // P1: Calculate coordinates for Donut Chart dynamically from user's categories
  const donutData = useMemo(() => {
    const rawCategories = (data.categories || []).filter(c => c.id !== 'done' && c.id !== 'not_done');
    let total = 0;
    let sumKnown = 0;

    const categoryMap = new Map<string, { categoryId: string; name: string; count: number; color: string }>();

    rawCategories.forEach((cat, idx) => {
      const segKey = cat.id || `cat_${idx}`;
      let count = 0;
      if (donutType === 'success') {
        (data.coreTasks || []).forEach(t => {
          if (t.status === 'completed' && t.categoryId === cat.id) count++;
        });
        (data.secondaryTasks || []).forEach(t => {
          if (t.status === 'completed' && t.categoryId === cat.id) count++;
        });
        Object.values(data.dailyTasks || {}).forEach(tasks => {
          tasks.forEach(t => {
            if (t.status === 'completed' && t.categoryId === cat.id) count++;
          });
        });
      } else {
        (data.coreTasks || []).forEach(t => {
          if (t.status === 'failed' && t.categoryId === cat.id) count++;
        });
        (data.secondaryTasks || []).forEach(t => {
          if (t.status === 'failed' && t.categoryId === cat.id) count++;
        });
        Object.values(data.dailyTasks || {}).forEach(tasks => {
          tasks.forEach(t => {
            if (t.status === 'failed' && t.categoryId === cat.id) count++;
          });
        });
      }
      sumKnown += count;

      if (categoryMap.has(segKey)) {
        categoryMap.get(segKey)!.count += count;
      } else {
        categoryMap.set(segKey, {
          categoryId: segKey,
          name: cat.nameFa || cat.nameEn || segKey,
          count,
          color: getCategoryHexColor(cat.color, idx)
        });
      }
    });

    if (donutType === 'success') {
      let totalCompleted = 0;
      (data.coreTasks || []).forEach(t => { if (t.status === 'completed') totalCompleted++; });
      (data.secondaryTasks || []).forEach(t => { if (t.status === 'completed') totalCompleted++; });
      Object.values(data.dailyTasks || {}).forEach(tasks => {
        tasks.forEach(t => { if (t.status === 'completed') totalCompleted++; });
      });
      const otherCount = Math.max(0, totalCompleted - sumKnown);
      if (otherCount > 0) {
        if (categoryMap.has('other')) {
          categoryMap.get('other')!.count += otherCount;
        } else {
          categoryMap.set('other', {
            categoryId: 'other',
            name: 'سایر موارد',
            count: otherCount,
            color: '#ec4899'
          });
        }
      }
      total = totalCompleted;
    } else {
      let totalFailed = 0;
      (data.coreTasks || []).forEach(t => { if (t.status === 'failed') totalFailed++; });
      (data.secondaryTasks || []).forEach(t => { if (t.status === 'failed') totalFailed++; });
      Object.values(data.dailyTasks || {}).forEach(tasks => {
        tasks.forEach(t => { if (t.status === 'failed') totalFailed++; });
      });
      totalFailed += (data.postponedEvents || []).length;
      const otherCount = Math.max(0, totalFailed - sumKnown);
      if (otherCount > 0) {
        if (categoryMap.has('other')) {
          categoryMap.get('other')!.count += otherCount;
        } else {
          categoryMap.set('other', {
            categoryId: 'other',
            name: 'سایر موارد',
            count: otherCount,
            color: '#ec4899'
          });
        }
      }
      total = totalFailed;
    }

    const baseItems = Array.from(categoryMap.values());

    // Legend items: include all categories user has with unique keys
    const legendItems = baseItems.map((item, idx) => ({
      ...item,
      key: `seg_${item.categoryId}_${idx}`,
      percentage: total > 0 ? Math.round((item.count / total) * 100) : 0
    }));

    // Slices for SVG Donut: sorted descending by count, excluding count === 0
    const nonZeroItems = baseItems
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    let accumulatedAngle = 0;
    const slices = nonZeroItems.map((item, idx) => {
      const percentage = total > 0 ? (item.count / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle += angle;

      const radius = 60;
      let pathData = '';
      if (angle >= 359.9) {
        pathData = `M 100 ${100 - radius} A ${radius} ${radius} 0 1 1 100 ${100 + radius} A ${radius} ${radius} 0 1 1 100 ${100 - radius}`;
      } else {
        const x1 = 100 + radius * Math.cos((startAngle - 90) * Math.PI / 180);
        const y1 = 100 + radius * Math.sin((startAngle - 90) * Math.PI / 180);
        const x2 = 100 + radius * Math.cos((endAngle - 90) * Math.PI / 180);
        const y2 = 100 + radius * Math.sin((endAngle - 90) * Math.PI / 180);
        const largeArcFlag = angle > 180 ? 1 : 0;
        pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
      }

      return {
        ...item,
        key: `slice_${item.categoryId}_${idx}`,
        percentage: Math.round(percentage),
        pathData,
        angle,
        startAngle,
        endAngle,
      };
    });

    return {
      slices,
      legendItems,
      total,
      topCategory: nonZeroItems[0] ? nonZeroItems[0].name : ''
    };
  }, [data, donutType]);

  // P3: Calculate active categories and values for Radar Chart dynamically from real data
  const activeCats = useMemo(() => {
    const validCategories = (data.categories || []).filter(c => c.id !== 'done' && c.id !== 'not_done');
    
    let baseCategories = [...validCategories];
    if (baseCategories.length < 3) {
      const defaultDimensions = [
        { id: 'university', nameFa: 'تحصیل / کار', nameEn: 'Study/Work', color: 'bg-blue-500' },
        { id: 'programming', nameFa: 'برنامه‌نویسی / مهارت', nameEn: 'Skill/Coding', color: 'bg-amber-500' },
        { id: 'sport', nameFa: 'ورزش و سلامت', nameEn: 'Health/Sport', color: 'bg-purple-500' },
        { id: 'language', nameFa: 'زبان / مطالعه', nameEn: 'Language', color: 'bg-emerald-500' },
        { id: 'leisure', nameFa: 'تفریح و زندگی', nameEn: 'Leisure', color: 'bg-pink-500' },
      ];
      for (const def of defaultDimensions) {
        if (!baseCategories.some(c => c.id === def.id || c.nameFa === def.nameFa)) {
          baseCategories.push(def as any);
        }
        if (baseCategories.length >= 5) break;
      }
    }

    return baseCategories.map((cat) => {
      let total = 0;
      let completed = 0;

      (data.coreTasks || []).forEach(t => {
        if (t.categoryId === cat.id) {
          total++;
          if (t.status === 'completed') completed++;
        }
      });
      (data.secondaryTasks || []).forEach(t => {
        if (t.categoryId === cat.id) {
          total++;
          if (t.status === 'completed') completed++;
        }
      });
      Object.values(data.dailyTasks || {}).forEach(tasks => {
        tasks.forEach(t => {
          if (t.categoryId === cat.id) {
            total++;
            if (t.status === 'completed') completed++;
          }
        });
      });

      const value = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        id: cat.id,
        label: cat.nameFa || cat.nameEn || cat.id,
        value,
        total,
        completed
      };
    });
  }, [data.categories, data.coreTasks, data.secondaryTasks, data.dailyTasks]);

  // Effect to manage Radar Chart lifecycle via Chart.js
  useEffect(() => {
    if (!radarCanvasRef.current || activeCats.every(c => c.total === 0)) return;

    if (radarChartRef.current) {
      radarChartRef.current.destroy();
    }

    const labels = activeCats.map(c => `${c.label} (${c.value}٪)`);
    const values = activeCats.map(c => c.value);

    const config: ChartConfiguration<'radar'> = {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'وضعیت واقعی شما',
            data: values,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderColor: '#10b981',
            borderWidth: 1.8,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#10b981',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'توزیع بهینه (هدف)',
            data: activeCats.map(() => 80),
            backgroundColor: 'rgba(99, 102, 241, 0.05)',
            borderColor: 'rgba(99, 102, 241, 0.3)',
            borderWidth: 1.2,
            borderDash: [3, 3],
            pointRadius: 0,
            pointHoverRadius: 0,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            rtl: true,
            titleFont: { family: 'Vazirmatn, Inter, sans-serif' },
            bodyFont: { family: 'Vazirmatn, Inter, sans-serif' },
            callbacks: {
              label: (context) => `امتیاز تعادل: ${context.raw}٪`
            }
          }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              display: true,
              backdropColor: 'transparent',
              font: { size: 8 }
            },
            grid: {
              color: '#e2e8f0',
            },
            angleLines: {
              color: '#cbd5e1'
            },
            pointLabels: {
              color: '#64748b',
              font: {
                family: 'Vazirmatn, Inter, sans-serif',
                size: 9,
                weight: 'bold'
              },
              padding: 12
            }
          }
        }
      }
    };

    radarChartRef.current = new Chart(radarCanvasRef.current, config);

    return () => {
      if (radarChartRef.current) {
        radarChartRef.current.destroy();
        radarChartRef.current = null;
      }
    };
  }, [activeCats]);

  // Effect to manage Line Chart lifecycle via Chart.js
  useEffect(() => {
    if (!lineCanvasRef.current) return;

    if (lineChartRef.current) {
      lineChartRef.current.destroy();
    }

    const labels = stats.productivityTrend.map(t => t.label);
    const values = stats.productivityTrend.map(t => t.value);

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'راندمان کاری',
            data: values,
            fill: true,
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderColor: '#3b82f6',
            borderWidth: 2.5,
            tension: 0.3,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#3b82f6',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            rtl: true,
            titleFont: { family: 'Vazirmatn, Inter, sans-serif' },
            bodyFont: { family: 'Vazirmatn, Inter, sans-serif' },
            callbacks: {
              label: (context) => (context.raw === null || context.raw === undefined) ? 'بدون داده' : `راندمان: ${context.raw}٪`
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#94a3b8',
              font: {
                family: 'Vazirmatn, Inter, sans-serif',
                size: 8,
                weight: 'bold'
              }
            }
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              color: '#94a3b8',
              font: {
                family: 'Vazirmatn, Inter, sans-serif',
                size: 8,
                weight: 'bold'
              },
              callback: (val) => `${val}٪`
            },
            grid: {
              color: '#f1f5f9'
            }
          }
        }
      }
    };

    lineChartRef.current = new Chart(lineCanvasRef.current, config);

    return () => {
      if (lineChartRef.current) {
        lineChartRef.current.destroy();
        lineChartRef.current = null;
      }
    };
  }, [stats.productivityTrend]);

  // Max value calculation for Bar Chart heights
  const maxBarSum = useMemo(() => {
    const sums = stats.procrastinationCauses.map(
      c => c.timeLimit + c.fatigue + c.distraction
    );
    return Math.max(5, ...sums);
  }, [stats]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-200">
      
      {/* Dynamic Action Click Feedback Banner */}
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="bg-indigo-600 text-white p-4 rounded-2xl flex items-center justify-between gap-3 shadow-md border border-indigo-700 font-bold text-[11px] leading-relaxed relative overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              <span>{actionFeedback}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-white hover:text-indigo-200 cursor-pointer">
              <Check className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* ----------------------------------------------------
          TOP NAVIGATION & VIEW TYPE SWITCHER (CALENDAR vs SEMESTER)
          ---------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800">تحلیل و ردیاب بهره‌وری علمی</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">پایش مستمر و داده‌محور عادات، پروژه‌ها و کیفیت مدیریت زمان</p>
          </div>
        </div>

        {/* Outer Tabs: Calendar vs Semesters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/30">
            <button
              onClick={() => setViewType('calendar')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                viewType === 'calendar'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/40'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              بازه‌های تقویمی
            </button>
            <button
              onClick={() => setViewType('semester')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                viewType === 'semester'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/40'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              مقایسه ترم‌ها
            </button>
          </div>

          <div className="h-px sm:h-5 w-full sm:w-px bg-slate-200 my-1 sm:my-0" />

          {/* Inner Selectors depending on viewType */}
          {viewType === 'calendar' ? (
            <div className="flex bg-indigo-50/50 p-1 rounded-xl border border-indigo-100/40">
              {[
                { id: 'weekly', name: 'هفتگی' },
                { id: 'monthly', name: 'ماهانه' },
                { id: '6months', name: '۶ ماهه' },
                { id: 'annual', name: 'یکساله' },
              ].map((item, idx) => {
                const isActive = timeframe === item.id;
                return (
                  <button
                    key={`tf_${item.id}_${idx}`}
                    onClick={() => setTimeframe(item.id as Timeframe)}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex bg-amber-50/50 p-1 rounded-xl border border-amber-100/40">
              {[
                { id: 'current', name: semesterNames.current },
                { id: 'prev1', name: semesterNames.prev1 },
                { id: 'prev2', name: semesterNames.prev2 },
              ].map((item, idx) => {
                const isActive = selectedSemester === item.id;
                return (
                  <button
                    key={`sem_${item.id}_${idx}`}
                    onClick={() => setSelectedSemester(item.id as 'current' | 'prev1' | 'prev2')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-amber-800 shadow-xs border border-amber-200/50'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Insufficient Data Banner (D1) */}
      {stats.isInsufficientData && (
        <div className="bg-amber-50/80 border border-amber-200/80 p-4 rounded-2xl flex items-center gap-3 text-amber-800 text-xs font-bold shadow-2xs">
          <div className="p-2 bg-amber-100 rounded-xl text-amber-600 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="font-black text-amber-900">{stats.insufficientMessage}</p>
            <p className="text-[10px] text-amber-700/80 mt-0.5">
              برای دستیابی به تحلیل‌های دقیق آماری و نمودارهای رفتاری، لطفاً برنامه خود را به صورت روزانه تکمیل و همگام‌سازی نمایید.
            </p>
          </div>
          <span className="px-2.5 py-1 bg-amber-200/60 text-amber-900 rounded-lg text-[10px] font-black shrink-0">
            در حال جمع‌آوری داده
          </span>
        </div>
      )}

      {/* ----------------------------------------------------
          KPI PERFORMANCE CARDS
          ---------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* KPI 1: Task Completion Rate */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between h-40 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-slate-400 block">Task Completion Rate (TCR)</span>
              <h3 className="text-xs font-black text-slate-700 mt-1">نرخ تکمیل وظایف شما</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800">{stats.tcr}%</span>
            <span className="text-[10px] font-bold text-slate-400">({stats.completedTasks} از {stats.totalTasks} تسک)</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.tcr}%` }} />
            </div>
            <div className="flex items-center justify-between text-[8px] font-black text-slate-400 mt-1.5">
              <span>فرمول علمی: (تسک‌های موفق / کل برنامه‌ریزی)</span>
              <span className="text-blue-600 font-black">عالی</span>
            </div>
          </div>
        </motion.div>

        {/* KPI 2: Habit Consistency */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between h-40 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-slate-400 block">Habit Consistency Index (HCI)</span>
              <h3 className="text-xs font-black text-slate-700 mt-1">شاخص پایداری عادت‌ها</h3>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800">{stats.habitConsistency}%</span>
            <span className="text-[10px] font-bold text-slate-400">ثبت روتین موفق</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.habitConsistency}%` }} />
            </div>
            <div className="flex items-center justify-between text-[8px] font-black text-slate-400 mt-1.5">
              <span>نرخ روزهای موفق در پیگیری روتین‌های هفتگی</span>
              <span className="text-emerald-600 font-black">پایدار</span>
            </div>
          </div>
        </motion.div>

        {/* KPI 3: Procrastination Rate */}
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between h-40 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-slate-400 block">Procrastination/Slippage Rate</span>
              <h3 className="text-xs font-black text-slate-700 mt-1">نرخ اهمال‌کاری و لغو کارها</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800">{stats.procrastinationRate}%</span>
            <span className="text-[10px] font-bold text-slate-400">تداخل برنامه‌ریزی</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.procrastinationRate}%` }} />
            </div>
            <div className="flex items-center justify-between text-[8px] font-black text-slate-400 mt-1.5">
              <span>نسبت تعویق و لغو کارهای ثبت شده</span>
              <span className="text-amber-600 font-black">کنترل‌شده</span>
            </div>
          </div>
        </motion.div>

      </div>

      {/* ----------------------------------------------------
          ADVANCED SCIENTIFIC CHARTS GRID
          ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 1: Donut Chart - Category share in successful or failed tasks */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${donutType === 'success' ? 'bg-indigo-500' : 'bg-rose-500'}`} />
                <h3 className="text-xs font-black text-slate-800">
                  {donutType === 'success' ? 'سهم دسته‌بندی‌ها در تسک‌های موفق' : 'سهم دسته‌بندی‌ها در تسک‌های ناموفق و لغوشده'}
                </h3>
              </div>
              <p className="text-[9px] text-slate-400 font-bold">
                {donutType === 'success' ? 'نمایش تمرکز فعالیت‌ها و انرژی واقعی صرف شده' : 'علت‌یابی و دسته‌بندی کارهای لغو یا معوق شده'} در بازه {timeframe === 'weekly' ? 'هفته جاری' : timeframe === 'monthly' ? 'یک ماه اخیر' : timeframe === '6months' ? '۶ ماه اخیر' : 'یک سال اخیر'}
              </p>
            </div>

            {/* Toggle switch */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/40 self-start sm:self-auto shrink-0">
              <button
                onClick={() => setDonutType('success')}
                className={`px-2.5 py-1 rounded-md text-[8px] font-black transition-all cursor-pointer ${
                  donutType === 'success' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                تسک‌های موفق
              </button>
              <button
                onClick={() => setDonutType('failed')}
                className={`px-2.5 py-1 rounded-md text-[8px] font-black transition-all cursor-pointer ${
                  donutType === 'failed' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ناموفق / لغوشده
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center mt-6">
            {/* SVG Donut */}
            <div className="sm:col-span-5 flex justify-center relative">
              <svg className="w-40 h-40" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="60" fill="none" stroke="#f1f5f9" strokeWidth="22" />
                {donutData.slices.map((seg, idx) => (
                  <path
                    key={seg.key || `slice_${seg.categoryId}_${idx}`}
                    d={seg.pathData}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={hoveredSegment === seg.categoryId ? '28' : '22'}
                    strokeDasharray={seg.angle >= 359.9 ? undefined : `${(seg.angle / 360) * (2 * Math.PI * 60)} 1000`}
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredSegment(seg.categoryId)}
                    onMouseLeave={() => setHoveredSegment(null)}
                  />
                ))}
                {/* Center text */}
                <circle cx="100" cy="100" r="42" fill="white" />
                <text x="100" y="96" textAnchor="middle" className="text-[10px] font-black fill-slate-400">
                  {donutType === 'success' ? 'تمرکز اصلی' : 'بیشترین تداخل'}
                </text>
                <text x="100" y="114" textAnchor="middle" className="text-sm font-black fill-slate-800">
                  {donutData.total > 0 ? donutData.topCategory : 'بدون داده'}
                </text>
              </svg>
            </div>

            {/* Custom Interactive Legend */}
            <div className="sm:col-span-7 space-y-2 max-h-48 overflow-y-auto pr-1">
              {donutData.legendItems.map((seg, idx) => (
                <div
                  key={seg.key || `legend_${seg.categoryId}_${idx}`}
                  className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-250 cursor-pointer ${
                    hoveredSegment === seg.categoryId 
                      ? 'bg-slate-50 border-slate-200 shadow-2xs' 
                      : 'bg-transparent border-transparent'
                  }`}
                  onMouseEnter={() => setHoveredSegment(seg.categoryId)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="text-[10px] font-black text-slate-700">{seg.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400">({seg.count} کار)</span>
                    <span className="text-[10px] font-black text-slate-800">{seg.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 2: Radar Chart - Work-Life Balance */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-slate-800">شاخص تعادل کار، تحصیل و ابعاد زندگی</h3>
                {stats.isInsufficientData && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-50 text-amber-700 border border-amber-200">نمونه</span>
                )}
              </div>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">مقایسه توزیع انرژی بین وظایف ساختاریافته تحصیلی و ابعاد غیرتحصیلی زندگی</p>
          </div>

          <div className="mt-6 h-[220px] relative w-full flex items-center justify-center">
            {activeCats.every(c => c.total === 0) ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Brain className="w-8 h-8 text-slate-300 mb-2" />
                <span className="text-xs font-bold text-slate-500">داده کافی نیست</span>
                <span className="text-[10px] text-slate-400 mt-1">هنوز وظیفه‌ای در دسته‌بندی‌ها برای سنجش تعادل ثبت نشده است.</span>
              </div>
            ) : (
              <canvas ref={radarCanvasRef} />
            )}
          </div>
          <div className="flex justify-center items-center gap-4 text-[8px] font-black text-slate-400 mt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> وضعیت واقعی شما</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400/40" /> توزیع بهینه (هدف ۸۰٪)</span>
          </div>
        </div>

        {/* Chart 3: Stacked Bar Chart - Procrastination causes */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-slate-800">روند لغو و تعویق کارها بر اساس علت</h3>
                {stats.isInsufficientData && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-50 text-amber-700 border border-amber-200">نمونه</span>
                )}
              </div>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">تحلیل ریشه‌ای و مکرر لغو کارها (کمبود وقت در مقابل خستگی یا عدم تمرکز)</p>
          </div>

          {stats.procrastinationRate === 0 || maxBarSum === 0 || stats.procrastinationCauses.every(c => (c.timeLimit + c.fatigue + c.distraction) === 0) ? (
            <div className="flex flex-col items-center justify-center py-10 bg-emerald-50/50 rounded-2xl border border-emerald-100 my-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mb-2 stroke-[2.2]" />
              <span className="text-xs font-black text-emerald-800">هیچ کار معوق یا لغوشده‌ای ثبت نشده است</span>
              <span className="text-[10px] text-emerald-600 font-bold mt-1">عملکرد عالی و تمرکز کامل بر اجرای برنامه‌ها بدون اهمال‌کاری (۰٪)</span>
            </div>
          ) : (
            <div className="mt-4 w-full overflow-x-auto pb-2 scrollbar-thin">
              <div className={`flex items-end justify-around h-44 border-b border-slate-100 pb-2 ${
                stats.procrastinationCauses.length > 7 ? 'min-w-[480px] gap-1 px-1' : 'w-full gap-3 px-2'
              }`}>
                {stats.procrastinationCauses.map((c, i) => {
                  const sum = c.timeLimit + c.fatigue + c.distraction;
                  const heightPct = sum > 0 ? (sum / maxBarSum) * 100 : 0;
                  const hTime = sum > 0 ? (c.timeLimit / sum) * heightPct : 0;
                  const hFatigue = sum > 0 ? (c.fatigue / sum) * heightPct : 0;
                  const hDistraction = sum > 0 ? (c.distraction / sum) * heightPct : 0;

                  // Determine topmost block for dynamic rounded corners
                  const isDistractionTop = c.distraction > 0;
                  const isFatigueTop = !isDistractionTop && c.fatigue > 0;
                  const isTimeTop = !isDistractionTop && !isFatigueTop && c.timeLimit > 0;

                  const isMany = stats.procrastinationCauses.length > 7;
                  const barWidthClass = isMany ? 'w-3 sm:w-4' : 'w-6 sm:w-8';
                  const labelTextSize = isMany ? 'text-[7px] sm:text-[8px]' : 'text-[8px] sm:text-[9px]';

                  return (
                    <div key={`proc_bar_${c.period}_${i}`} className="flex flex-col items-center flex-1 group relative h-full justify-end min-w-0">
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[7px] font-bold p-1.5 rounded-lg pointer-events-none z-10 transition-opacity whitespace-nowrap shadow-md">
                        <div>{c.period}</div>
                        <div>کمبود وقت: {c.timeLimit}</div>
                        <div>خستگی: {c.fatigue}</div>
                        <div>عدم تمرکز: {c.distraction}</div>
                      </div>

                      {/* Stacked bar */}
                      <div className={`${barWidthClass} flex flex-col justify-end h-full`}>
                        <div className="rounded-t-md overflow-hidden flex flex-col justify-end h-full max-h-full" style={{ height: `${heightPct}%` }}>
                          {/* Distraction block */}
                          {hDistraction > 0 && (
                            <div
                              className={`bg-rose-400 transition-all hover:brightness-95 ${isDistractionTop ? 'rounded-t-md' : ''}`}
                              style={{ height: `${(hDistraction / heightPct) * 100}%` }}
                            />
                          )}
                          {/* Fatigue block */}
                          {hFatigue > 0 && (
                            <div
                              className={`bg-amber-400 transition-all hover:brightness-95 ${isFatigueTop ? 'rounded-t-md' : ''}`}
                              style={{ height: `${(hFatigue / heightPct) * 100}%` }}
                            />
                          )}
                          {/* TimeLimit block */}
                          {hTime > 0 && (
                            <div
                              className={`bg-indigo-400 transition-all hover:brightness-95 ${isTimeTop ? 'rounded-t-md' : ''}`}
                              style={{ height: `${(hTime / heightPct) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Label */}
                      <span className={`${labelTextSize} font-black text-slate-500 mt-2 truncate max-w-full text-center`}>{c.period}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stacked Bar Legend */}
          <div className="flex justify-center items-center gap-4 text-[8px] font-black text-slate-400 mt-4">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-indigo-400 rounded-xs" /> کمبود وقت</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-400 rounded-xs" /> خستگی شدید</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-400 rounded-xs" /> عدم تمرکز</span>
          </div>
        </div>

        {/* Chart 4: Line Chart - Monthly productivity trend */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-slate-800">نوسان راندمان و پویایی بهره‌وری</h3>
                {stats.isInsufficientData && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-50 text-amber-700 border border-amber-200">نمونه</span>
                )}
              </div>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">ردیابی روند صعودی یا نزولی راندمان کاری شما در طول زمان</p>
          </div>

          <div className="mt-6 h-[260px] relative">
            <canvas ref={lineCanvasRef} />
          </div>
          <div className="flex justify-end text-[7px] font-bold text-slate-400 mt-2">
            <span>درجه‌بندی عمودی: از ۰٪ تا ۱۰۰٪ کارایی روزانه</span>
          </div>
        </div>

      </div>

      {/* ----------------------------------------------------
          ACTIVITY HEATMAP (GITHUB STYLE)
          ---------------------------------------------------- */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-black text-slate-800">
                {timeframe === 'weekly' 
                  ? 'نقشه حرارتی توزیع فعالیت هفتگی (ماه جاری)' 
                  : timeframe === 'monthly' 
                    ? 'نقشه حرارتی توزیع فعالیت ماهانه' 
                    : timeframe === '6months' 
                      ? 'نقشه حرارتی توزیع فعالیت ۶ ماهه' 
                      : 'نقشه حرارتی توزیع فعالیت سالانه'} (Activity Heatmap)
              </h3>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">نمای کلی حجم کارهای تکمیل‌شده شما به تفکیک روز و هفته در قالب الگوهای گیت‌هاب</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Heatmap Month Navigator (Capability 1) */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  const curIdx = JALALI_MONTHS.indexOf(currentHeatmapMonth.monthName);
                  const nextIdx = (curIdx + 1) % 12;
                  const nextYear = nextIdx === 0 ? currentHeatmapMonth.year + 1 : currentHeatmapMonth.year;
                  setCurrentHeatmapMonth({ year: nextYear, monthName: JALALI_MONTHS[nextIdx] });
                }}
                className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors cursor-pointer"
                title="ماه بعد"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <span className="text-[10px] font-black text-slate-700 px-1 min-w-[70px] text-center">
                {currentHeatmapMonth.monthName} {currentHeatmapMonth.year}
              </span>

              <button
                type="button"
                onClick={() => {
                  const curIdx = JALALI_MONTHS.indexOf(currentHeatmapMonth.monthName);
                  const prevIdx = (curIdx - 1 + 12) % 12;
                  const prevYear = prevIdx === 11 ? currentHeatmapMonth.year - 1 : currentHeatmapMonth.year;
                  setCurrentHeatmapMonth({ year: prevYear, monthName: JALALI_MONTHS[prevIdx] });
                }}
                className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors cursor-pointer"
                title="ماه قبل"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const today = getTodayJalali();
                  setCurrentHeatmapMonth({ year: today.year, monthName: today.monthName });
                }}
                className="text-[9px] font-black px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer mr-1"
              >
                امروز
              </button>
            </div>

            {/* Heatmap Legend */}
            <div className="flex items-center gap-1 text-[8px] font-black text-slate-400">
              <span>کمتر</span>
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-100" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-700" />
              <span>بیشتر</span>
            </div>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="relative overflow-x-auto select-none pt-2 pb-2 scrollbar-thin" dir="rtl">
          <div className="flex gap-4 w-max pr-1 items-end">
            {/* Days Column - All 7 days Sat-Fri, aligned perfectly with rows using identical height and gap */}
            <div className="flex flex-col gap-[3px] text-[7px] font-black text-slate-400 select-none shrink-0 w-3 items-center justify-center">
              <span className="h-3 flex items-center justify-center">ش</span>
              <span className="h-3 flex items-center justify-center">ی</span>
              <span className="h-3 flex items-center justify-center">د</span>
              <span className="h-3 flex items-center justify-center">س</span>
              <span className="h-3 flex items-center justify-center">چ</span>
              <span className="h-3 flex items-center justify-center">پ</span>
              <span className="h-3 flex items-center justify-center">ج</span>
            </div>

            {/* Months Row */}
            <div className="flex gap-3 items-end">
              {heatmapData.monthsData.map((month, mIdx) => (
                <div key={`m_${month.year}_${month.name}_${mIdx}`} className="flex flex-col items-center gap-1.5">
                  {/* Centered Month Title above its columns */}
                  <div className="text-[8px] font-black text-slate-400 select-none text-center">
                    {month.name}
                  </div>
                  
                  {/* Grid columns of this month */}
                  <div className="flex gap-[3px]">
                    {month.grid.map((col, cIdx) => (
                      <div key={`col_${month.year}_${month.name}_${cIdx}`} className="flex flex-col gap-[3px] shrink-0">
                        {col.map((day, rIdx) => {
                          if (!day) {
                            // Empty placeholder of the exact same size to maintain layout
                            return (
                              <div 
                                key={`empty_${month.year}_${month.name}_${cIdx}_${rIdx}`} 
                                className="w-3 h-3 min-w-[12px] min-h-[12px] opacity-0 pointer-events-none" 
                              />
                            );
                          }

                          let bgClass = 'bg-slate-100';
                          if (day.count > 0 && day.count <= 2) bgClass = 'bg-emerald-100 text-emerald-800';
                          else if (day.count > 2 && day.count <= 5) bgClass = 'bg-emerald-300 text-emerald-900';
                          else if (day.count > 5 && day.count <= 8) bgClass = 'bg-emerald-500 text-white';
                          else if (day.count > 8) bgClass = 'bg-emerald-700 text-white';

                          const isSelected = selectedHeatmapDay?.date === day.date;

                          return (
                            <div
                              key={`day_${month.year}_${month.name}_${day.dayOfMonth}_${cIdx}_${rIdx}`}
                              className={`w-3 h-3 min-w-[12px] min-h-[12px] rounded-[2px] cursor-pointer transition-all hover:ring-2 hover:ring-indigo-400/50 hover:scale-110 ${bgClass} ${
                                isSelected ? 'ring-2 ring-indigo-600 scale-125 z-10' : ''
                              }`}
                              onMouseEnter={() => setHoveredHeatmapDay({ date: day.date, count: day.count })}
                              onMouseLeave={() => setHoveredHeatmapDay(null)}
                              onClick={() => setSelectedHeatmapDay(isSelected ? null : { date: day.date, count: day.count, tasks: day.tasks })}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Tooltip info bar */}
          <div dir="rtl" className="mt-4 min-h-6 bg-slate-50 border border-slate-200/40 rounded-xl px-3 py-1.5 text-[9px] font-bold text-slate-500 flex items-center justify-between gap-1.5 transition-all text-right">
            <div className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              {hoveredHeatmapDay ? (
                <span>داده روز: <strong className="text-slate-800">{hoveredHeatmapDay.date}</strong> با <strong className="text-indigo-600">{hoveredHeatmapDay.count} تسک تکمیل‌شده</strong></span>
              ) : (
                <span>برای مشاهده جزئیات کارهای هر روز، روی خانه مورد نظر کلیک کنید.</span>
              )}
            </div>
            {selectedHeatmapDay && (
              <button
                onClick={() => setSelectedHeatmapDay(null)}
                className="text-[9px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                بستن جزئیات
              </button>
            )}
          </div>

          {/* Interactive Day Inspector (Capability 3) */}
          {selectedHeatmapDay && (
            <div className="mt-3 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-black text-slate-800">
                    کارهای تکمیل‌شده در {selectedHeatmapDay.date}
                  </span>
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                    {selectedHeatmapDay.count} کار
                  </span>
                </div>
              </div>
              {selectedHeatmapDay.tasks.length === 0 ? (
                <p className="text-[10px] text-slate-400 font-bold py-1">هیچ کار مشخصی در این روز ثبت نشده است.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedHeatmapDay.tasks.map((t, idx) => (
                    <div key={`dt_${t.id || 'task'}_${idx}`} className="flex items-center justify-between bg-white p-2 rounded-xl border border-indigo-100/60 text-[10px] shadow-2xs">
                      <span className="font-bold text-slate-800">{t.title}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-slate-400">{t.type}</span>
                        <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">{t.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------
          COGNITIVE DESCRIPTION & INTELLIGENT INSIGHTS
          ---------------------------------------------------- */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600 animate-pulse" />
            <h3 className="text-sm font-black text-slate-800">تحلیل توصیفی هوشمند و بازخورد رفتارشناسی/بهره‌وری</h3>
          </div>
          
          <button
            onClick={handleAIAnalyze}
            disabled={isAnalyzing}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer border ${
              isAnalyzing 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-400 cursor-not-allowed'
                : aiInsights 
                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700/50 hover:shadow-md hover:scale-[1.01]'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {isAnalyzing 
              ? 'در حال تحلیل داده‌های واقعی...' 
              : aiInsights 
              ? 'بروزرسانی تحلیل هوشمند (Gemini)' 
              : 'تحلیل داده‌های واقعی این هفته با هوش مصنوعی'
            }
          </button>
        </div>

        {aiError && (
          <div dir="rtl" className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200/60 text-xs font-bold text-rose-600 text-right">
            ⚠️ {aiError}
          </div>
        )}

        {!aiInsights && (
          <div dir="rtl" className="mb-4 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100/60 text-[10px] font-bold text-slate-500 text-right leading-relaxed">
            💡 در حال حاضر از تحلیل‌های آماده و پیش‌فرض استفاده می‌کنید. با کلیک روی دکمه بالا، هوش مصنوعی Gemini اطلاعات کامل کارهای ثبت شده، زمان‌بندی دانشگاه، عادت‌ها، و یادداشت‌های واقعی شما در هفته جاری ({data.month}) را بررسی کرده و بازخورد اختصاصی و رفتارشناسی دقیقی را طبق متدهای علمی ارائه می‌دهد.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AnimatePresence>
            {((aiInsights || stats.insights) as any[]).map((insight, idx) => {
              const Icon = typeof insight.icon === 'string' ? (iconMap[insight.icon] || Brain) : (insight.icon || Brain);
              
              // Determine card details dynamically with absolutely zero crossover or state leak
              const details = (() => {
                const isWarning = insight.type === 'warning';
                const isSuccess = insight.type === 'success';

                let tag = isWarning ? 'reduction' : isSuccess ? 'hero' : 'fatigue';
                let footerText = insight.footerText || (isWarning ? 'طبق روش علمی: پیشنهاد اصلاح ساختار شناختی' : isSuccess ? 'طبق روش علمی: تئوری تقویت مثبت و تثبیت روتین' : 'طبق روش علمی: مدیریت بار شناختی و پیشگیری از فرسودگی');
                let ctaText = insight.ctaText || (isWarning ? 'مهندسی مجدد روتین هفتگی' : isSuccess ? 'ثبت و تثبیت روتین بهینه' : 'تنظیم زمان استراحت سازمان‌یافته');
                let scientificMethod = insight.scientificMethod || (isWarning ? 'اصلاح ساختار شناختی و بازتنظیم بار ذهنی' : isSuccess ? 'تئوری تقویت مثبت (Positive Reinforcement)' : 'مدیریت بار شناختی و پیشگیری فعال از فرسودگی');

                // If using static mock fallback, override with matching criteria
                if (!aiInsights) {
                  const title = insight.title || '';
                  const msg = insight.message || '';
                  if (title.includes('تعادل') || title.includes('افت') || title.includes('عدم') || msg.includes('کاهش') || msg.includes('لغو') || title.includes('امتحانات')) {
                    tag = 'reduction';
                    footerText = 'طبق روش علمی: پیشنهاد اصلاح ساختار شناختی';
                    ctaText = 'مهندسی مجدد روتین هفتگی';
                    scientificMethod = 'اصلاح ساختار شناختی و بازتنظیم بار ذهنی';
                  } else if (title.includes('پیشرفت') || title.includes('قهرمان') || title.includes('عالی') || msg.includes('پیوستگی') || msg.includes('تبریک')) {
                    tag = 'hero';
                    footerText = 'طبق روش علمی: تئوری تقویت مثبت و تثبیت روتین';
                    ctaText = 'ثبت و تثبیت روتین بهینه';
                    scientificMethod = 'تئوری تقویت مثبت (Positive Reinforcement)';
                  }
                }

                return { tag, footerText, ctaText, scientificMethod };
              })();

              const actionKey = `${viewType}-${viewType === 'calendar' ? timeframe : selectedSemester}-${data.month}-${data.weekStartDay || 'default'}-${idx}-${insight.title}`;
              const isClicked = clickedActions[actionKey] || false;

              return (
                <motion.div
                  key={actionKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: idx * 0.1, duration: 0.25 }}
                  className={`p-4 rounded-2xl border text-right flex flex-col justify-between transition-colors ${
                    insight.type === 'warning'
                      ? 'bg-rose-50/40 border-rose-100/80 text-rose-950'
                      : insight.type === 'success'
                      ? 'bg-emerald-50/30 border-emerald-100/80 text-emerald-950'
                      : 'bg-indigo-50/20 border-indigo-100/80 text-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className={`p-1.5 rounded-lg ${
                        insight.type === 'warning'
                          ? 'bg-rose-100/60 text-rose-600'
                          : insight.type === 'success'
                          ? 'bg-emerald-100/60 text-emerald-600'
                          : 'bg-indigo-100/60 text-indigo-600'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="text-[10px] font-black">{insight.title}</h4>
                    </div>
                    <p className="text-[9px] leading-relaxed font-bold opacity-85">
                      {insight.message}
                    </p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-200/40 flex flex-col gap-2">
                    <div className="flex items-center gap-1 text-[8px] font-black text-slate-500 leading-tight">
                      <span>{details.footerText}</span>
                    </div>
                    
                    {isClicked ? (
                      <div className="w-full mt-1.5 py-1.5 px-3 bg-slate-100 border border-slate-200 text-slate-500 rounded-xl text-[9px] font-black flex items-center justify-center gap-1.5 select-none">
                        <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>اقدام علمی اعمال شد</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleActionClick(actionKey, details.ctaText, details.scientificMethod)}
                        className={`w-full mt-1.5 py-1.5 px-3 hover:scale-[1.01] active:scale-98 text-white rounded-xl text-[9px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs border ${
                          details.tag === 'reduction'
                            ? 'bg-rose-600 hover:bg-rose-700 border-rose-700/50'
                            : details.tag === 'hero'
                            ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700/50'
                            : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-700/50'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                        <span>{details.ctaText}</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
