import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Target, 
  Brain, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  ChevronRight, 
  Compass, 
  Award, 
  Sparkles, 
  Zap, 
  CheckCircle2, 
  Loader2, 
  HelpCircle,
  Clock,
  ArrowRightLeft,
  X,
  Type as FontIcon,
  Sliders,
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { PlannerData, Goal, GoalMilestone, GoalTask, CoreTask, SecondaryTask, ReminderItem } from '../types';

const GEMINI_API_KEY = "AQ.Ab8RN6LZeGduixWhXMBvCtIlmcOuq0ZLSPSoX-B9rQha2sQL3A";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Clean JSON string returned by Gemini
const cleanJsonString = (raw: string): string => {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json/i, '');
  cleaned = cleaned.replace(/^```/g, '');
  cleaned = cleaned.replace(/```$/g, '');
  return cleaned.trim();
};

interface GoalsTabProps {
  data: PlannerData;
  onUpdateData: React.Dispatch<React.SetStateAction<PlannerData>>;
  showToast: (msg: string) => void;
  lang?: 'fa' | 'en';
}

export default function GoalsTab({ data, onUpdateData, showToast, lang = 'fa' }: GoalsTabProps) {
  const isRtl = lang === 'fa';
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalWeeks, setNewGoalWeeks] = useState(4);
  const [selectedTheme, setSelectedTheme] = useState('indigo');
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [loadingGoalId, setLoadingGoalId] = useState<string | null>(null);

  // States for Editing a task inside a goal
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskType, setEditingTaskType] = useState<'core' | 'secondary' | 'habit'>('core');

  // State for adding a new manual task to a goal
  const [addingTaskGoalId, setAddingTaskGoalId] = useState<string | null>(null);
  const [newManualTaskTitle, setNewManualTaskTitle] = useState('');
  const [newManualTaskType, setNewManualTaskType] = useState<'core' | 'secondary' | 'habit'>('core');

  const themes = [
    { name: 'indigo', label: isRtl ? 'نیلی' : 'Indigo', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100', accent: 'bg-indigo-600', text: 'text-indigo-600', ring: 'focus:ring-indigo-500' },
    { name: 'emerald', label: isRtl ? 'زمردی' : 'Emerald', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100', accent: 'bg-emerald-600', text: 'text-emerald-600', ring: 'focus:ring-emerald-500' },
    { name: 'amber', label: isRtl ? 'کهربایی' : 'Amber', bg: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100', accent: 'bg-amber-500', text: 'text-amber-600', ring: 'focus:ring-amber-500' },
    { name: 'rose', label: isRtl ? 'رز' : 'Rose', bg: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100', accent: 'bg-rose-600', text: 'text-rose-600', ring: 'focus:ring-rose-500' },
    { name: 'purple', label: isRtl ? 'بنفش' : 'Purple', bg: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100', accent: 'bg-purple-600', text: 'text-purple-600', ring: 'focus:ring-purple-500' },
  ];

  const getThemeConfig = (name?: string) => {
    return themes.find(t => t.name === name) || themes[0];
  };

  // Extract stats for prompting Gemini
  const userStatsContext = useMemo(() => {
    let total = 0;
    let completed = 0;
    
    if (data.coreTasks) {
      data.coreTasks.forEach(t => {
        total++;
        if (t.status === 'completed') completed++;
      });
    }
    if (data.secondaryTasks) {
      data.secondaryTasks.forEach(t => {
        total++;
        if (t.status === 'completed') completed++;
      });
    }
    if (data.dailyTasks) {
      Object.values(data.dailyTasks).forEach(tasks => {
        tasks.forEach(t => {
          total++;
          if (t.status === 'completed') completed++;
        });
      });
    }

    const tcr = total > 0 ? Math.round((completed / total) * 100) : 70;
    const term = data.term || 'ترم فعلی';
    const activeClassesStatus = data.activeClassStatus || 'همه کلاس ها فعال';
    return { tcr, term, activeClassesStatus };
  }, [data]);

  // 1. REGISTER NEW GOAL AND GENERATE WITH GEMINI
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) {
      showToast('لطفاً عنوان هدف را وارد کنید');
      return;
    }

    setIsCreatingGoal(true);

    const prompt = isRtl ? `شما یک مشاور بهره‌وری و سیستم برنامه‌ریزی هوشمند هستید.
کاربر یک هدف جدید با عنوان "${newGoalTitle}" برای مدت زمان ${newGoalWeeks} هفته تعریف کرده است.
مشخصات بهره‌وری فعلی کاربر به این شرح است:
- نرخ تکمیل کارها (TCR) در هفته‌های اخیر: ${userStatsContext.tcr}%
- ترم جاری دانشگاه: ${userStatsContext.term}
- وضعیت فعال بودن کلاس‌ها: ${userStatsContext.activeClassesStatus}

بر اساس این داده‌ها، یک تحلیل علمی کوتاه، شانس واقعی تحقق (feasibility_score از 0 تا 100) و یک توضیح توجیهی به زبان فارسی (حداکثر 2 جمله روان) به همراه 3 الی 5 فاز اصلی (milestones) برای کل دوره، و لیست کارهای بسیار ریز و دقیق و کاربردی برای هفته اول (بین 3 تا 6 تسک) تولید کنید.

تسک‌های تولیدی را با یکی از انواع زیر برچسب‌گذاری کنید:
- 'core' (کارهای اساسی و بااولویت بالا)
- 'secondary' (کارهای فرعی و فکری)
- 'habit' (عادت‌های تکرارشونده روزانه یا پیگیری‌ها)

پاسخ را دقیقاً در ساختار JSON زیر ارسال کنید و هیچ متنی قبل یا بعد از آن ننویسید:
{
  "feasibility_score": 75,
  "justification": "توضیح کوتاه و تحلیل علمی شانس موفقیت کاربر بر اساس آمارهای فعلی‌اش",
  "milestones": [
    { "week_number": 1, "title": "عنوان فاز اول یا نقطه عطف اول" }
  ],
  "week_tasks": [
    { "title": "تسک ریز فاز اول برای هفته اول", "type": "core" }
  ]
}` : `You are an AI productivity consultant and goal breakdown system.
The user has defined a new goal titled "${newGoalTitle}" with a duration of ${newGoalWeeks} weeks.
Current productivity stats:
- Task Completion Rate (TCR): ${userStatsContext.tcr}%
- University Term: ${userStatsContext.term}
- Active classes status: ${userStatsContext.activeClassesStatus}

Generate a concise scientific analysis, realistic feasibility score (0 to 100), justification in English (max 2 clear sentences), 3 to 5 key milestones for the entire duration, and actionable tasks for week 1 (3 to 6 tasks).

Label tasks with one of: 'core', 'secondary', 'habit'.

Respond strictly in JSON format matching this schema:
{
  "feasibility_score": 75,
  "justification": "Short analysis of user's success probability based on current stats.",
  "milestones": [
    { "week_number": 1, "title": "Phase 1 title or milestone" }
  ],
  "week_tasks": [
    { "title": "Actionable task for week 1", "type": "core" }
  ]
}`;

    try {
      let result;
      try {
        const url = `${GEMINI_URL}?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Gemini HTTP Error: ${response.status}`);
        }

        const resData = await response.json();
        const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("پاسخی از جمنای دریافت نشد");

        const jsonStr = cleanJsonString(rawText);
        result = JSON.parse(jsonStr);
      } catch (directError) {
        console.warn("Direct client-side Gemini request failed. Falling back to backend proxy...", directError);
        const response = await fetch("/api/gemini/analyze-goal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "analyze",
            title: newGoalTitle,
            totalWeeks: newGoalWeeks,
            averageTcr: userStatsContext.tcr,
            universityHours: userStatsContext.activeClassesStatus === 'فعال' ? 15 : 0
          })
        });

        if (!response.ok) {
          throw new Error("ارتباط مستقیم و غیرمستقیم با هوش مصنوعی برقرار نشد. لطفاً اینترنت و کلید API خود را بررسی کنید.");
        }

        const resData = await response.json();
        if (resData.success === false) {
          throw new Error(resData.error || "خطای نامشخص در سرور پروکسی");
        }
        result = resData;
      }

      const newGoalId = `goal_${Date.now()}`;
      
      const newGoal: Goal = {
        goal_id: newGoalId,
        title: newGoalTitle,
        total_weeks: newGoalWeeks,
        current_week_index: 1,
        feasibility_score: result.feasibility_score || 70,
        justification: result.justification || 'برنامه ایجاد شده بر اساس متغیرهای بهره‌وری شما.',
        colorTheme: selectedTheme,
        milestones: (result.milestones || []).map((m: any, idx: number) => ({
          week_number: m.week_number || m.deadline_week || (idx + 1),
          title: m.title,
          completed: false
        })),
        active_week_tasks: (result.week_tasks || result.week_1_tasks || []).map((t: any, idx: number) => ({
          id: `gt_${Date.now()}_${idx}`,
          title: t.title,
          type: t.type === 'main' ? 'core' : (t.type || 'core'),
          completed: false,
          goal_id: newGoalId
        })),
        completed_tasks_count: 0
      };

      onUpdateData(prev => ({
        ...prev,
        goals: [...(prev.goals || []), newGoal]
      }));

      showToast('هدف جدید با موفقیت تحلیل و اضافه شد!');
      setNewGoalTitle('');
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'خطا در ارتباط با جمنای! لطفاً مجدداً تلاش کنید.');
    } finally {
      setIsCreatingGoal(false);
    }
  };

  // 2. DYNAMIC JOURNEY CONTINUITY (NEXT WEEK)
  const handleLoadNextWeek = async (goal: Goal) => {
    if (goal.current_week_index >= goal.total_weeks) {
      showToast('شما به هفته نهایی این هدف رسیده‌اید!');
      return;
    }

    const nextWeekIndex = goal.current_week_index + 1;
    setLoadingGoalId(goal.goal_id);

    const activeTasks = goal.active_week_tasks;
    const completedTasks = activeTasks.filter(t => t.completed).map(t => t.title);
    const failedTasks = activeTasks.filter(t => !t.completed).map(t => t.title);

    const weekHistory = {
      week_index: goal.current_week_index,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks
    };

    try {
      const prompt = `شما یک سیستم برنامه‌ریزی هوشمند هستید.
کاربر هفته ${goal.current_week_index} از هدف "${goal.title}" را به اتمام رسانده است.
کل مسیر هدف شامل این فازها (Milestones) است:
${JSON.stringify(goal.milestones)}

نرخ تکمیل فعلی بهره‌وری کاربر: ${userStatsContext.tcr}%
تاریخچه هفته گذشته:
- کارهای تکمیل شده: ${JSON.stringify(completedTasks)}
- کارهای انجام نشده: ${JSON.stringify(failedTasks)}

لطفاً تسک‌های هفته بعدی (هفته ${nextWeekIndex}) را به عنوان گام بعدی این مسیر پیوسته و بدون تداخل با مراحل قبلی تولید کنید (بین 3 تا 5 تسک کاربردی و ریز).

تسک‌ها را با یکی از انواع 'core' (اصلی) یا 'secondary' (فرعی) یا 'habit' (عادت) مشخص کنید.
یک بازخورد یا توضیح علمی بسیار کوتاه (justification) به فارسی در مورد ورود کاربر به هفته جدید بنویسید (حداکثر دو جمله).

پاسخ را دقیقاً در قالب JSON زیر ارسال کنید و هیچ توضیح دیگری ننویسید:
{
  "justification": "توضیح کوتاه و تشویقی روان برای شروع هفته جدید بر اساس عملکرد کاربر",
  "week_tasks": [
    { "title": "عنوان تسک هفته جدید", "type": "core" }
  ]
}`;

      let result;
      try {
        const url = `${GEMINI_URL}?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Gemini Error: ${response.status}`);
        }

        const resData = await response.json();
        const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("پاسخی از جمنای دریافت نشد");

        const jsonStr = cleanJsonString(rawText);
        result = JSON.parse(jsonStr);
      } catch (directError) {
        console.warn("Direct client-side Gemini next-week request failed. Falling back to backend proxy...", directError);
        const response = await fetch("/api/gemini/analyze-goal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "next-week",
            title: goal.title,
            totalWeeks: goal.total_weeks,
            averageTcr: userStatsContext.tcr,
            currentWeekIndex: goal.current_week_index - 1,
            milestones: goal.milestones,
            completedWeeksHistory: [
              {
                week_index: goal.current_week_index - 1,
                completed_tasks: completedTasks,
                failed_tasks: failedTasks
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error("ارتباط مستقیم و غیرمستقیم با هوش مصنوعی برقرار نشد. لطفاً اینترنت و کلید API خود را بررسی کنید.");
        }

        const resData = await response.json();
        if (resData.success === false) {
          throw new Error(resData.error || "خطای نامشخص در سرور پروکسی");
        }
        result = resData;
      }

      onUpdateData(prev => {
        const updatedGoals = (prev.goals || []).map(g => {
          if (g.goal_id === goal.goal_id) {
            // Update current week milestones if any matches previous week
            const updatedMilestones = g.milestones.map(m => {
              if (m.week_number === g.current_week_index) {
                return { ...m, completed: true };
              }
              return m;
            });

            return {
              ...g,
              current_week_index: nextWeekIndex,
              justification: result.justification || g.justification,
              milestones: updatedMilestones,
              active_week_tasks: (result.week_tasks || result.week_N_tasks || []).map((t: any, idx: number) => ({
                id: `gt_${Date.now()}_${idx}`,
                title: t.title,
                type: t.type || 'core',
                completed: false,
                goal_id: goal.goal_id
              }))
            };
          }
          return g;
        });

        return { ...prev, goals: updatedGoals };
      });

      showToast(`برنامه هفته ${nextWeekIndex} با موفقیت دریافت و اعمال شد!`);
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'خطا در دریافت کارهای هفته بعد از جمنای!');
    } finally {
      setLoadingGoalId(null);
    }
  };

  // Delete goal
  const handleDeleteGoal = (goalId: string) => {
    if (window.confirm('آیا مطمئن هستید که می‌خواهید این هدف را حذف کنید؟ کارهای تزریق شده در برنامه باقی خواهند ماند.')) {
      onUpdateData(prev => ({
        ...prev,
        goals: (prev.goals || []).filter(g => g.goal_id !== goalId)
      }));
      showToast('هدف با موفقیت حذف شد.');
    }
  };

  // 3. FLEXIBLE TASK INJECTION
  // Inject active week tasks to current active week in the planner
  const handleInjectWeeklyTasks = (goal: Goal) => {
    const tag = `[هدف: ${goal.title}]`;
    let coreInjected = 0;
    let secInjected = 0;
    let habitInjected = 0;

    const newCoreTasks: CoreTask[] = [];
    const newSecTasks: SecondaryTask[] = [];
    const newReminders: ReminderItem[] = [];

    goal.active_week_tasks.forEach(t => {
      const fullTitle = `${tag} ${t.title}`;
      
      if (t.type === 'core') {
        newCoreTasks.push({
          id: `ct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          categoryId: 'programming', // default category
          title: fullTitle,
          description: `تولید شده برای هفته ${goal.current_week_index} از هدف: ${goal.title}`,
          status: 'pending'
        });
        coreInjected++;
      } else if (t.type === 'secondary') {
        newSecTasks.push({
          id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          columnId: data.secondaryTaskColumns[0]?.id || 'learn',
          textFa: fullTitle,
          textEn: t.title,
          status: 'pending'
        });
        secInjected++;
      } else if (t.type === 'habit') {
        newReminders.push({
          id: `rem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          textFa: fullTitle,
          textEn: t.title,
          checkedDays: []
        });
        habitInjected++;
      }
    });

    onUpdateData(prev => ({
      ...prev,
      coreTasks: [...(prev.coreTasks || []), ...newCoreTasks],
      secondaryTasks: [...(prev.secondaryTasks || []), ...newSecTasks],
      reminders: [...(prev.reminders || []), ...newReminders]
    }));

    showToast(`تعداد ${coreInjected + secInjected + habitInjected} تسک مربوط به هفته ${goal.current_week_index} به برنامه‌ریز اصلی تزریق شد.`);
  };

  // Inject entire path (Milestones) to core tasks
  const handleInjectEntirePath = (goal: Goal) => {
    const tag = `[هدف: ${goal.title}]`;
    const milestonesTasks: CoreTask[] = goal.milestones.map(m => ({
      id: `ct_ms_${Date.now()}_${m.week_number}`,
      categoryId: 'programming',
      title: `${tag} فاز ${m.week_number}: ${m.title}`,
      description: `نقطه عطف کلی مسیر - مهلت تا هفته ${m.week_number}`,
      status: 'pending'
    }));

    onUpdateData(prev => ({
      ...prev,
      coreTasks: [...(prev.coreTasks || []), ...milestonesTasks]
    }));

    showToast(`تمام نقاط عطف کل مسیر (${goal.milestones.length} فاز) به لیست کارهای اصلی برنامه‌ریز تزریق شد.`);
  };

  // Helper to dynamically calculate completion status of goal tasks from the main planner if injected
  const isTaskReallyCompleted = (goal: Goal, task: GoalTask) => {
    const tag = `[هدف: ${goal.title}]`;
    const fullTitle = `${tag} ${task.title}`;

    const coreMatch = data.coreTasks?.find(t => t.title === fullTitle || (t.title.includes(tag) && t.title.includes(task.title)));
    if (coreMatch) {
      return coreMatch.status === 'completed';
    }

    const secMatch = data.secondaryTasks?.find(t => t.textFa === fullTitle || (t.textFa.includes(tag) && t.textFa.includes(task.title)));
    if (secMatch) {
      return secMatch.status === 'completed';
    }

    const remMatch = data.reminders?.find(t => t.textFa === fullTitle || (t.textFa.includes(tag) && t.textFa.includes(task.title)));
    if (remMatch) {
      return remMatch.checkedDays && remMatch.checkedDays.length > 0;
    }

    return task.completed;
  };

  // Toggle task completion within the goal and synchronize to main planner if injected
  const handleToggleTaskCompleted = (goalId: string, taskId: string) => {
    onUpdateData(prev => {
      let targetTaskText = '';
      let nextStatus = false;
      let goalTitle = '';

      const updatedGoals = (prev.goals || []).map(g => {
        if (g.goal_id === goalId) {
          goalTitle = g.title;
          const updatedTasks = g.active_week_tasks.map(t => {
            if (t.id === taskId) {
              nextStatus = !isTaskReallyCompleted(g, t);
              targetTaskText = t.title;
              return { ...t, completed: nextStatus };
            }
            return t;
          });
          return { ...g, active_week_tasks: updatedTasks };
        }
        return g;
      });

      // Synchronize completion status to main planner if injected
      let updatedCore = prev.coreTasks || [];
      let updatedSec = prev.secondaryTasks || [];
      let updatedReminders = prev.reminders || [];

      if (targetTaskText && goalTitle) {
        const fullTag = `[هدف: ${goalTitle}]`;
        const fullTitle = `${fullTag} ${targetTaskText}`;

        updatedCore = updatedCore.map(t => {
          if (t.title === fullTitle || (t.title.includes(fullTag) && t.title.includes(targetTaskText))) {
            return { ...t, status: nextStatus ? 'completed' : 'pending' };
          }
          return t;
        });

        updatedSec = updatedSec.map(t => {
          if (t.textFa === fullTitle || (t.textFa.includes(fullTag) && t.textFa.includes(targetTaskText))) {
            return { ...t, status: nextStatus ? 'completed' : 'pending' };
          }
          return t;
        });

        updatedReminders = updatedReminders.map(t => {
          if (t.textFa === fullTitle || (t.textFa.includes(fullTag) && t.textFa.includes(targetTaskText))) {
            return { ...t, checkedDays: nextStatus ? ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] : [] };
          }
          return t;
        });
      }

      return {
        ...prev,
        goals: updatedGoals,
        coreTasks: updatedCore,
        secondaryTasks: updatedSec,
        reminders: updatedReminders
      };
    });
  };

  // Update a single task (Edit) and synchronize rename/type changes to main planner if injected
  const handleSaveEditTask = (goalId: string) => {
    if (!editingTaskTitle.trim()) {
      showToast('عنوان تسک نمی‌تواند خالی باشد');
      return;
    }

    onUpdateData(prev => {
      let oldTaskTitle = '';
      let goalTitle = '';

      const updatedGoals = (prev.goals || []).map(g => {
        if (g.goal_id === goalId) {
          goalTitle = g.title;
          const updatedTasks = g.active_week_tasks.map(t => {
            if (t.id === editingTaskId) {
              oldTaskTitle = t.title;
              return { 
                ...t, 
                title: editingTaskTitle, 
                type: editingTaskType,
                goal_id: goalId
              };
            }
            return t;
          });
          return { ...g, active_week_tasks: updatedTasks };
        }
        return g;
      });

      // Synchronize rename/edit to main planner
      let updatedCore = prev.coreTasks || [];
      let updatedSec = prev.secondaryTasks || [];
      let updatedReminders = prev.reminders || [];

      if (oldTaskTitle && goalTitle) {
        const oldTag = `[هدف: ${goalTitle}]`;
        const oldFullTitle = `${oldTag} ${oldTaskTitle}`;
        const newFullTitle = `${oldTag} ${editingTaskTitle}`;

        updatedCore = updatedCore.map(t => {
          if (t.title === oldFullTitle || (t.title.includes(oldTag) && t.title.includes(oldTaskTitle))) {
            return { ...t, title: newFullTitle, description: `تولید شده برای هفته ${prev.goals.find(g => g.goal_id === goalId)?.current_week_index} از هدف: ${goalTitle}` };
          }
          return t;
        });

        updatedSec = updatedSec.map(t => {
          if (t.textFa === oldFullTitle || (t.textFa.includes(oldTag) && t.textFa.includes(oldTaskTitle))) {
            return { ...t, textFa: newFullTitle, textEn: editingTaskTitle };
          }
          return t;
        });

        updatedReminders = updatedReminders.map(t => {
          if (t.textFa === oldFullTitle || (t.textFa.includes(oldTag) && t.textFa.includes(oldTaskTitle))) {
            return { ...t, textFa: newFullTitle, textEn: editingTaskTitle };
          }
          return t;
        });
      }

      return {
        ...prev,
        goals: updatedGoals,
        coreTasks: updatedCore,
        secondaryTasks: updatedSec,
        reminders: updatedReminders
      };
    });

    showToast('تسک با موفقیت ویرایش و همگام‌سازی شد');
    setEditingTaskId(null);
  };

  // Delete a task from goal and from main planner if injected
  const handleDeleteTask = (goalId: string, taskId: string) => {
    if (window.confirm('آیا می‌خواهید این تسک را حذف کنید؟ تسک از برنامه‌ریز اصلی نیز برداشته خواهد شد.')) {
      onUpdateData(prev => {
        let taskTitle = '';
        let goalTitle = '';

        const updatedGoals = (prev.goals || []).map(g => {
          if (g.goal_id === goalId) {
            goalTitle = g.title;
            const targetTask = g.active_week_tasks.find(t => t.id === taskId);
            if (targetTask) {
              taskTitle = targetTask.title;
            }
            return {
              ...g,
              active_week_tasks: g.active_week_tasks.filter(t => t.id !== taskId)
            };
          }
          return g;
        });

        // Sync deletion to main planner
        let updatedCore = prev.coreTasks || [];
        let updatedSec = prev.secondaryTasks || [];
        let updatedReminders = prev.reminders || [];

        if (taskTitle && goalTitle) {
          const tag = `[هدف: ${goalTitle}]`;
          const fullTitle = `${tag} ${taskTitle}`;

          updatedCore = updatedCore.filter(t => t.title !== fullTitle && !(t.title.includes(tag) && t.title.includes(taskTitle)));
          updatedSec = updatedSec.filter(t => t.textFa !== fullTitle && !(t.textFa.includes(tag) && t.textFa.includes(taskTitle)));
          updatedReminders = updatedReminders.filter(t => t.textFa !== fullTitle && !(t.textFa.includes(tag) && t.textFa.includes(taskTitle)));
        }

        return {
          ...prev,
          goals: updatedGoals,
          coreTasks: updatedCore,
          secondaryTasks: updatedSec,
          reminders: updatedReminders
        };
      });
      showToast('تسک با موفقیت حذف و از برنامه‌ریز اصلی کسر شد');
    }
  };

  // Add a new manual task to goal
  const handleAddManualTask = (goalId: string) => {
    if (!newManualTaskTitle.trim()) {
      showToast('عنوان تسک را وارد کنید');
      return;
    }

    onUpdateData(prev => {
      const updatedGoals = (prev.goals || []).map(g => {
        if (g.goal_id === goalId) {
          const newTask: GoalTask = {
            id: `gt_manual_${Date.now()}`,
            title: newManualTaskTitle,
            type: newManualTaskType,
            completed: false,
            goal_id: goalId
          };
          return {
            ...g,
            active_week_tasks: [...g.active_week_tasks, newTask]
          };
        }
        return g;
      });
      return { ...prev, goals: updatedGoals };
    });

    showToast('تسک جدید به هدف اضافه شد');
    setNewManualTaskTitle('');
    setAddingTaskGoalId(null);
  };

  // Calculate real progress of goal from main weekly planner and active tasks
  const getGoalRealProgress = (goal: Goal) => {
    const tag = `[هدف: ${goal.title}]`;
    
    // Count all active week tasks
    const activeTasks = goal.active_week_tasks || [];
    const activeTotal = activeTasks.length;
    const activeCompleted = activeTasks.filter(t => isTaskReallyCompleted(goal, t)).length;

    // Check if milestones are completed (either in planner or marked in state)
    let milestoneTotal = 0;
    let milestoneCompleted = 0;
    
    if (goal.milestones) {
      goal.milestones.forEach(m => {
        const milestoneFullTitle = `${tag} فاز ${m.week_number}: ${m.title}`;
        const coreMatch = data.coreTasks?.find(t => t.title === milestoneFullTitle || (t.title.includes(tag) && t.title.includes(m.title)));
        if (coreMatch) {
          milestoneTotal++;
          if (coreMatch.status === 'completed') {
            milestoneCompleted++;
          }
        } else if (m.completed) {
          milestoneTotal++;
          milestoneCompleted++;
        }
      });
    }

    const totalCount = activeTotal + milestoneTotal;
    const completedCount = activeCompleted + milestoneCompleted;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      percent,
      injected: activeTotal > 0,
      total: totalCount,
      completed: completedCount
    };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* 1. TOP STATS AND INTRO PANEL */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-3xs flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Target className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">
              {isRtl ? 'سیستم هوشمند مدیریت و پیش‌بینی تحقق اهداف' : 'Goal Management & Achievement AI System'}
            </h2>
            <p className="text-xs text-slate-400 font-bold mt-1">
              {isRtl ? 'تلفیق دانش مدیریت علمی بهره‌وری با هوش مصنوعی مولد جمنای (Gemini 2.5 Flash)' : 'Combining scientific productivity management with Gemini 2.5 Flash AI'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-3 px-4 rounded-2xl" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="p-2 bg-indigo-100/50 text-indigo-600 rounded-xl">
            <Brain className="w-5 h-5 shrink-0" />
          </div>
          <div className={isRtl ? 'text-right' : 'text-left'}>
            <span className="text-[10px] font-black text-slate-400 block">
              {isRtl ? 'شاخص‌های ورودی هوش مصنوعی' : 'AI Input Metrics'}
            </span>
            <div className="text-xs font-black text-slate-700 flex items-center gap-1.5 mt-0.5">
              <span>{isRtl ? 'نرخ تکمیل کارها (TCR):' : 'Task Completion Rate (TCR):'}</span>
              <span dir="ltr" className="text-indigo-600 font-extrabold bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">{userStatsContext.tcr}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CREATE NEW GOAL BAR */}
      <form onSubmit={handleCreateGoal} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-3xs space-y-4">
        <h3 className="text-xs font-black text-slate-700">
          {isRtl ? 'ثبت هدف میان‌مدت جدید و تدوین مسیر هوشمند' : 'Create New Goal & AI Roadmap'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400">
              {isRtl ? 'عنوان هدف بلندپروازانه شما چیست؟' : 'What is your ambitious goal?'}
            </label>
            <input 
              type="text" 
              placeholder={isRtl ? "مثال: تسلط بر ریکت، نگارش پروپوزال، کاهش وزن..." : "e.g., Master React, Write Thesis, Fitness Goal..."}
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              className="w-full text-xs font-bold p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 focus:bg-white transition-colors"
            />
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400">
              {isRtl ? 'مدت زمان تحقق (هفته)' : 'Duration (Weeks)'}
            </label>
            <input 
              type="number" 
              min="1"
              value={newGoalWeeks}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setNewGoalWeeks(isNaN(val) ? 1 : Math.max(1, val));
              }}
              className="w-full text-xs font-bold p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 focus:bg-white transition-colors"
              placeholder={isRtl ? "مثال: ۵، ۱۲، ۲۴..." : "e.g., 4, 8, 12..."}
            />
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400">
              {isRtl ? 'تم رنگی اختصاصی' : 'Theme Color'}
            </label>
            <div className="flex gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl h-[46px] items-center justify-around">
              {themes.map(t => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelectedTheme(t.name)}
                  className={`w-6 h-6 rounded-full ${t.accent} transition-transform ${selectedTheme === t.name ? 'scale-125 ring-2 ring-slate-400 ring-offset-1' : 'opacity-60 hover:opacity-100 hover:scale-110'}`}
                  title={t.label}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isCreatingGoal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-3 rounded-xl shadow-xs transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isCreatingGoal ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isRtl ? 'در حال تحلیل هوش مصنوعی...' : 'Analyzing with AI...'}</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>{isRtl ? 'ثبت هدف و تحلیل پایداری علمی مسیر' : 'Create Goal & Analyze Feasibility'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* 3. GOALS LIST */}
      <div className="space-y-6">
        <AnimatePresence>
          {(!data.goals || data.goals.length === 0) ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-50/50 border border-dashed border-slate-200 rounded-3xl p-12 text-center"
            >
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-4">
                <Compass className="w-6 h-6" />
              </div>
              <p className="text-xs font-black text-slate-500">هیچ هدفی ثبت نشده است</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1">با فیلد بالا اولین هدف خود را اضافه کنید تا جمنای به شما نقشه راه بدهد</p>
            </motion.div>
          ) : (
            (data.goals || []).map((goal) => {
              const theme = getThemeConfig(goal.colorTheme);
              const progress = getGoalRealProgress(goal);
              
              return (
                <motion.div
                  key={goal.goal_id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:border-slate-300 transition-all"
                >
                  {/* Goal Card Header */}
                  <div className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 ${theme.bg}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black text-white ${theme.accent}`}>
                          هفته {goal.current_week_index} از {goal.total_weeks}
                        </span>
                        <h3 className="text-sm font-black text-slate-800">{goal.title}</h3>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        {goal.justification}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Feasibility score */}
                      {goal.feasibility_score !== undefined && (
                        <div className="bg-white border border-slate-150 rounded-2xl px-3 py-1.5 flex items-center gap-2 shadow-3xs">
                          <span className="text-[10px] font-black text-slate-400">امکان‌سنجی:</span>
                          <span className={`text-xs font-black ${goal.feasibility_score >= 70 ? 'text-emerald-600' : goal.feasibility_score >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                            {goal.feasibility_score}%
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => handleDeleteGoal(goal.goal_id)}
                        className="p-2 border border-slate-200 hover:border-red-200 hover:bg-red-50/50 text-slate-400 hover:text-red-600 rounded-xl transition-all cursor-pointer"
                        title="حذف هدف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Goal Card Body */}
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Left Column: ROADMAP & PROGRESS */}
                    <div className="lg:col-span-4 space-y-5 border-l border-slate-100 pl-4">
                      
                      {/* Interactive Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400">میزان تحقق کلی هدف</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-black text-slate-800">{progress.percent}%</span>
                            <span className="text-[9px] font-bold text-slate-400">
                              ({progress.completed} از {progress.total} تسک)
                            </span>
                          </div>
                        </div>

                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${theme.accent}`}
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>

                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                          <span>{progress.injected ? 'ردیابی زنده از برنامه‌ریز اصلی' : 'ردیابی تسک‌های داخلی هدف'}</span>
                          <span className={progress.injected ? 'text-emerald-600 font-black' : 'text-slate-400'}>
                            {progress.injected ? 'متصل و زنده' : 'تزریق نشده'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[9px] font-black p-1.5 px-2.5 bg-slate-50 border border-slate-150 rounded-lg">
                          <span className="text-slate-400">نرخ رشد و موفقیت فعلی:</span>
                          <span className={`${progress.percent >= 70 ? 'text-emerald-600' : progress.percent >= 40 ? 'text-amber-500' : 'text-indigo-600'}`}>
                            {progress.percent}% (پیشرفت مستمر)
                          </span>
                        </div>
                      </div>

                      {/* Milestones Path */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>نقاط عطف مسیر (Roadmap)</span>
                        </h4>

                        <div className="space-y-2 bg-slate-50/50 p-3 rounded-2xl border border-slate-150/70">
                          {goal.milestones.map((ms, index) => {
                            const isPast = ms.week_number < goal.current_week_index;
                            const isCurrent = ms.week_number === goal.current_week_index;
                            const isCompleted = ms.completed || isPast;

                            return (
                              <div key={index} className="flex items-center justify-between gap-2 text-right">
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${isCompleted ? 'bg-emerald-100 border-emerald-300 text-emerald-600' : isCurrent ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-400'}`}>
                                    {isCompleted ? <Check className="w-2.5 h-2.5" /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                                  </div>
                                  <span className={`text-[10px] font-black ${isCompleted ? 'text-slate-400 line-through' : isCurrent ? 'text-slate-800' : 'text-slate-500'}`}>
                                    فاز {ms.week_number}: {ms.title}
                                  </span>
                                </div>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${isCurrent ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-150 text-slate-500'}`}>
                                  هفته {ms.week_number}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Road Injection Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button
                          onClick={() => handleInjectWeeklyTasks(goal)}
                          className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${theme.bg}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>تزریق تسک‌های این هفته</span>
                        </button>
                        
                        <button
                          onClick={() => handleInjectEntirePath(goal)}
                          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-[10px] font-black border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-all cursor-pointer"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                          <span>تزریق کل مسیر به برنامه</span>
                        </button>
                      </div>

                    </div>

                    {/* Right Column: ACTIVE WEEK TASKS & CUSTOMIZATION */}
                    <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
                      
                      {/* Active Week Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <h4 className="text-xs font-black text-slate-700">تسک‌های عملیاتی هفته {goal.current_week_index}</h4>
                        </div>

                        {/* Complete week button */}
                        <button
                          onClick={() => handleLoadNextWeek(goal)}
                          disabled={loadingGoalId !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-[10px] rounded-xl transition-all cursor-pointer hover:-translate-y-0.5"
                        >
                          {loadingGoalId === goal.goal_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>تکمیل هفته و دریافت برنامه هفته بعد</span>
                        </button>
                      </div>

                      {/* Active week tasks list */}
                      <div className="space-y-2 flex-grow min-h-[150px]">
                        {goal.active_week_tasks.map((task) => {
                          const isEditing = editingTaskId === task.id;
                          const completed = isTaskReallyCompleted(goal, task);

                          return (
                            <div 
                              key={task.id}
                              className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${completed ? 'bg-slate-50 border-slate-150' : 'bg-white border-slate-200/80 hover:border-slate-350'}`}
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input 
                                    type="text"
                                    value={editingTaskTitle}
                                    onChange={(e) => setEditingTaskTitle(e.target.value)}
                                    className="flex-grow text-xs font-bold p-1.5 border border-slate-200 rounded-lg focus:outline-none"
                                  />
                                  <select
                                    value={editingTaskType}
                                    onChange={(e) => setEditingTaskType(e.target.value as any)}
                                    className="text-[10px] font-black p-1.5 border border-slate-200 rounded-lg cursor-pointer"
                                  >
                                    <option value="core">کار اصلی</option>
                                    <option value="secondary">کار فرعی</option>
                                    <option value="habit">عادت روزانه</option>
                                  </select>
                                  <button
                                    onClick={() => handleSaveEditTask(goal.goal_id)}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                                    title="ذخیره"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTaskId(null)}
                                    className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors cursor-pointer"
                                    title="لغو"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-3">
                                    <input 
                                      type="checkbox"
                                      checked={completed}
                                      onChange={() => handleToggleTaskCompleted(goal.goal_id, task.id)}
                                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span className={`text-xs font-bold ${completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                      {task.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* Task type badge */}
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${task.type === 'core' ? 'bg-blue-50 text-blue-700' : task.type === 'secondary' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                      {task.type === 'core' ? 'اصلی' : task.type === 'secondary' ? 'فرعی' : 'عادت'}
                                    </span>

                                    <button
                                      onClick={() => {
                                        setEditingTaskId(task.id);
                                        setEditingTaskTitle(task.title);
                                        setEditingTaskType(task.type);
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded transition-colors cursor-pointer"
                                      title="ویرایش"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteTask(goal.goal_id, task.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                      title="حذف"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Manual Add Task Form */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        {addingTaskGoalId === goal.goal_id ? (
                          <div className="flex items-center gap-2 w-full animate-in fade-in duration-150">
                            <input 
                              type="text" 
                              placeholder="عنوان تسک دستی جدید..."
                              value={newManualTaskTitle}
                              onChange={(e) => setNewManualTaskTitle(e.target.value)}
                              className="flex-grow text-xs font-bold p-2 border border-slate-200 rounded-xl focus:outline-none"
                            />
                            <select
                              value={newManualTaskType}
                              onChange={(e) => setNewManualTaskType(e.target.value as any)}
                              className="text-[10px] font-black p-2 border border-slate-200 rounded-xl cursor-pointer"
                            >
                              <option value="core">کار اصلی</option>
                              <option value="secondary">کار فرعی</option>
                              <option value="habit">عادت روزانه</option>
                            </select>
                            <button
                              onClick={() => handleAddManualTask(goal.goal_id)}
                              className="px-3 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer"
                            >
                              افزودن
                            </button>
                            <button
                              onClick={() => setAddingTaskGoalId(null)}
                              className="p-2 bg-slate-50 text-slate-500 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingTaskGoalId(goal.goal_id);
                              setNewManualTaskTitle('');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-350 bg-slate-50/50 hover:bg-slate-50 rounded-xl text-[10px] font-black text-slate-600 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>افزودن دستی تسک جدید به این هدف</span>
                          </button>
                        )}
                      </div>

                    </div>

                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
