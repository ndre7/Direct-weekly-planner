/**
 * reportBuilder.ts
 * Builds structured, factual analytics reports for email dispatch.
 * Supports timeframes: 'week' | 'month' | '6months' | 'year'
 *
 * J1 & J5:
 * - Computes real metrics from PlannerData and daily/monthly stats.
 * - Never fabricates fake/mock numbers. If data is missing or empty, numbers are 0 and hasEnoughData is false.
 * - Client-side driven delivery: Sending requires the user to be active and Gmail connected.
 *   Server-side automated monthly cron is a future roadmap phase (reminderQueue).
 */

import { PlannerData } from '../types';
import { JALALI_MONTHS, JALALI_WEEKDAYS, getTodayJalali } from './jalali';

export type ReportTimeframe = 'week' | 'month' | '6months' | 'year';

export interface CategoryReportItem {
  categoryId: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
  percentage: number;
  color?: string;
}

export interface DayPerformanceItem {
  dayName: string;
  dayKey: string;
  completedCount: number;
  totalCount: number;
  rate: number;
}

export interface ExamDeadlineReportItem {
  id: string;
  text: string;
  type?: string;
  date: string;
  completed: boolean;
}

export interface AnalyticsReport {
  range: ReportTimeframe;
  rangeLabelFa: string;
  startDate: string;
  endDate: string;
  daysWithData: number;
  tasksCompleted: number;
  tasksTotal: number;
  tcr: number; // Task Completion Rate percentage (0-100)
  habitConsistency: number; // Habit consistency percentage (0-100)
  categoryBreakdown: CategoryReportItem[];
  bestDay: DayPerformanceItem | null;
  worstDay: DayPerformanceItem | null;
  upcomingExamsDeadlines: ExamDeadlineReportItem[];
  hasEnoughData: boolean;
}

const DAY_KEYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

