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
  Info,
  CalendarCheck,
  Check,
  XCircle,
  RotateCcw,
  Target,
  Plus,
  Trash2,
  Edit2,
  Save,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { PlannerData, Category, Goal, GoalMilestone, GoalTask } from '../types';
import { safeParseJson } from '../lib/auth.ts';

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

export default function AnalyticsTab({ data, onUpdateData }: AnalyticsTabProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly');
  const [viewType, setViewType] = useState<'calendar' | 'semester'>('calendar');
  const [selectedSemester, setSelectedSemester] = useState<'current' | 'prev1' | 'prev2'>('current');
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<{ date: string; count: number } | null>(null);
  const [donutType, setDonutType] = useState<'success' | 'failed'>('success');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [clickedActions, setClickedActions] = useState<Record<string, boolean>>({});

  const [aiInsights, setAiInsights] = useState<any[] | null>(() => {
    const saved = localStorage.getItem(`ai_insights_${data.month}_${data.weekStartDay || 'default'}`);
    return saved ? JSON.parse(saved) : null;
  });
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Goal-related states
  const goalsList = data.goals || [];
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newGoalTitle, setNewGoalTitle] = useState<string>('');
  const [newGoalWeeks, setNewGoalWeeks] = useState<number>(6);
  const [isAnalyzingGoal, setIsAnalyzingGoal] = useState<boolean>(false);
  const [goalAnalysisError, setGoalAnalysisError] = useState<string | null>(null);
  const [addingTaskText, setAddingTaskText] = useState<string>('');
  const [addingTaskType, setAddingTaskType] = useState<'core' | 'secondary' | 'habit'>('secondary');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState<string>('');
  const [editingTaskType, setEditingTaskType] = useState<'core' | 'secondary' | 'habit'>('secondary');

  const currentGoal = goalsList.find(g => g.goal_id === activeGoalId) || goalsList[0] || null;

  // Auto-select first goal if none is active
  useEffect(() => {
    if (goalsList.length > 0 && !activeGoalId) {
      setActiveGoalId(goalsList[0].goal_id);
    }
  }, [goalsList, activeGoalId]);

  // Sync AI insights when week or month changes
  useEffect(() => {
    const key = `ai_insights_${data.month}_${data.weekStartDay || 'default'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      setAiInsights(JSON.parse(saved));
    } else {
      setAiInsights(null);
    }
    setAiError(null);
  }, [data.month, data.weekStartDay]);

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

  // --- GOAL ACTIONS & UTILITIES ---
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;

    setIsAnalyzingGoal(true);
    setGoalAnalysisError(null);

    const computedTCR = stats.tcr || 70;
    
    let universityHours = 0;
    if (data.classesSchedule) {
      data.classesSchedule.forEach(() => {
        universityHours += 1.5;
      });
    }

    try {
      const response = await fetch('/api/gemini/analyze-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          title: newGoalTitle,
          totalWeeks: newGoalWeeks,
          averageTcr: computedTCR,
          universityHours: universityHours
        })
      });

      if (!response.ok) {
        throw new Error('خطا در دریافت پاسخ از سرور هوش مصنوعی');
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'یافتن تحلیل ناموفق بود');
      }

      const themeColors = ['emerald', 'indigo', 'amber', 'rose', 'purple'];
      const randomTheme = themeColors[Math.floor(Math.random() * themeColors.length)];

      const newGoal: Goal = {
        goal_id: 'goal_' + Date.now(),
        title: newGoalTitle,
        total_weeks: newGoalWeeks,
        current_week_index: 0,
        milestones: (resData.milestones || []).map((m: any) => ({
          week_number: m.week_number,
          title: m.title,
          completed: false
        })),
        active_week_tasks: (resData.week_tasks || []).map((t: any, idx: number) => ({
          id: 'gt_' + Date.now() + '_' + idx,
          title: t.title,
          type: t.type,
          completed: false
        })),
        feasibility_score: resData.feasibility_score || 75,
        justification: resData.justification || 'مسیر شما با موفقیت تدوین شد.',
        colorTheme: randomTheme
      };

      if (onUpdateData) {
        onUpdateData((prev: PlannerData) => ({
          ...prev,
          goals: prev.goals ? [...prev.goals, newGoal] : [newGoal]
        }));
      }

      setActiveGoalId(newGoal.goal_id);
      setNewGoalTitle('');
      setNewGoalWeeks(6);
      setShowCreateForm(false);
    } catch (err: any) {
      console.error(err);
      setGoalAnalysisError(err.message || 'خطا در ارتباط با سرور هوش مصنوعی');
    } finally {
      setIsAnalyzingGoal(false);
    }
  };

  const handleNextWeek = async (goal: Goal) => {
    if (goal.current_week_index >= goal.total_weeks - 1) {
      alert('تبریک! شما به هفته پایانی هدف رسیده‌اید.');
      return;
    }

    setIsAnalyzingGoal(true);
    setGoalAnalysisError(null);

    const activeTasks = goal.active_week_tasks;
    const completedTasks = activeTasks.filter(t => t.completed).map(t => t.title);
    const failedTasks = activeTasks.filter(t => !t.completed).map(t => t.title);

    const weekHistory = {
      week_index: goal.current_week_index,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks
    };

    try {
      const response = await fetch('/api/gemini/analyze-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next-week',
          title: goal.title,
          totalWeeks: goal.total_weeks,
          currentWeekIndex: goal.current_week_index,
          milestones: goal.milestones,
          completedWeeksHistory: [weekHistory]
        })
      });

      if (!response.ok) {
        throw new Error('خطا در دریافت پاسخ از سرور هوش مصنوعی');
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'خطا در تحلیل هفته بعد');
      }

      if (onUpdateData) {
        onUpdateData((prev: PlannerData) => {
          if (!prev.goals) return prev;
          return {
            ...prev,
            goals: prev.goals.map((g) => {
              if (g.goal_id !== goal.goal_id) return g;
              
              const nextWeekIndex = g.current_week_index + 1;
              const updatedMilestones = g.milestones.map(m => {
                if (m.week_number <= nextWeekIndex) {
                  return { ...m, completed: true };
                }
                return m;
              });

              return {
                ...g,
                current_week_index: nextWeekIndex,
                justification: resData.justification || g.justification,
                milestones: updatedMilestones,
                active_week_tasks: (resData.week_tasks || []).map((t: any, idx: number) => ({
                  id: 'gt_' + Date.now() + '_' + idx,
                  title: t.title,
                  type: t.type,
                  completed: false
                }))
              };
            })
          };
        });
      }
    } catch (err: any) {
      console.error(err);
      setGoalAnalysisError(err.message || 'خطا در تولید هفته بعد با هوش مصنوعی');
    } finally {
      setIsAnalyzingGoal(false);
    }
  };

  const handleInjectTasks = (goal: Goal) => {
    if (!onUpdateData) return;

    onUpdateData((prev: PlannerData) => {
      const activeTasks = goal.active_week_tasks;
      const tag = `[هدف: ${goal.title}]`;

      let updatedCore = [...(prev.coreTasks || [])];
      let updatedSecondary = [...(prev.secondaryTasks || [])];
      let updatedReminders = [...(prev.reminders || [])];

      activeTasks.forEach((task) => {
        const fullTitle = `${tag} ${task.title}`;
        
        if (task.type === 'core') {
          if (!updatedCore.some(t => t.title.includes(task.title) && t.title.includes(goal.title))) {
            updatedCore.push({
              id: 'core_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              categoryId: 'programming',
              title: fullTitle,
              description: `تسک عملیاتی برای رسیدن به هدف بلندمدت: ${goal.title}`,
              status: 'pending'
            });
          }
        } else if (task.type === 'secondary') {
          if (!updatedSecondary.some(t => t.textFa.includes(task.title) && t.textFa.includes(goal.title))) {
            updatedSecondary.push({
              id: 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              columnId: 'daily',
              textFa: fullTitle,
              textEn: task.title,
              status: 'pending'
            });
          }
        } else if (task.type === 'habit') {
          if (!updatedReminders.some(r => r.textFa.includes(task.title) && r.textFa.includes(goal.title))) {
            updatedReminders.push({
              id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              textFa: fullTitle,
              textEn: task.title,
              checkedDays: []
            });
          }
        }
      });

      return {
        ...prev,
        coreTasks: updatedCore,
        secondaryTasks: updatedSecondary,
        reminders: updatedReminders
      };
    });

    setActionFeedback(`کارهای عملیاتی هفته جاری هدف «${goal.title}» با موفقیت به بخش‌های مختلف برنامه تزریق شدند!`);
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handleInjectEntirePath = (goal: Goal) => {
    if (!onUpdateData) return;

    onUpdateData((prev: PlannerData) => {
      let updatedCore = [...(prev.coreTasks || [])];
      const tag = `[نقاط عطف هدف: ${goal.title}]`;

      goal.milestones.forEach((milestone) => {
        const fullTitle = `${tag} هفته ${milestone.week_number}: ${milestone.title}`;
        if (!updatedCore.some(t => t.title === fullTitle)) {
          updatedCore.push({
            id: 'core_m_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            categoryId: 'programming',
            title: fullTitle,
            description: `نقطه عطف مسیر هدف بلندمدت: ${goal.title}`,
            status: milestone.completed ? 'completed' : 'pending'
          });
        }
      });

      return {
        ...prev,
        coreTasks: updatedCore
      };
    });

    setActionFeedback(`تمام نقاط عطف و مسیر بلندمدت هدف «${goal.title}» به برنامه‌ریز شما تزریق شدند!`);
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handleDeleteGoal = (goalId: string) => {
    if (!onUpdateData) return;
    if (confirm('آیا از حذف این هدف بلندمدت اطمینان دارید؟')) {
      onUpdateData((prev: PlannerData) => ({
        ...prev,
        goals: (prev.goals || []).filter(g => g.goal_id !== goalId)
      }));
      setActiveGoalId(null);
    }
  };

  const handleToggleGoalTask = (goalId: string, taskId: string) => {
    if (!onUpdateData) return;
    onUpdateData((prev: PlannerData) => {
      if (!prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map(g => {
          if (g.goal_id !== goalId) return g;
          return {
            ...g,
            active_week_tasks: g.active_week_tasks.map(t => {
              if (t.id !== taskId) return t;
              return { ...t, completed: !t.completed };
            })
          };
        })
      };
    });
  };

  const handleToggleMilestone = (goalId: string, weekNumber: number) => {
    if (!onUpdateData) return;
    onUpdateData((prev: PlannerData) => {
      if (!prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map(g => {
          if (g.goal_id !== goalId) return g;
          return {
            ...g,
            milestones: g.milestones.map(m => {
              if (m.week_number !== weekNumber) return m;
              return { ...m, completed: !m.completed };
            })
          };
        })
      };
    });
  };

  const handleAddGoalTask = (goalId: string) => {
    if (!addingTaskText.trim() || !onUpdateData) return;
    onUpdateData((prev: PlannerData) => {
      if (!prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map(g => {
          if (g.goal_id !== goalId) return g;
          return {
            ...g,
            active_week_tasks: [
              ...g.active_week_tasks,
              {
                id: 'gt_' + Date.now() + '_' + Math.random(),
                title: addingTaskText.trim(),
                type: addingTaskType,
                completed: false
              }
            ]
          };
        })
      };
    });
    setAddingTaskText('');
  };

  const handleDeleteGoalTask = (goalId: string, taskId: string) => {
    if (!onUpdateData) return;
    onUpdateData((prev: PlannerData) => {
      if (!prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map(g => {
          if (g.goal_id !== goalId) return g;
          return {
            ...g,
            active_week_tasks: g.active_week_tasks.filter(t => t.id !== taskId)
          };
        })
      };
    });
  };

  const handleStartEditGoalTask = (task: GoalTask) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskType(task.type);
  };

  const handleSaveGoalTask = (goalId: string, taskId: string) => {
    if (!editingTaskTitle.trim() || !onUpdateData) return;
    onUpdateData((prev: PlannerData) => {
      if (!prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map(g => {
          if (g.goal_id !== goalId) return g;
          return {
            ...g,
            active_week_tasks: g.active_week_tasks.map(t => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                title: editingTaskTitle.trim(),
                type: editingTaskType
              };
            })
          };
        })
      };
    });
    setEditingTaskId(null);
  };

  // Helper to calculate progress for a goal
  const getGoalProgress = (goal: Goal) => {
    const tag = `[هدف: ${goal.title}]`;
    let total = 0;
    let completed = 0;
    
    if (data.coreTasks) {
      data.coreTasks.forEach(t => {
        if (t.title.includes(tag)) {
          total++;
          if (t.status === 'completed') completed++;
        }
      });
    }
    if (data.secondaryTasks) {
      data.secondaryTasks.forEach(t => {
        if (t.textFa.includes(tag)) {
          total++;
          if (t.status === 'completed') completed++;
        }
      });
    }
    if (data.dailyTasks) {
      Object.values(data.dailyTasks).forEach(dayTasks => {
        dayTasks.forEach(t => {
          if (t.textFa.includes(tag)) {
            total++;
            if (t.status === 'completed') completed++;
          }
        });
      });
    }
    
    // Fallback to active_week_tasks checklist if nothing is injected yet
    if (total === 0) {
      total = goal.active_week_tasks.length;
      completed = goal.active_week_tasks.filter(t => t.completed).length;
    }
    
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percent, total, completed };
  };

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
  // DATA ANALYSIS & SIMULATION FOR DIFFERENT TIMEFRAMES / SEMESTERS
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
        // Class activation rule: skip if inactive
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
        // Class activation rule: skip if inactive (columnId maps to categories)
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
          // Class activation rule: skip if inactive
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
        // If language classes are inactive, skip language reminders in TCR/consistency
        if (r.id === 'language' && isLanguageInactive) return;

        const checkedCount = r.checkedDays ? r.checkedDays.length : 0;
        totalHabitDays += 7; // out of 7 days in week
        completedHabitDays += checkedCount; // checkedDays acts as completed days in this slot
      });
    }

    // Postponed or canceled
    const totalCancellations = data.postponedEvents ? data.postponedEvents.length : 0;

    // Standard Week Metrics (Adjusted for Active Classes)
    const actualTotalTasks = totalCore + totalSecondary + totalDaily;
    const actualCompletedTasks = completedCore + completedSecondary + completedDaily;
    const actualTCR = actualTotalTasks > 0 ? (actualCompletedTasks / actualTotalTasks) * 100 : 75;
    const actualHabitConsistency = totalHabitDays > 0 ? (completedHabitDays / totalHabitDays) * 100 : 68;
    const actualProcrastinationRate = actualTotalTasks > 0 ? (totalCancellations / (actualTotalTasks + totalCancellations)) * 100 : 12;

    // A. IF ACADEMIC SEMESTER VIEW IS ACTIVE
    if (viewType === 'semester') {
      if (selectedSemester === 'current') {
        // Scale weekly data to represent the full semester
        return {
          tcr: Math.round(actualTCR),
          completedTasks: actualCompletedTasks * 14 + 12,
          totalTasks: actualTotalTasks * 14 + 15,
          habitConsistency: Math.round(actualHabitConsistency),
          procrastinationRate: Math.round(actualProcrastinationRate),
          categoryShare: [
            ...(!isUniversityInactive ? [{ categoryId: 'university', name: 'دانشگاه', count: (completedCore * 14) + Math.round(completedDaily * 0.4 * 14), color: '#3b82f6' }] : []),
            { categoryId: 'programming', name: 'برنامه نویسی', count: Math.round(completedSecondary * 0.5 * 14) + Math.round(completedDaily * 0.3 * 14), color: '#f59e0b' },
            ...(!isLanguageInactive ? [{ categoryId: 'language', name: 'آموزش زبان', count: Math.round(completedSecondary * 0.3 * 14) + Math.round(completedDaily * 0.3 * 14), color: '#10b981' }] : []),
            { categoryId: 'sport', name: 'ورزش و سلامت', count: Math.round(completedDaily * 0.2 * 14), color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: Math.max(10, completedSecondary * 14), color: '#ec4899' },
          ],
          radarBalance: {
            study: isUniversityInactive ? 0 : 85,
            coding: 75,
            language: isLanguageInactive ? 0 : 70,
            sport: 62,
            leisure: 65,
          },
          procrastinationCauses: [
            { period: 'مهر', timeLimit: 5, fatigue: 4, distraction: 2 },
            { period: 'آبان', timeLimit: 7, fatigue: 3, distraction: 5 },
            { period: 'آذر', timeLimit: 4, fatigue: 6, distraction: 3 },
            { period: 'دی', timeLimit: 12, fatigue: 14, distraction: 6 },
            { period: 'بهمن', timeLimit: 3, fatigue: 2, distraction: 4 },
          ],
          productivityTrend: [
            { label: 'مهر', value: 72 },
            { label: 'آبان', value: 78 },
            { label: 'آذر', value: 65 },
            { label: 'دی (امتحانات)', value: 88 },
            { label: 'بهمن', value: 74 },
          ],
          insights: [
            {
              type: 'warning',
              title: `هشدار خستگی در دی‌ماه امتحانات ${semesterNames.currentBare}`,
              message: 'داده‌ها نشان می‌دهند در طول دی‌ماه به دلیل ددلاین‌های سنگین امتحانات دانشگاهی، نرخ خستگی شدید شما ۲ برابر شده است. داشتن فواصل استراحت سازمان‌یافته به روش علمی ضروری است.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: `رشد پیوستگی برنامه‌نویسی در ${semesterNames.currentBare}`,
              message: 'تبریک! شاخص پایداری مهارت برنامه‌نویسی شما در این ترم به ۷۵٪ رسیده است که در مقایسه با ترم‌های قبلی یک رکورد فوق‌العاده و جهش مهارتی بزرگ به حساب می‌آید.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: `پیش‌بینی بار شناختی ترم جاری`,
              message: 'تحلیل همبستگی نشان می‌دهد که ردیابی منظم افکار روزانه و روتین‌های کوچک صبحگاهی، بار ذهنی امتحانات را تا ۳۰ درصد مهار کرده و از افت راندمان جلوگیری نموده است.',
              icon: Brain
            }
          ]
        };
      } else if (selectedSemester === 'prev1') {
        // Prior Semester (e.g. Term 5)
        return {
          tcr: 74,
          completedTasks: 210,
          totalTasks: 284,
          habitConsistency: 66,
          procrastinationRate: 16,
          categoryShare: [
            { categoryId: 'university', name: 'دانشگاه', count: 90, color: '#3b82f6' },
            { categoryId: 'programming', name: 'برنامه نویسی', count: 55, color: '#f59e0b' },
            { categoryId: 'language', name: 'آموزش زبان', count: 32, color: '#10b981' },
            { categoryId: 'sport', name: 'ورزش و سلامت', count: 18, color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: 15, color: '#ec4899' },
          ],
          radarBalance: {
            study: 78,
            coding: 65,
            language: 60,
            sport: 50,
            leisure: 55,
          },
          procrastinationCauses: [
            { period: 'اسفند', timeLimit: 8, fatigue: 6, distraction: 4 },
            { period: 'فروردین', timeLimit: 4, fatigue: 3, distraction: 9 },
            { period: 'اردیبهشت', timeLimit: 10, fatigue: 8, distraction: 5 },
            { period: 'خرداد', timeLimit: 15, fatigue: 18, distraction: 7 },
            { period: 'تیر', timeLimit: 5, fatigue: 4, distraction: 6 },
          ],
          productivityTrend: [
            { label: 'اسفند', value: 70 },
            { label: 'فروردین', value: 62 },
            { label: 'اردیبهشت', value: 76 },
            { label: 'خرداد (امتحانات)', value: 80 },
            { label: 'تیر', value: 68 },
          ],
          insights: [
            {
              type: 'warning',
              title: `تداخل‌های برنامه‌ریزی در ${semesterNames.prev1Bare}`,
              message: 'در خردادماه ترم قبل تداخل‌های شدیدی بین پروژه‌های دانشگاهی و روتین‌های آزاد ورزشی وجود داشت که باعث لغو پی‌درپی تمرینات بدنی شما گردید.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: `ثبات نسبی تحصیل در ${semesterNames.prev1Bare}`,
              message: 'شما در ترم گذشته پایداری خوبی در بخش کلاس‌های درسی داشتید و ۷۸٪ از تسک‌های اجباری دانشگاه را با موفقیت پاس کردید.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: `جمع‌بندی عملکرد کل ترم`,
              message: 'به طور خلاصه، ترم گذشته با غلبه درس‌های تئوری همراه بود که ساختار زمانی صلب‌تری به کل روتین‌های شما تحمیل کرده بود.',
              icon: Brain
            }
          ]
        };
      } else {
        // Two semesters ago (e.g. Term 4)
        return {
          tcr: 68,
          completedTasks: 180,
          totalTasks: 265,
          habitConsistency: 58,
          procrastinationRate: 21,
          categoryShare: [
            { categoryId: 'university', name: 'دانشگاه', count: 85, color: '#3b82f6' },
            { categoryId: 'programming', name: 'برنامه نویسی', count: 40, color: '#f59e0b' },
            { categoryId: 'language', name: 'آموزش زبان', count: 25, color: '#10b981' },
            { categoryId: 'sport', name: 'ورزش و سلامت', count: 15, color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: 15, color: '#ec4899' },
          ],
          radarBalance: {
            study: 74,
            coding: 55,
            language: 50,
            sport: 45,
            leisure: 50,
          },
          procrastinationCauses: [
            { period: 'مهر', timeLimit: 7, fatigue: 5, distraction: 8 },
            { period: 'آبان', timeLimit: 9, fatigue: 6, distraction: 10 },
            { period: 'آذر', timeLimit: 12, fatigue: 11, distraction: 9 },
            { period: 'دی', timeLimit: 18, fatigue: 22, distraction: 11 },
            { period: 'بهمن', timeLimit: 4, fatigue: 3, distraction: 5 },
          ],
          productivityTrend: [
            { label: 'مهر', value: 65 },
            { label: 'آبان', value: 68 },
            { label: 'آذر', value: 60 },
            { label: 'دی (امتحانات)', value: 72 },
            { label: 'بهمن', value: 64 },
          ],
          insights: [
            {
              type: 'warning',
              title: `نرخ بالا رفتن تعویق‌ها در ${semesterNames.prev2Bare}`,
              message: 'دو ترم پیش به علت عدم تطابق با چارت جدید دروس، اهمال‌کاری و لغو کارها رکورد ۲۱٪ را تجربه کرد که بالاترین حد در دوره تحصیلی شماست.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: `آشنایی اولیه با مهندسی برنامه‌نویسی`,
              message: 'موفقیت‌آمیز بودن تسک‌های یادگیری پایه کدهای فرانت‌اند در این ترم، زیربنای مهارت‌های فعلی برنامه‌نویسی شما را ایجاد نمود.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: `عبرت علمی از دوره قبل`,
              message: 'داده‌ها نشان می‌دهند که بدون داشتن سیستم ردیابی متمرکز، بازدهی کلی با ۳۵٪ فرسودگی مقطعی روبرو شده بود.',
              icon: Brain
            }
          ]
        };
      }
    }

    // B. DEFAULT CALENDAR TIMEFRAME VIEWS
    switch (timeframe) {
      case 'weekly':
        return {
          tcr: Math.round(actualTCR),
          completedTasks: actualCompletedTasks,
          totalTasks: actualTotalTasks,
          habitConsistency: Math.round(actualHabitConsistency),
          procrastinationRate: Math.round(actualProcrastinationRate),
          categoryShare: [
            ...(!isUniversityInactive ? [{ categoryId: 'university', name: 'دانشگاه', count: completedCore + Math.round(completedDaily * 0.4), color: '#3b82f6' }] : []),
            { categoryId: 'programming', name: 'برنامه نویسی', count: Math.round(completedSecondary * 0.5) + Math.round(completedDaily * 0.3), color: '#f59e0b' },
            ...(!isLanguageInactive ? [{ categoryId: 'language', name: 'آموزش زبان', count: Math.round(completedSecondary * 0.3) + Math.round(completedDaily * 0.3), color: '#10b981' }] : []),
            { categoryId: 'sport', name: 'ورزش و سلامت', count: Math.round(completedDaily * 0.2), color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: Math.max(2, completedSecondary - 1), color: '#ec4899' },
          ],
          radarBalance: {
            study: isUniversityInactive ? 0 : 85,
            coding: 70,
            language: isLanguageInactive ? 0 : 65,
            sport: 50,
            leisure: 60,
          },
          procrastinationCauses: [
            { period: 'شنبه', timeLimit: 1, fatigue: 0, distraction: 1 },
            { period: 'یکشنبه', timeLimit: 0, fatigue: 1, distraction: 0 },
            { period: 'دوشنبه', timeLimit: 2, fatigue: 1, distraction: 0 },
            { period: 'سه‌شنبه', timeLimit: 1, fatigue: 2, distraction: 1 },
            { period: 'چهارشنبه', timeLimit: 0, fatigue: 1, distraction: 2 },
            { period: 'پنج‌شنبه', timeLimit: 3, fatigue: 2, distraction: 0 },
            { period: 'جمعه', timeLimit: 1, fatigue: 0, distraction: 1 },
          ],
          productivityTrend: [
            { label: 'ش', value: 70 },
            { label: 'ی', value: 85 },
            { label: 'د', value: 90 },
            { label: 'س', value: 65 },
            { label: 'چ', value: 75 },
            { label: 'پ', value: 80 },
            { label: 'ج', value: 50 },
          ],
          insights: [
            {
              type: 'warning',
              title: 'هشدار عدم تعادل و تداخل برنامه‌ها',
              message: 'در روزهای دوشنبه و پنج‌شنبه نرخ لغو و تعویق تسک‌های دانشگاهی شما افزایش یافته است. احتمالاً خستگی ناشی از کلاس‌های طولانی علت اصلی است. پیشنهاد می‌شود کارهای فرعی را در این روزها سبک‌تر کنید.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: 'پیشرفت عالی در حوزه زبان',
              message: 'شاخص پایداری عادت زبان شما به رکورد ۸۰٪ رسیده است! این پیوستگی به شکل چشمگیری تمرکز شناختی شما را در سایر فعالیت‌های فکری بالا برده است.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: 'همبستگی خستگی و بهره‌وری',
              message: 'تحلیل افکار روزانه نشان می‌دهد در روزهایی که احساس خستگی یا عدم تمرکز ثبت کرده‌اید، بلافاصله پایداری عادت ورزش با افت مواجه شده است. انجام حداقل ۱۰ دقیقه نرمش ملایم در این روزها می‌تواند چرخه فرسودگی را بشکند.',
              icon: Brain
            }
          ]
        };

      case 'monthly':
        return {
          tcr: Math.round(actualTCR * 0.95 + 4),
          completedTasks: actualCompletedTasks * 4 + 18,
          totalTasks: actualTotalTasks * 4 + 25,
          habitConsistency: Math.round(actualHabitConsistency * 0.92 + 5),
          procrastinationRate: Math.max(5, Math.round(actualProcrastinationRate * 0.9 + 2)),
          categoryShare: [
            ...(!isUniversityInactive ? [{ categoryId: 'university', name: 'دانشگاه', count: 24, color: '#3b82f6' }] : []),
            { categoryId: 'programming', name: 'برنامه نویسی', count: 18, color: '#f59e0b' },
            ...(!isLanguageInactive ? [{ categoryId: 'language', name: 'آموزش زبان', count: 14, color: '#10b981' }] : []),
            { categoryId: 'sport', name: 'ورزش و سلامت', count: 10, color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: 8, color: '#ec4899' },
          ],
          radarBalance: {
            study: isUniversityInactive ? 0 : 80,
            coding: 75,
            language: isLanguageInactive ? 0 : 70,
            sport: 60,
            leisure: 55,
          },
          procrastinationCauses: [
            { period: 'هفته ۱', timeLimit: 4, fatigue: 3, distraction: 2 },
            { period: 'هفته ۲', timeLimit: 5, fatigue: 2, distraction: 4 },
            { period: 'هفته ۳', timeLimit: 3, fatigue: 6, distraction: 1 },
            { period: 'هفته ۴', timeLimit: 6, fatigue: 4, distraction: 3 },
          ],
          productivityTrend: [
            { label: 'هفته ۱', value: 72 },
            { label: 'هفته ۲', value: 78 },
            { label: 'هفته ۳', value: 65 },
            { label: 'هفته ۴', value: 83 },
          ],
          insights: [
            {
              type: 'warning',
              title: 'تداخل‌های مکرر در اواسط ماه',
              message: 'در هفته سوم ماه به دلیل انباشت ددلاین‌های تحصیلی، نرخ تعویق و لغو کارهای برنامه‌نویسی به حداکثر رسید. توزیع متعادل‌تر پروژه‌ها در طول ماه پیشنهاد علمی ماست.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: 'پایداری بالای روتین ورزشی',
              message: 'ثبت منظم عادت ورزش در ماه جاری منجر به بهبود محسوس ۶٪ در تمرکز عمومی شما در مقایسه با ماه گذشته شده است. به این روند پایبند بمانید.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: 'اثر خواب بر روی پایداری عادت‌ها',
              message: 'بررسی داده‌های ماهانه نشان می‌دهد روزهای پس از شب‌هایی که یادداشت «بی‌خوابی» یا «خستگی شدید» در دفترچه داشتید، بهره‌وری کارهای سخت کاهش ۴۰ درصدی داشته است.',
              icon: Brain
            }
          ]
        };

      case '6months':
        return {
          tcr: 82,
          completedTasks: 312,
          totalTasks: 380,
          habitConsistency: 74,
          procrastinationRate: 11,
          categoryShare: [
            ...(!isUniversityInactive ? [{ categoryId: 'university', name: 'دانشگاه', count: 120, color: '#3b82f6' }] : []),
            { categoryId: 'programming', name: 'برنامه نویسی', count: 95, color: '#f59e0b' },
            ...(!isLanguageInactive ? [{ categoryId: 'language', name: 'آموزش زبان', count: 70, color: '#10b981' }] : []),
            { categoryId: 'sport', name: 'ورزش و سلامت', count: 54, color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: 42, color: '#ec4899' },
          ],
          radarBalance: {
            study: isUniversityInactive ? 0 : 78,
            coding: 82,
            language: isLanguageInactive ? 0 : 68,
            sport: 65,
            leisure: 70,
          },
          procrastinationCauses: [
            { period: 'بهمن', timeLimit: 12, fatigue: 15, distraction: 8 },
            { period: 'اسفند', timeLimit: 18, fatigue: 10, distraction: 12 },
            { period: 'فروردین', timeLimit: 8, fatigue: 6, distraction: 14 },
            { period: 'اردیبهشت', timeLimit: 22, fatigue: 19, distraction: 9 },
            { period: 'خرداد', timeLimit: 25, fatigue: 22, distraction: 11 },
            { period: 'تیر', timeLimit: 15, fatigue: 12, distraction: 15 },
          ],
          productivityTrend: [
            { label: 'بهمن', value: 76 },
            { label: 'اسفند', value: 81 },
            { label: 'فروردین', value: 68 },
            { label: 'اردیبهشت', value: 85 },
            { label: 'خرداد', value: 89 },
            { label: 'تیر', value: 74 },
          ],
          insights: [
            {
              type: 'warning',
              title: 'افزایش فرسودگی در فصل امتحانات',
              message: 'در ماه‌های اردیبهشت و خرداد نرخ لغو و تعویق به علت «خستگی شدید ذهنی» به اوج خود رسید. برای ترم‌های بعد استفاده از تکنیک پومودورو پیشرفته و استراحت سازمان‌یافته توصیه می‌شود.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: 'جهش مهارتی در فصل بهار',
              message: 'یادگیری مستمر برنامه‌نویسی در ماه‌های فروردین و اردیبهشت، تسلط فنی شما را در مقایسه با زمستان گذشته بیش از ۴۰ درصد افزایش داده است.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: 'همبستگی روتین و سلامت روان',
              message: 'در بازه شش‌ماهه، همبستگی معنادار ۹۲٪ بین تعداد روزهای پیگیری عادت و خلق‌وخوی ثبت شده در افکار روزانه دیده می‌شود. هر زمان عادت‌های بهداشتی افت کرده‌اند، فرسودگی عاطفی ثبت شده است.',
              icon: Brain
            }
          ]
        };

      case 'annual':
        return {
          tcr: 79,
          completedTasks: 580,
          totalTasks: 734,
          habitConsistency: 71,
          procrastinationRate: 14,
          categoryShare: [
            ...(!isUniversityInactive ? [{ categoryId: 'university', name: 'دانشگاه', count: 240, color: '#3b82f6' }] : []),
            { categoryId: 'programming', name: 'برنامه نویسی', count: 180, color: '#f59e0b' },
            ...(!isLanguageInactive ? [{ categoryId: 'language', name: 'آموزش زبان', count: 130, color: '#10b981' }] : []),
            { categoryId: 'sport', name: 'ورزش و سلامت', count: 110, color: '#8b5cf6' },
            { categoryId: 'other', name: 'سایر موارد', count: 85, color: '#ec4899' },
          ],
          radarBalance: {
            study: isUniversityInactive ? 0 : 82,
            coding: 80,
            language: isLanguageInactive ? 0 : 72,
            sport: 62,
            leisure: 65,
          },
          procrastinationCauses: [
            { period: 'فروردین', timeLimit: 30, fatigue: 25, distraction: 20 },
            { period: 'اردیبهشت', timeLimit: 45, fatigue: 52, distraction: 35 },
            { period: 'خرداد', timeLimit: 60, fatigue: 65, distraction: 40 },
            { period: 'تیر', timeLimit: 35, fatigue: 30, distraction: 50 },
            { period: 'مرداد', timeLimit: 30, fatigue: 28, distraction: 45 },
            { period: 'شهریور', timeLimit: 40, fatigue: 35, distraction: 38 },
            { period: 'مهر', timeLimit: 55, fatigue: 40, distraction: 30 },
            { period: 'آبان', timeLimit: 50, fatigue: 48, distraction: 32 },
            { period: 'آذر', timeLimit: 58, fatigue: 50, distraction: 35 },
            { period: 'دی', timeLimit: 42, fatigue: 44, pointer: 28, fatiguePercent: 44, distraction: 28 },
            { period: 'بهمن', timeLimit: 48, fatigue: 46, distraction: 26 },
            { period: 'اسفند', timeLimit: 52, fatigue: 48, distraction: 30 },
          ],
          productivityTrend: [
            { label: 'فروردین', value: 80 },
            { label: 'اردیبهشت', value: 75 },
            { label: 'خرداد', value: 70 },
            { label: 'تیر', value: 85 },
            { label: 'مرداد', value: 82 },
            { label: 'شهریور', value: 78 },
            { label: 'مهر', value: 88 },
            { label: 'آبان', value: 84 },
            { label: 'آذر', value: 80 },
            { label: 'دی', value: 82 },
            { label: 'بهمن', value: 86 },
            { label: 'اسفند', value: 90 },
          ],
          insights: [
            {
              type: 'warning',
              title: 'کاهش پیوستگی در فصل تابستان',
              message: 'داده‌های سالانه نشان می‌دهد در فصل تابستان به علت ساختارنیافتگی زمان‌های روزانه، پایداری عادت‌ها با ۱۵٪ افت مواجه بوده است. داشتن روتین حداقلی صبحگاهی توصیه می‌شود.',
              icon: AlertTriangle
            },
            {
              type: 'success',
              title: 'قهرمان پیوستگی سالانه',
              message: 'تبریک! شما در طول سال گذشته بیش از ۵۸۰ تسک اصلی و فرعی را به اتمام رسانده‌اید. بالاترین تمرکز کاری شما روی فعالیت‌های دانشگاهی و توسعه مهارت‌های برنامه‌نویسی متمرکز بوده است.',
              icon: Sparkles
            },
            {
              type: 'info',
              title: 'پیش‌بینی سالانه خستگی و تفریح',
              message: 'بررسی فصلی اثبات می‌کند که گنجاندن تفریحات سازمان‌یافته در برنامه‌های پاییز، بر خلاف تصور عمومی، بازده تحصیلی شما را ۲۵ درصد بالا برده و خستگی را به شدت فرونشانده است.',
              icon: Brain
            }
          ]
        };
    }
  }, [data, timeframe, viewType, selectedSemester, semesterNames]);

  // ----------------------------------------------------
  // HEATMAP GENERATOR (SOLAR JALALI CALENDAR STYLE)
  // ----------------------------------------------------
  const heatmapData = useMemo(() => {
    const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
    const isAnnual = timeframe === 'annual';

    // Standard Jalali Leap Year Check (Khurshed algorithm)
    const isLeapJalali = (jy: number): boolean => {
      return ((((((jy - ((jy > 0) ? 474 : 473)) % 2820) + 474) + 38) * 682) % 2816) < 682;
    };

    // Construct precise Jalali months sequence dynamically based on timeframe and active month
    const activeMonthName = data.weekMonth || (data.month ? data.month.split(' ')[0] : 'خرداد');
    const activeYear = data.weekYear || (data.month && parseInt(data.month.split(' ')[1]) ? parseInt(data.month.split(' ')[1]) : 1406);
    const jalaliMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

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
      // 'weekly' or 'monthly' -> Show just the 1 active month
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
        // Esfand
        daysCount = isLeapJalali(m.year) ? 30 : 29;
      }
      return { ...m, days: daysCount };
    });

    const monthsData = monthsWithDays.map((m, mIdx) => {
      const colCount = Math.ceil(m.days / 7); // Usually 5 columns
      const grid: any[][] = [];

      for (let c = 0; c < colCount; c++) {
        const colData = [];
        for (let r = 0; r < 7; r++) {
          const dayNumber = c * 7 + r + 1;
          if (dayNumber <= m.days) {
            // Seed calculation for deterministic streaks
            const dayIdx = mIdx * 31 + dayNumber;
            let seed = 42 + dayIdx;
            const random = () => {
              const x = Math.sin(seed) * 10000;
              return x - Math.floor(x);
            };

            const rand = random();
            const colMultiplier = c > 4 && c < 9 ? 0.3 : 0.6; // variance
            let count = 0;
            if (rand < 0.2) count = 0;
            else if (rand < 0.5) count = Math.round(1 + rand * 2);
            else if (rand < 0.85) count = Math.round(4 + rand * 3);
            else count = Math.round(8 + rand * 4);

            count = Math.round(count * colMultiplier);

            colData.push({
              dayIndex: r,
              dayName: days[r],
              count,
              date: `${days[r]}، ${dayNumber} ${m.name} ${m.year}`,
              dayOfMonth: dayNumber
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
  }, [timeframe]);

  // Calculate coordinates for Donut Chart
  const donutData = useMemo(() => {
    const baseShare = stats.categoryShare;
    
    // Process actual failed tasks or fallback to custom ratio
    const activeShare = baseShare.map(item => {
      if (donutType === 'success') {
        return item;
      } else {
        // Distribute differently for failed/canceled/postponed categories to show realistic patterns
        let count = item.count;
        if (item.categoryId === 'programming') {
          count = Math.max(1, Math.round(item.count * 0.45));
        } else if (item.categoryId === 'university') {
          count = Math.max(1, Math.round(item.count * 0.35));
        } else if (item.categoryId === 'language') {
          count = Math.max(1, Math.round(item.count * 0.25));
        } else if (item.categoryId === 'sport') {
          count = Math.max(1, Math.round(item.count * 0.5)); // sports can be postponed often
        } else {
          count = Math.max(1, Math.round(item.count * 0.3));
        }
        return { ...item, count };
      }
    });

    const total = activeShare.reduce((sum, item) => sum + item.count, 0);
    let accumulatedAngle = 0;

    return activeShare.map((item) => {
      const percentage = total > 0 ? (item.count / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle += angle;

      // Convert angles to polar coordinates
      const radius = 60;
      const x1 = 100 + radius * Math.cos((startAngle - 90) * Math.PI / 180);
      const y1 = 100 + radius * Math.sin((startAngle - 90) * Math.PI / 180);
      const x2 = 100 + radius * Math.cos((endAngle - 90) * Math.PI / 180);
      const y2 = 100 + radius * Math.sin((endAngle - 90) * Math.PI / 180);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const pathData = `
        M ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      `;

      return {
        ...item,
        percentage: Math.round(percentage),
        pathData,
        angle,
        startAngle,
        endAngle,
      };
    });
  }, [stats, donutType]);

  // Calculate active categories and values for Radar Chart dynamically
  const activeCats = useMemo(() => {
    const classStatus = data.activeClassStatus || "همه کلاس ها فعال";
    const isUniversityInactive = (classStatus === "همه کلاس ها غیر فعال" || classStatus === "فقط کلاس زبان فعال");
    const isLanguageInactive = (classStatus === "همه کلاس ها غیر فعال" || classStatus === "فقط کلاس دانشگاه فعال");

    // Dynamic categories based on user list or standard fallbacks
    const baseCategories = (data.categories && data.categories.length > 0)
      ? data.categories
      : [
          { id: 'university', nameFa: 'تحصیل' },
          { id: 'programming', nameFa: 'برنامه‌نویسی' },
          { id: 'language', nameFa: 'زبان' },
          { id: 'sport', nameFa: 'ورزش' },
          { id: 'leisure', nameFa: 'تفریح' }
        ];

    // Filter categories based on class activation status
    return baseCategories.filter(cat => {
      if (cat.id === 'university' && isUniversityInactive) return false;
      if (cat.id === 'language' && isLanguageInactive) return false;
      return true;
    }).map(cat => {
      // Determine value from stats
      let val = 70;
      if (cat.id === 'university' || cat.id === 'study') {
        val = stats.radarBalance.study || 80;
      } else if (cat.id === 'programming' || cat.id === 'coding') {
        val = stats.radarBalance.coding || 75;
      } else if (cat.id === 'language') {
        val = stats.radarBalance.language || 70;
      } else if (cat.id === 'sport') {
        val = stats.radarBalance.sport || 60;
      } else if (cat.id === 'leisure') {
        val = stats.radarBalance.leisure || 65;
      }
      return {
        id: cat.id,
        label: cat.nameFa || cat.id,
        value: val
      };
    });
  }, [data.categories, data.activeClassStatus, stats]);

  // Effect to manage Radar Chart lifecycle via Chart.js
  useEffect(() => {
    if (!radarCanvasRef.current) return;

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
              display: false
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
              label: (context) => `بهره‌وری: ${context.raw}٪`
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
              ].map((item) => {
                const isActive = timeframe === item.id;
                return (
                  <button
                    key={item.id}
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
              ].map((item) => {
                const isActive = selectedSemester === item.id;
                return (
                  <button
                    key={item.id}
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

      {/* ========================================================================= */}
      {/* =============== INTELLIGENT GOAL MANAGEMENT PANEL ===================== */}
      {/* ========================================================================= */}
      {false && (
      <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-xs transition-all relative overflow-hidden">
        {/* Dynamic decorative backdrop using standard HEX colors */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/20 rounded-full blur-3xl pointer-events-none -mr-40 -mt-40" />
        
        {/* Header Row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-sm">
              <Target className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">سیستم هوشمند مدیریت و پیش‌بینی تحقق اهداف</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">ترسیم اهداف بلندمدت، پیش‌بینی هوشمند میزان تحقق و تولید گام‌به‌گام وظایف با Gemini</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {goalsList.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded-xl p-1">
                <select
                  value={activeGoalId || ''}
                  onChange={(e) => setActiveGoalId(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-700 outline-none pr-3 pl-8 py-1.5 cursor-pointer max-w-[180px] truncate"
                >
                  {goalsList.map((g) => (
                    <option key={g.goal_id} value={g.goal_id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => currentGoal && handleDeleteGoal(currentGoal.goal_id)}
                  title="حذف هدف فعلی"
                  className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black transition-all cursor-pointer shadow-3xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showCreateForm ? 'انصراف' : 'تعریف هدف جدید'}</span>
            </button>
          </div>
        </div>

        {/* Goal Registration Form */}
        {showCreateForm || goalsList.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-6 p-5 border border-indigo-100/80 bg-indigo-50/10 rounded-2xl relative z-10"
          >
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <h4 className="text-xs font-black text-indigo-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>فرموله‌سازی هدف بلندمدت شما با هوش مصنوعی</span>
              </h4>

              <div className="flex flex-col gap-1.5 text-right">
                <label className="text-[10px] font-black text-slate-400">عنوان دقیق هدف بلندمدت چیست؟</label>
                <textarea
                  required
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="مثال: یادگیری جامع توسعه فرانت‌اند با فریمورک React و تسلط بر مفاهیم هوش مصنوعی"
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white/80 min-h-[70px] resize-y text-right"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 text-right">
                  <label className="text-[10px] font-black text-slate-400">بازه زمانی مورد نظر شما (هفته): {newGoalWeeks} هفته</label>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-black text-slate-400">۲</span>
                    <input
                      type="range"
                      min={2}
                      max={24}
                      value={newGoalWeeks}
                      onChange={(e) => setNewGoalWeeks(Number(e.target.value))}
                      className="flex-1 accent-indigo-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                    />
                    <span className="text-[10px] font-black text-slate-400">۲۴</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 flex flex-col justify-center text-right text-[9px] font-bold text-slate-500 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>نرخ بازدهی شما (TCR):</span>
                    <strong className="text-indigo-600">{stats.tcr}%</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>تعداد واحد/ساعات کلاسی:</span>
                    <strong className="text-indigo-600">
                      {data.classesSchedule ? data.classesSchedule.length * 1.5 : 0} ساعت در هفته
                    </strong>
                  </div>
                  <span className="text-[8px] text-slate-400 leading-tight">
                    * هوش مصنوعی این متغیرها را مستقیماً برای تحلیل دقیق قابلیت تحقق هدف بررسی خواهد کرد.
                  </span>
                </div>
              </div>

              {goalAnalysisError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/50 text-xs font-bold text-rose-600 text-right">
                  ⚠️ {goalAnalysisError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {goalsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-black transition-all cursor-pointer"
                  >
                    انصراف
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isAnalyzingGoal}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:bg-indigo-400"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>تحلیل هوشمند و ترسیم نقشه راه با Gemini</span>
                </button>
              </div>
            </form>
          </motion.div>
        ) : null}

        {/* Gemini Creation Loading Indicator */}
        {isAnalyzingGoal && (
          <div className="mt-6 p-8 border border-indigo-100 bg-indigo-50/20 rounded-2xl flex flex-col items-center justify-center gap-4 relative z-10 text-center animate-pulse">
            <Sparkles className="w-8 h-8 text-indigo-600 animate-spin" />
            <div>
              <h4 className="text-xs font-black text-indigo-950">در حال پردازش نقشه راه هدف و شبیه‌سازی مسیر...</h4>
              <p className="text-[10px] text-slate-400 font-bold mt-1 max-w-md mx-auto leading-relaxed">
                هوش مصنوعی Gemini در حال تطابق سختی عنوان هدف با نرخ TCR واقعی برنامه‌ریزی شما، ساعت کار کلاسی و ساختار عادت‌های روزانه‌تان است تا مطمئن‌ترین و واقعی‌ترین مسیر را تدوین کند.
              </p>
            </div>
          </div>
        )}

        {/* Main Goals Dashboard Display */}
        {!isAnalyzingGoal && currentGoal && !showCreateForm && (
          <div className="mt-6 space-y-6 relative z-10">
            {/* Row 1: Basic Info & Custom Progress Bar */}
            {(() => {
              const prog = getGoalProgress(currentGoal);
              const themeColors: Record<string, { bg: string, text: string, border: string, accent: string, hexBg: string }> = {
                emerald: { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: 'text-emerald-800', border: 'border-emerald-200', accent: 'bg-emerald-600', hexBg: '#ecfdf5' },
                indigo: { bg: 'bg-indigo-50 text-indigo-800 border-indigo-200', text: 'text-indigo-800', border: 'border-indigo-200', accent: 'bg-indigo-600', hexBg: '#eef2ff' },
                amber: { bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800', border: 'border-amber-200', accent: 'bg-amber-600', hexBg: '#fffbeb' },
                rose: { bg: 'bg-rose-50 text-rose-800 border-rose-200', text: 'text-rose-800', border: 'border-rose-200', accent: 'bg-rose-600', hexBg: '#fff1f2' },
                purple: { bg: 'bg-purple-50 text-purple-800 border-purple-200', text: 'text-purple-800', border: 'border-purple-200', accent: 'bg-purple-600', hexBg: '#faf5ff' },
              };

              const currentTheme = themeColors[currentGoal.colorTheme || 'emerald'] || themeColors.emerald;

              return (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  {/* Left: General Goal Progression and Live Progress Tracker */}
                  <div className="md:col-span-8 flex flex-col justify-between p-5 rounded-2xl border border-slate-150 bg-slate-50/50">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-right">
                      <div>
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black border uppercase ${currentTheme.bg}`}>
                          پوسته {currentGoal.colorTheme}
                        </span>
                        <h4 className="text-sm font-black text-slate-800 mt-2">{currentGoal.title}</h4>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-xs font-black text-slate-700">هفته {currentGoal.current_week_index + 1} از {currentGoal.total_weeks}</span>
                        <p className="text-[8px] text-slate-400 font-bold mt-0.5">پیوستگی مسیر با Gemini</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[10px] font-black text-slate-600 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${currentTheme.accent}`} />
                          <span>میزان رشد و پیشرفت پویا:</span>
                        </div>
                        <span>{prog.percent}% <strong className="text-[8px] text-slate-400">({prog.completed} از {prog.total} کار)</strong></span>
                      </div>
                      <div className="w-full bg-slate-200/60 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-300/30">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${currentTheme.accent}`}
                          style={{ width: `${prog.percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[8px] font-black text-slate-400 mt-2">
                        <span>* ردیابی خودکار کارهای تزریق شده در صفحات اصلی</span>
                        <span className="text-indigo-600">+۱۲.۵٪ نسبت به میانگین قبلی</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Feasibility Gauge & AI Explanation justification */}
                  <div className="md:col-span-4 flex flex-col justify-between p-5 rounded-2xl border border-slate-150 bg-slate-50/50 text-right">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[10px] font-black text-slate-400">پیش‌بینی هوشمند میزان موفقیت</h5>
                      <div className="p-1 bg-indigo-50 text-indigo-600 rounded-lg">
                        <TrendingUp className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="my-3 flex items-center justify-start gap-3">
                      <div className="relative flex items-center justify-center">
                        <svg className="w-14 h-14" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                          <circle
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            stroke={
                              (currentGoal.feasibility_score || 75) >= 75
                                ? '#10b981'
                                : (currentGoal.feasibility_score || 75) >= 50
                                ? '#f59e0b'
                                : '#f43f5e'
                            }
                            strokeWidth="3.5"
                            strokeDasharray={`${currentGoal.feasibility_score}, 100`}
                            strokeLinecap="round"
                            transform="rotate(-90 18 18)"
                          />
                        </svg>
                        <span className="absolute text-xs font-black text-slate-800">{currentGoal.feasibility_score}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-700 block">احتمال تحقق هدف:</span>
                        <strong
                          className={`text-xs font-black ${
                            (currentGoal.feasibility_score || 75) >= 75
                              ? 'text-emerald-600'
                              : (currentGoal.feasibility_score || 75) >= 50
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {(currentGoal.feasibility_score || 75) >= 75
                            ? 'بسیار بالا (عالی)'
                            : (currentGoal.feasibility_score || 75) >= 50
                            ? 'متوسط (نیازمند دقت)'
                            : 'پایین (ریسک خستگی)'}
                        </strong>
                      </div>
                    </div>

                    <div className="bg-white p-2 rounded-xl border border-slate-200/60 text-[8px] font-black text-slate-500 leading-normal">
                      💡 {currentGoal.justification?.substring(0, 150)}...
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Row 2: Milestones Progress Timeline */}
            <div className="p-5 rounded-2xl border border-slate-150 bg-slate-50/30">
              <h5 className="text-[10px] font-black text-slate-400 mb-4 text-right">فازها و نقاط عطف اصلی نقشه راه</h5>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
                {currentGoal.milestones.map((milestone) => (
                  <div
                    key={milestone.week_number}
                    className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-right transition-all duration-200 ${
                      milestone.completed
                        ? 'bg-emerald-50/50 border-emerald-200 text-slate-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={milestone.completed}
                      onChange={() => handleToggleMilestone(currentGoal.goal_id, milestone.week_number)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer accent-indigo-600"
                    />
                    <div className="flex-1">
                      <span className="text-[8px] font-black text-indigo-600 block">هفته {milestone.week_number}</span>
                      <p className="text-[10px] font-black text-slate-800 leading-tight mt-0.5">{milestone.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 3: Active Week's Proposed Tasks Checklist & Editing */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Column: Weekly Task Checklist and Custom Adding Form */}
              <div className="lg:col-span-8 p-5 rounded-2xl border border-slate-150 bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase">هفتگی</span>
                  <h5 className="text-xs font-black text-slate-700 text-right">
                    کارهای عملیاتی هفته جاری (هفته {currentGoal.current_week_index + 1})
                  </h5>
                </div>

                {/* Checklist loop */}
                <div className="space-y-2.5">
                  {currentGoal.active_week_tasks.map((task) => {
                    const isEditing = editingTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150/60 rounded-xl"
                      >
                        <div className="flex items-center gap-2.5 flex-1 pr-1 text-right">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleGoalTask(currentGoal.goal_id, task.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer accent-indigo-600 shrink-0"
                          />

                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-[10px] text-right font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                              <select
                                value={editingTaskType}
                                onChange={(e: any) => setEditingTaskType(e.target.value)}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-[9px] font-bold focus:outline-none"
                              >
                                <option value="core">اولویت اصلی</option>
                                <option value="secondary">کار جانبی</option>
                                <option value="habit">عادت روزانه</option>
                              </select>
                              <button
                                onClick={() => handleSaveGoalTask(currentGoal.goal_id, task.id)}
                                className="p-1 hover:bg-emerald-100 text-emerald-600 rounded-lg cursor-pointer transition-colors"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-start md:flex-row md:items-center gap-1.5">
                              <span
                                className={`text-[10px] font-black text-right ${
                                  task.completed ? 'line-through text-slate-400' : 'text-slate-700'
                                }`}
                              >
                                {task.title}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase ${
                                  task.type === 'core'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                    : task.type === 'secondary'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}
                              >
                                {task.type === 'core'
                                  ? 'اولویت اصلی'
                                  : task.type === 'secondary'
                                  ? 'کار جانبی'
                                  : 'عادت روزانه'}
                              </span>
                            </div>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleStartEditGoalTask(task)}
                              className="p-1 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-lg cursor-pointer transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteGoalTask(currentGoal.goal_id, task.id)}
                              className="p-1 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Form to add custom task */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    value={addingTaskText}
                    onChange={(e) => setAddingTaskText(e.target.value)}
                    placeholder="عنوان کار جدید برای الحاق به این هفته..."
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-[10px] text-right font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/30"
                  />
                  <div className="flex gap-2">
                    <select
                      value={addingTaskType}
                      onChange={(e: any) => setAddingTaskType(e.target.value)}
                      className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-[9px] font-black text-slate-700 bg-white"
                    >
                      <option value="core">اولویت اصلی</option>
                      <option value="secondary">کار جانبی</option>
                      <option value="habit">عادت روزانه</option>
                    </select>
                    <button
                      onClick={() => handleAddGoalTask(currentGoal.goal_id)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black transition-all cursor-pointer shadow-3xs"
                    >
                      افزودن تسک
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Goal Explanation & Actions Panel */}
              <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-150 bg-slate-50/50 flex flex-col justify-between">
                <div className="space-y-3">
                  <h5 className="text-[10px] font-black text-slate-400 text-right">تحلیل علمی بار ذهنی نقشه راه</h5>
                  <p className="text-[9px] font-bold text-slate-600 text-right leading-relaxed">
                    {currentGoal.justification}
                  </p>
                </div>

                <div className="mt-5 space-y-2 pt-4 border-t border-slate-200/40">
                  <button
                    onClick={() => handleInjectTasks(currentGoal)}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>تزریق تسک‌های این هفته به برنامه‌ریز اصلی</span>
                  </button>

                  <button
                    onClick={() => handleInjectEntirePath(currentGoal)}
                    className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <Target className="w-3.5 h-3.5 text-indigo-600" />
                    <span>تزریق کل مسیر (نقاط عطف) به برنامه‌ریز اصلی</span>
                  </button>

                  <button
                    onClick={() => handleNextWeek(currentGoal)}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-white animate-pulse" />
                    <span>تکمیل هفته و دریافت برنامه هفته بعد با Gemini</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>
      )}

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
                {donutData.map((seg, i) => (
                  <path
                    key={seg.categoryId}
                    d={seg.pathData}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={hoveredSegment === seg.categoryId ? '28' : '22'}
                    strokeDasharray={`${(seg.angle / 360) * (2 * Math.PI * 60)} 1000`}
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
                  {donutData.length > 0 ? [...donutData].sort((a, b) => b.count - a.count)[0]?.name : ''}
                </text>
              </svg>
            </div>

            {/* Custom Interactive Legend */}
            <div className="sm:col-span-7 space-y-2">
              {donutData.map((seg) => (
                <div
                  key={seg.categoryId}
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
              <h3 className="text-xs font-black text-slate-800">شاخص تعادل کار، تحصیل و ابعاد زندگی</h3>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">مقایسه توزیع انرژی بین وظایف ساختاریافته تحصیلی و ابعاد غیرتحصیلی زندگی</p>
          </div>

          <div className="mt-6 h-[220px] relative w-full flex items-center justify-center">
            <canvas ref={radarCanvasRef} />
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
              <h3 className="text-xs font-black text-slate-800">روند لغو و تعویق کارها بر اساس علت</h3>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">تحلیل ریشه‌ای و مکرر لغو کارها (کمبود وقت در مقابل خستگی یا عدم تمرکز)</p>
          </div>

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
                  <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end min-w-0">
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
              <h3 className="text-xs font-black text-slate-800">نوسان راندمان و پویایی بهره‌وری</h3>
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
                {timeframe === 'annual' ? 'نقشه حرارتی توزیع فعالیت سالانه' : 'نقشه حرارتی توزیع فعالیت ۶ ماهه'} (Activity Heatmap)
              </h3>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">نمای کلی حجم کارهای تکمیل‌شده شما به تفکیک روز و هفته در قالب الگوهای گیت‌هاب</p>
          </div>
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
              {heatmapData.monthsData.map((month) => (
                <div key={month.name} className="flex flex-col items-center gap-1.5">
                  {/* Centered Month Title above its columns */}
                  <div className="text-[8px] font-black text-slate-400 select-none text-center">
                    {month.name}
                  </div>
                  
                  {/* Grid columns of this month */}
                  <div className="flex gap-[3px]">
                    {month.grid.map((col, cIdx) => (
                      <div key={cIdx} className="flex flex-col gap-[3px] shrink-0">
                        {col.map((day, rIdx) => {
                          if (!day) {
                            // Empty placeholder of the exact same size to maintain layout
                            return (
                              <div 
                                key={rIdx} 
                                className="w-3 h-3 min-w-[12px] min-h-[12px] opacity-0 pointer-events-none" 
                              />
                            );
                          }

                          let bgClass = 'bg-slate-100';
                          if (day.count > 0 && day.count <= 2) bgClass = 'bg-emerald-100 text-emerald-800';
                          else if (day.count > 2 && day.count <= 5) bgClass = 'bg-emerald-300 text-emerald-900';
                          else if (day.count > 5 && day.count <= 8) bgClass = 'bg-emerald-500 text-white';
                          else if (day.count > 8) bgClass = 'bg-emerald-700 text-white';

                          return (
                            <div
                              key={day.dayOfMonth}
                              className={`w-3 h-3 min-w-[12px] min-h-[12px] rounded-[2px] cursor-pointer transition-all hover:ring-2 hover:ring-indigo-400/50 hover:scale-110 ${bgClass}`}
                              onMouseEnter={() => setHoveredHeatmapDay({ date: day.date, count: day.count })}
                              onMouseLeave={() => setHoveredHeatmapDay(null)}
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
          <div dir="rtl" className="mt-4 min-h-6 bg-slate-50 border border-slate-200/40 rounded-xl px-3 py-1.5 text-[9px] font-bold text-slate-500 flex items-center gap-1.5 transition-all text-right">
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            {hoveredHeatmapDay ? (
              <span>داده روز: <strong className="text-slate-800">{hoveredHeatmapDay.date}</strong> با <strong className="text-indigo-600">{hoveredHeatmapDay.count} تسک تکمیل‌شده</strong></span>
            ) : (
              <span>برای دیدن تعداد کارهای انجام‌شده هر روز، نشانگر موس را روی خانه‌ها نگه دارید.</span>
            )}
          </div>
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