export async function buildAnalyticsReport(
  _userId: string,
  data: PlannerData,
  range: ReportTimeframe = 'week'
): Promise<AnalyticsReport> {
  const currentJalali = getTodayJalali();
  const year = data.weekYear || currentJalali.year;
  const month = data.weekMonth || currentJalali.monthName;

  // 1. Determine date range label & boundaries
  let rangeLabelFa = 'هفته جاری';
  let startDate = `${data.weekStartDay || 1} ${month} ${year}`;
  let endDate = `${data.weekEndDay || 7} ${data.weekEndMonth || month} ${data.weekEndYear || year}`;

  if (range === 'month') {
    rangeLabelFa = `ماه جاری (${month} ${year})`;
    startDate = `۱ ${month} ${year}`;
    endDate = `۳۰ ${month} ${year}`;
  } else if (range === '6months') {
    rangeLabelFa = `۶ ماه اخیر (${year})`;
    startDate = `۱ فروردین ${year}`;
    endDate = `۳۱ شهریور ${year}`;
  } else if (range === 'year') {
    rangeLabelFa = `سال کامل ${year}`;
    startDate = `۱ فروردین ${year}`;
    endDate = `۲۹ اسفند ${year}`;
  }

  // 2. Gather tasks across dailyTasks, coreTasks, secondaryTasks
  let dailyCompleted = 0;
  let dailyTotal = 0;
  const dayPerformanceMap: Record<string, { completed: number; total: number; name: string }> = {};

  DAY_KEYS.forEach(dayKey => {
    const weekdayObj = JALALI_WEEKDAYS.find(w => w.key === dayKey);
    const dayName = weekdayObj ? weekdayObj.fa : dayKey;
    const tasks = (data.dailyTasks || {})[dayKey] || [];
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;

    dailyCompleted += completed;
    dailyTotal += total;

    dayPerformanceMap[dayKey] = {
      completed,
      total,
      name: dayName
    };
  });

  const coreTasks = data.coreTasks || [];
  const coreCompleted = coreTasks.filter(t => t.status === 'completed').length;
  const coreTotal = coreTasks.length;

  const secTasks = data.secondaryTasks || [];
  const secCompleted = secTasks.filter(t => t.status === 'completed').length;
  const secTotal = secTasks.length;

  const tasksCompleted = dailyCompleted + coreCompleted + secCompleted;
  const tasksTotal = dailyTotal + coreTotal + secTotal;
  const tcr = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  // 3. Days with data count
  let daysWithData = 0;
  DAY_KEYS.forEach(dayKey => {
    const hasTasks = ((data.dailyTasks || {})[dayKey] || []).length > 0;
    const hasClasses = (data.classesSchedule || []).some(c => c.dayKey === dayKey);
    const hasHabitChecked = (data.reminders || []).some(r => (r.checkedDays || []).includes(dayKey));
    if (hasTasks || hasClasses || hasHabitChecked) {
      daysWithData++;
    }
  });

  // 4. Habit Consistency
  const reminders = data.reminders || [];
  let habitConsistency = 0;
  if (reminders.length > 0) {
    let totalCheckedDays = 0;
    reminders.forEach(r => {
      totalCheckedDays += (r.checkedDays || []).length;
    });
    const possibleChecks = reminders.length * 7;
    habitConsistency = possibleChecks > 0 ? Math.round((totalCheckedDays / possibleChecks) * 100) : 0;
  }

  // 5. Best Day & Worst Day
  let bestDay: DayPerformanceItem | null = null;
  let worstDay: DayPerformanceItem | null = null;
  let maxRate = -1;
  let minRate = 101;

  DAY_KEYS.forEach(dayKey => {
    const item = dayPerformanceMap[dayKey];
    if (item.total > 0) {
      const rate = Math.round((item.completed / item.total) * 100);
      if (rate > maxRate) {
        maxRate = rate;
        bestDay = {
          dayName: item.name,
          dayKey,
          completedCount: item.completed,
          totalCount: item.total,
          rate
        };
      }
      if (rate < minRate) {
        minRate = rate;
        worstDay = {
          dayName: item.name,
          dayKey,
          completedCount: item.completed,
          totalCount: item.total,
          rate
        };
      }
    }
  });

  // 6. Category Breakdown
  const categories = data.categories || [];
  const categoryMap: Record<string, { name: string; color?: string; total: number; completed: number }> = {};

  categories.forEach(c => {
    categoryMap[c.id] = {
      name: c.nameFa || c.nameEn || c.id,
      color: c.color,
      total: 0,
      completed: 0
    };
  });

  // Tally daily tasks
  DAY_KEYS.forEach(dayKey => {
    const tasks = (data.dailyTasks || {})[dayKey] || [];
    tasks.forEach(t => {
      const catId = t.categoryId || 'other';
      if (!categoryMap[catId]) {
        categoryMap[catId] = { name: 'سایر', total: 0, completed: 0 };
      }
      categoryMap[catId].total++;
      if (t.status === 'completed') categoryMap[catId].completed++;
    });
  });

  // Tally core tasks
  coreTasks.forEach(ct => {
    const catId = ct.categoryId || 'other';
    if (!categoryMap[catId]) {
      categoryMap[catId] = { name: 'سایر', total: 0, completed: 0 };
    }
    categoryMap[catId].total++;
    if (ct.status === 'completed') categoryMap[catId].completed++;
  });

  // Tally secondary tasks
  secTasks.forEach(st => {
    const catId = st.categoryId || 'other';
    if (!categoryMap[catId]) {
      categoryMap[catId] = { name: 'سایر', total: 0, completed: 0 };
    }
    categoryMap[catId].total++;
    if (st.status === 'completed') categoryMap[catId].completed++;
  });

  const categoryBreakdown: CategoryReportItem[] = Object.entries(categoryMap)
    .filter(([_, val]) => val.total > 0)
    .map(([catId, val]) => ({
      categoryId: catId,
      name: val.name,
      color: val.color,
      totalTasks: val.total,
      completedTasks: val.completed,
      percentage: Math.round((val.completed / val.total) * 100)
    }))
    .sort((a, b) => b.totalTasks - a.totalTasks);

  // 7. Upcoming Exams & Deadlines
  const upcomingExamsDeadlines: ExamDeadlineReportItem[] = [];

  (data.examColumns || []).forEach(col => {
    col.items.forEach(item => {
      upcomingExamsDeadlines.push({
        id: item.id,
        text: item.text,
        type: item.type || col.titleFa,
        date: item.date || (item.deadline ? `${item.deadline.day} ${item.deadline.month}` : 'بدون تاریخ'),
        completed: !!item.completed
      });
    });
  });

  (data.detailsColumns || []).forEach(col => {
    col.items.forEach(item => {
      if (item.date || item.deadline) {
        upcomingExamsDeadlines.push({
          id: item.id,
          text: item.text,
          type: col.titleFa,
          date: item.date || (item.deadline ? `${item.deadline.day} ${item.deadline.month}` : 'بدون تاریخ'),
          completed: !!item.completed
        });
      }
    });
  });

  const hasEnoughData = tasksTotal > 0 || reminders.length > 0 || upcomingExamsDeadlines.length > 0;

  return {
    range,
    rangeLabelFa,
    startDate,
    endDate,
    daysWithData,
    tasksCompleted,
    tasksTotal,
    tcr,
    habitConsistency,
    categoryBreakdown,
    bestDay,
    worstDay,
    upcomingExamsDeadlines: upcomingExamsDeadlines.slice(0, 8),
    hasEnoughData
  };
}
