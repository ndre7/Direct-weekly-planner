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
  Clock, 
  X, 
  Calendar, 
  Layers, 
  ArrowUpRight,
  FolderPlus,
  Palette,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react';
import { PlannerData, Goal, GoalMilestone, GoalTask, GoalPhase, GoalPhaseTask, CoreTask, SecondaryTask, ReminderItem, Category } from '../types';

interface GoalsTabProps {
  data: PlannerData;
  onUpdateData: React.Dispatch<React.SetStateAction<PlannerData>>;
  showToast: (msg: string) => void;
  lang?: 'fa' | 'en';
}

const CATEGORY_COLORS = [
  { label: 'Blue', value: 'bg-blue-100 border-blue-300 text-blue-900' },
  { label: 'Green', value: 'bg-green-100 border-green-300 text-green-900' },
  { label: 'Teal', value: 'bg-teal-100 border-teal-300 text-teal-900' },
  { label: 'Cyan', value: 'bg-cyan-100 border-cyan-300 text-cyan-900' },
  { label: 'Sky', value: 'bg-sky-100 border-sky-300 text-sky-900' },
  { label: 'Indigo', value: 'bg-indigo-100 border-indigo-300 text-indigo-900' },
  { label: 'Purple', value: 'bg-purple-100 border-purple-300 text-purple-900' },
  { label: 'Fuchsia', value: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900' },
  { label: 'Pink', value: 'bg-pink-100 border-pink-300 text-pink-900' },
  { label: 'Rose', value: 'bg-rose-100 border-rose-300 text-rose-900' },
  { label: 'Red', value: 'bg-red-100 border-red-300 text-red-900' },
  { label: 'Orange', value: 'bg-orange-100 border-orange-300 text-orange-900' },
  { label: 'Amber', value: 'bg-amber-100 border-amber-300 text-amber-900' },
  { label: 'Yellow', value: 'bg-yellow-100 border-yellow-300 text-yellow-900' },
  { label: 'Lime', value: 'bg-lime-100 border-lime-300 text-lime-900' },
  { label: 'Emerald', value: 'bg-emerald-100 border-emerald-300 text-emerald-900' },
  { label: 'Violet', value: 'bg-violet-100 border-violet-300 text-violet-900' },
  { label: 'Slate', value: 'bg-slate-100 border-slate-300 text-slate-900' },
  { label: 'Zinc', value: 'bg-zinc-100 border-zinc-300 text-zinc-900' },
  { label: 'Stone', value: 'bg-stone-100 border-stone-300 text-stone-900' },
];

export default function GoalsTab({ data, onUpdateData, showToast, lang = 'fa' }: GoalsTabProps) {
  const isRtl = lang === 'fa';
  
  // Goal Form State
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalWeeks, setNewGoalWeeks] = useState(4);
  const [selectedTheme, setSelectedTheme] = useState('indigo');
  const [newGoalCatName, setNewGoalCatName] = useState('');
  const [newGoalCatColor, setNewGoalCatColor] = useState('bg-indigo-100 border-indigo-300 text-indigo-900');
  const [newGoalCatType, setNewGoalCatType] = useState<'core' | 'secondary' | 'both'>('core');
  
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [loadingGoalId, setLoadingGoalId] = useState<string | null>(null);

  // State for confirming goal deletion
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);

  // Expanded Roadmap Phase States
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});

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

  const togglePhaseExpansion = (phaseKey: string) => {
    setExpandedPhases(prev => ({ ...prev, [phaseKey]: !prev[phaseKey] }));
  };

  // 1. REGISTER NEW GOAL AND GENERATE WITH GEMINI (gemini-3.1-pro-preview with HIGH thinking)
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) {
      showToast('لطفاً عنوان هدف را وارد کنید');
      return;
    }

    setIsCreatingGoal(true);

    try {
      const response = await fetch("/api/gemini/analyze-goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "analyze",
          title: newGoalTitle.trim(),
          totalWeeks: newGoalWeeks,
          averageTcr: userStatsContext.tcr,
          universityHours: userStatsContext.activeClassesStatus === 'فعال' ? 15 : 0
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || "ارتباط با هوش مصنوعی سرور برقرار نشد.");
      }

      const resData = await response.json();
      if (resData.success === false) {
        throw new Error(resData.error || "خطای نامشخص در تحلیل هوش مصنوعی");
      }

      // Handle Category creation / linking
      const catName = newGoalCatName.trim() || newGoalTitle.trim();
      let targetCat = data.categories.find(c => c.nameFa.toLowerCase() === catName.toLowerCase());
      
      let catId = targetCat?.id;
      let updatedCategories = [...data.categories];

      if (!targetCat) {
        catId = `cat_goal_${Date.now()}`;
        const newCat: Category = {
          id: catId,
          nameFa: catName,
          nameEn: catName,
          color: `${newGoalCatColor} hover:opacity-90`,
          type: newGoalCatType
        };
        updatedCategories.push(newCat);
      }

      const newGoalId = `goal_${Date.now()}`;

      // Extract phases & initial active week tasks
      const phases: GoalPhase[] = (resData.phases || []).map((p: any, pIdx: number) => ({
        phase_number: p.phase_number || (pIdx + 1),
        title: p.title || `فاز ${pIdx + 1}`,
        description: p.description || '',
        estimated_weeks: p.estimated_weeks || `هفته ${pIdx + 1}`,
        tasks: (p.tasks || []).map((t: any, tIdx: number) => ({
          id: `gpt_${newGoalId}_${pIdx}_${tIdx}`,
          title: t.title || 'تسک جدید',
          description: t.description || '',
          type: t.type === 'main' ? 'core' : (t.type || 'core'),
          suggested_weekday: t.suggested_weekday || 'saturday',
          deadline_note: t.deadline_note || '',
          completed: false
        }))
      }));

      // Milestones fallback / generation
      const milestones: GoalMilestone[] = phases.map(p => ({
        week_number: p.phase_number,
        title: p.title,
        completed: false
      }));

      // Week 1 active tasks from phase 1 or returned week_tasks
      const firstPhaseTasks = phases[0]?.tasks || [];
      const activeWeekTasks: GoalTask[] = firstPhaseTasks.length > 0 
        ? firstPhaseTasks.map(t => ({
            id: `gt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: t.title,
            description: t.description,
            type: t.type,
            completed: false,
            goal_id: newGoalId
          }))
        : (resData.week_tasks || []).map((t: any, idx: number) => ({
            id: `gt_${Date.now()}_${idx}`,
            title: t.title,
            description: t.description || '',
            type: t.type || 'core',
            completed: false,
            goal_id: newGoalId
          }));

      const newGoal: Goal = {
        goal_id: newGoalId,
        title: newGoalTitle.trim(),
        total_weeks: newGoalWeeks,
        ai_estimated_weeks: resData.ai_estimated_weeks || newGoalWeeks,
        current_week_index: 1,
        categoryId: catId,
        categoryName: catName,
        categoryColor: newGoalCatColor,
        feasibility_score: resData.feasibility_score || 80,
        justification: resData.justification || 'نقشه راه هدف بر اساس توانمندی شما به تفکیک فاز تولید گردید.',
        colorTheme: selectedTheme,
        milestones: milestones,
        phases: phases,
        active_week_tasks: activeWeekTasks,
        completed_tasks_count: 0
      };

      onUpdateData(prev => ({
        ...prev,
        categories: updatedCategories,
        goals: [...(prev.goals || []), newGoal]
      }));

      showToast('هدف جدید و نقشه راه جامع آن با موفقیت تولید و ذخیره شد!');
      setNewGoalTitle('');
      setNewGoalCatName('');
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'خطا در تولید نقشه راه هدف! لطفاً مجدداً تلاش کنید.');
    } finally {
      setIsCreatingGoal(false);
    }
  };

  // Delete goal
  const handleDeleteGoal = (goalId: string) => {
    onUpdateData(prev => ({
      ...prev,
      goals: (prev.goals || []).filter(g => g.goal_id !== goalId && (g as any).id !== goalId)
    }));
    showToast('هدف با موفقیت حذف شد.');
    setConfirmDeleteGoalId(null);
  };

  // Helper to ensure category exists in data.categories
  const ensureGoalCategory = (goal: Goal, currentCategories: Category[]) => {
    const catName = goal.categoryName || goal.title || 'هدف';
    let existing = currentCategories.find(c => c.id === goal.categoryId || c.nameFa.toLowerCase() === catName.toLowerCase());
    
    if (!existing) {
      const catId = goal.categoryId || `cat_goal_${Date.now()}`;
      const newCat: Category = {
        id: catId,
        nameFa: catName,
        nameEn: catName,
        color: goal.categoryColor || 'bg-indigo-100 border-indigo-300 text-indigo-900',
        type: 'core'
      };
      return { categoryId: catId, updatedCategories: [...currentCategories, newCat] };
    }
    
    return { categoryId: existing.id, updatedCategories: currentCategories };
  };

  // 1. INJECT SINGLE TASK TO WEEKLY PLANNER
  const handleInjectSingleTask = (goal: Goal, task: GoalPhaseTask, phaseNumber: number) => {
    onUpdateData(prev => {
      const { categoryId, updatedCategories } = ensureGoalCategory(goal, prev.categories || []);
      const taskTitle = task.title;
      const taskDesc = task.description || `فاز ${phaseNumber} - هدف: ${goal.title}`;

      const newCoreTasks = [...(prev.coreTasks || [])];
      const newSecTasks = [...(prev.secondaryTasks || [])];
      const newReminders = [...(prev.reminders || [])];

      if (task.type === 'core') {
        newCoreTasks.push({
          id: `ct_single_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          categoryId: categoryId,
          title: taskTitle,
          description: taskDesc,
          status: 'pending',
          deadline: task.suggested_weekday ? { weekday: task.suggested_weekday } : undefined
        });
      } else if (task.type === 'secondary') {
        newSecTasks.push({
          id: `st_single_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          columnId: prev.secondaryTaskColumns?.[0]?.id || 'learn',
          categoryId: categoryId,
          textFa: taskTitle,
          textEn: taskTitle,
          description: taskDesc,
          status: 'pending',
          deadline: task.suggested_weekday ? { weekday: task.suggested_weekday } : undefined
        });
      } else {
        newReminders.push({
          id: `rem_single_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          textFa: taskTitle,
          textEn: taskTitle,
          checkedDays: [],
          frequency: 'every_day'
        });
      }

      return {
        ...prev,
        categories: updatedCategories,
        coreTasks: newCoreTasks,
        secondaryTasks: newSecTasks,
        reminders: newReminders
      };
    });

    showToast(`تسک «${task.title}» با موفقیت به برنامه‌ریز منتقل شد.`);
  };

  // 2. INJECT TASKS OF A SPECIFIC PHASE TO WEEKLY PLANNER
  const handleInjectPhaseTasks = (goal: Goal, phase: GoalPhase) => {
    let coreInjected = 0;
    let secInjected = 0;
    let habitInjected = 0;

    onUpdateData(prev => {
      const { categoryId, updatedCategories } = ensureGoalCategory(goal, prev.categories || []);

      const newCoreTasks = [...(prev.coreTasks || [])];
      const newSecTasks = [...(prev.secondaryTasks || [])];
      const newReminders = [...(prev.reminders || [])];

      phase.tasks.forEach(task => {
        const taskTitle = task.title;
        const taskDesc = task.description || `مرتبط با فاز ${phase.phase_number} از هدف: ${goal.title}`;

        if (task.type === 'core') {
          newCoreTasks.push({
            id: `ct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            categoryId: categoryId,
            title: taskTitle,
            description: taskDesc,
            status: 'pending',
            deadline: task.suggested_weekday ? { weekday: task.suggested_weekday } : undefined
          });
          coreInjected++;
        } else if (task.type === 'secondary') {
          newSecTasks.push({
            id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            columnId: prev.secondaryTaskColumns?.[0]?.id || 'learn',
            categoryId: categoryId,
            textFa: taskTitle,
            textEn: taskTitle,
            description: taskDesc,
            status: 'pending',
            deadline: task.suggested_weekday ? { weekday: task.suggested_weekday } : undefined
          });
          secInjected++;
        } else if (task.type === 'habit') {
          newReminders.push({
            id: `rem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            textFa: taskTitle,
            textEn: taskTitle,
            checkedDays: [],
            frequency: 'every_day'
          });
          habitInjected++;
        }
      });

      return {
        ...prev,
        categories: updatedCategories,
        coreTasks: newCoreTasks,
        secondaryTasks: newSecTasks,
        reminders: newReminders
      };
    });

    showToast(`تعداد ${coreInjected + secInjected + habitInjected} تسک از فاز «${phase.title}» به برنامه‌ریز تزریق شد.`);
  };

  // 3. INJECT ENTIRE ROADMAP (ALL PHASES) AT ONCE
  const handleInjectEntireRoadmap = (goal: Goal) => {
    if (!goal.phases || goal.phases.length === 0) {
      showToast('نقشه راهی برای این هدف ثبت نشده است.');
      return;
    }

    let totalInjected = 0;

    onUpdateData(prev => {
      const { categoryId, updatedCategories } = ensureGoalCategory(goal, prev.categories || []);

      const newCoreTasks = [...(prev.coreTasks || [])];
      const newSecTasks = [...(prev.secondaryTasks || [])];
      const newReminders = [...(prev.reminders || [])];

      goal.phases!.forEach(phase => {
        phase.tasks.forEach(task => {
          const taskTitle = `[فاز ${phase.phase_number}] ${task.title}`;
          const taskDesc = task.description || `بخشی از فاز ${phase.phase_number}: ${phase.title}`;

          if (task.type === 'core') {
            newCoreTasks.push({
              id: `ct_all_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              categoryId: categoryId,
              title: taskTitle,
              description: taskDesc,
              status: 'pending'
            });
          } else if (task.type === 'secondary') {
            newSecTasks.push({
              id: `st_all_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              columnId: prev.secondaryTaskColumns?.[0]?.id || 'learn',
              categoryId: categoryId,
              textFa: taskTitle,
              textEn: task.title,
              description: taskDesc,
              status: 'pending'
            });
          } else if (task.type === 'habit') {
            newReminders.push({
              id: `rem_all_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              textFa: taskTitle,
              textEn: task.title,
              checkedDays: [],
              frequency: 'every_day'
            });
          }
          totalInjected++;
        });
      });

      return {
        ...prev,
        categories: updatedCategories,
        coreTasks: newCoreTasks,
        secondaryTasks: newSecTasks,
        reminders: newReminders
      };
    });

    showToast(`کل مسیر هدف (${totalInjected} تسک از تمام فازها) به برنامه‌ریز تزریق گردید.`);
  };

  // Helper to dynamically calculate completion status of goal tasks
  const isTaskReallyCompleted = (goal: Goal, task: GoalTask) => {
    const coreMatch = data.coreTasks?.find(t => t.title === task.title);
    if (coreMatch) {
      return coreMatch.status === 'completed';
    }

    const secMatch = data.secondaryTasks?.find(t => t.textFa === task.title);
    if (secMatch) {
      return secMatch.status === 'completed';
    }

    return task.completed;
  };

  // Toggle task completion
  const handleToggleTaskCompleted = (goalId: string, taskId: string) => {
    onUpdateData(prev => {
      let targetTaskText = '';
      let nextStatus = false;

      const updatedGoals = (prev.goals || []).map(g => {
        if (g.goal_id === goalId) {
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

      let updatedCore = prev.coreTasks || [];
      let updatedSec = prev.secondaryTasks || [];

      if (targetTaskText) {
        updatedCore = updatedCore.map(t => {
          if (t.title === targetTaskText) {
            return { ...t, status: nextStatus ? 'completed' : 'pending' };
          }
          return t;
        });

        updatedSec = updatedSec.map(t => {
          if (t.textFa === targetTaskText) {
            return { ...t, status: nextStatus ? 'completed' : 'pending' };
          }
          return t;
        });
      }

      return {
        ...prev,
        goals: updatedGoals,
        coreTasks: updatedCore,
        secondaryTasks: updatedSec
      };
    });
  };

  // Save manual task edit
  const handleSaveEditTask = (goalId: string) => {
    if (!editingTaskTitle.trim()) {
      showToast('عنوان تسک نمی‌تواند خالی باشد');
      return;
    }

    onUpdateData(prev => {
      const updatedGoals = (prev.goals || []).map(g => {
        if (g.goal_id === goalId) {
          const updatedTasks = g.active_week_tasks.map(t => {
            if (t.id === editingTaskId) {
              return { 
                ...t, 
                title: editingTaskTitle.trim(), 
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

      return { ...prev, goals: updatedGoals };
    });

    showToast('تسک با موفقیت ویرایش شد');
    setEditingTaskId(null);
  };

  // Delete a task from goal
  const handleDeleteTask = (goalId: string, taskId: string) => {
    if (window.confirm('آیا می‌خواهید این تسک را حذف کنید؟')) {
      onUpdateData(prev => {
        const updatedGoals = (prev.goals || []).map(g => {
          if (g.goal_id === goalId) {
            return {
              ...g,
              active_week_tasks: g.active_week_tasks.filter(t => t.id !== taskId)
            };
          }
          return g;
        });

        return { ...prev, goals: updatedGoals };
      });
      showToast('تسک حذف شد');
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
            title: newManualTaskTitle.trim(),
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

  // Calculate real progress of goal
  const getGoalRealProgress = (goal: Goal) => {
    const activeTasks = goal.active_week_tasks || [];
    const activeTotal = activeTasks.length;
    const activeCompleted = activeTasks.filter(t => isTaskReallyCompleted(goal, t)).length;

    let phaseTasksTotal = 0;
    let phaseTasksCompleted = 0;

    if (goal.phases) {
      goal.phases.forEach(p => {
        p.tasks.forEach(t => {
          phaseTasksTotal++;
          if (t.completed) phaseTasksCompleted++;
        });
      });
    }

    const totalCount = activeTotal + phaseTasksTotal;
    const completedCount = activeCompleted + phaseTasksCompleted;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return { percent, total: totalCount, completed: completedCount };
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
              {isRtl ? 'سیستم هوشمند مدیریت اهداف و نقشه راه (Gemini 3.1 Pro)' : 'Smart Goal & Roadmap System (Gemini 3.1 Pro)'}
            </h2>
            <p className="text-xs text-slate-400 font-bold mt-1">
              {isRtl ? 'تولید یک‌جای تمام فازها و تسک‌های عملیاتی همراه با تحلیل زمان و دسته اختصاصی' : 'Generate complete roadmap phases and detailed tasks with dedicated category'}
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

      {/* 2. ADD NEW GOAL FORM WITH CATEGORY AND COLOR SELECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-3xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Plus className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-black text-slate-800">
            {isRtl ? 'تعریف هدف جدید و دریافت نقشه راه کامل' : 'Register New Goal & Generate Full Roadmap'}
          </h3>
        </div>

        <form onSubmit={handleCreateGoal} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            
            {/* Goal Title Input */}
            <div className="md:col-span-5 space-y-1.5">
              <label className="text-xs font-black text-slate-600 block">
                {isRtl ? 'عنوان اصلی هدف:' : 'Goal Title:'}
              </label>
              <input 
                type="text" 
                value={newGoalTitle}
                onChange={(e) => {
                  setNewGoalTitle(e.target.value);
                  if (!newGoalCatName) setNewGoalCatName(e.target.value);
                }}
                placeholder={isRtl ? 'مثال: تسلط کامل بر زبان پایتون و طراحی وب' : 'e.g., Full Python & Web Dev Mastery'}
                className="w-full text-xs font-bold p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 bg-slate-50/50"
              />
            </div>

            {/* Target Duration Input (Manual Number Input) */}
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-black text-slate-600 block">
                {isRtl ? 'مدت زمان درخواستی شما (تعداد هفته):' : 'Requested Duration (Weeks):'}
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min={1}
                  max={104}
                  value={newGoalWeeks}
                  onChange={(e) => setNewGoalWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder="مثال: 6"
                  className="w-full text-xs font-bold p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 bg-slate-50/50 pl-12"
                />
                <span className="absolute left-3 text-xs font-black text-slate-400 pointer-events-none">
                  {isRtl ? 'هفته' : 'Weeks'}
                </span>
              </div>
            </div>

            {/* Goal Category Selection / Input */}
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-black text-slate-600 block">
                {isRtl ? 'نام دسته‌بندی اختصاصی هدف:' : 'Dedicated Category Name:'}
              </label>
              <div className="flex flex-col gap-1.5">
                {data.categories && data.categories.length > 0 && (
                  <select
                    value={data.categories.find(c => c.nameFa === newGoalCatName)?.id || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) return;
                      const match = data.categories.find(c => c.id === selectedId);
                      if (match) {
                        setNewGoalCatName(match.nameFa);
                        setNewGoalCatColor(match.color);
                      }
                    }}
                    className="text-[11px] font-bold p-2 bg-slate-100/80 border border-slate-200 rounded-xl focus:outline-none text-slate-700 cursor-pointer"
                  >
                    <option value="">{isRtl ? '-- انتخاب از دسته‌بندی‌های موجود --' : '-- Choose from existing categories --'}</option>
                    {data.categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nameFa}
                      </option>
                    ))}
                  </select>
                )}
                <input 
                  type="text"
                  value={newGoalCatName}
                  onChange={(e) => setNewGoalCatName(e.target.value)}
                  placeholder={isRtl ? 'یا تایپ نام دسته‌بندی جدید...' : 'or type a new category name...'}
                  className="w-full text-xs font-bold p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 bg-slate-50/50"
                />
              </div>
            </div>

          </div>

          {/* Color Palette Selector & Live Badge Preview for Goal Category */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-black text-slate-600 flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-indigo-600" />
                <span>{isRtl ? 'رنگ دسته‌بندی هدف (مشابه سیستم کارهای اصلی و فرعی):' : 'Goal Category Color:'}</span>
              </label>
              
              {/* Live Preview Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">{isRtl ? 'پیش‌نمایش نشان:' : 'Badge Preview:'}</span>
                {newGoalCatColor.startsWith('#') || newGoalCatColor.startsWith('rgb') ? (
                  <span
                    className="text-[11px] font-black px-3 py-1 rounded-xl border shadow-3xs transition-all"
                    style={{
                      backgroundColor: `${newGoalCatColor}20`,
                      borderColor: `${newGoalCatColor}80`,
                      color: newGoalCatColor
                    }}
                  >
                    {newGoalCatName.trim() || newGoalTitle.trim() || (isRtl ? 'نام دسته‌بندی' : 'Category Name')}
                  </span>
                ) : (
                  <span className={`text-[11px] font-black px-3 py-1 rounded-xl border transition-all ${newGoalCatColor}`}>
                    {newGoalCatName.trim() || newGoalTitle.trim() || (isRtl ? 'نام دسته‌بندی' : 'Category Name')}
                  </span>
                )}
              </div>
            </div>

            {/* Round Pastel Swatches */}
            <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-slate-200/80 rounded-2xl max-h-36 overflow-y-auto">
              {CATEGORY_COLORS.map(color => {
                const isSelected = newGoalCatColor === color.value;
                return (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setNewGoalCatColor(color.value)}
                    className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${color.value} ${
                      isSelected ? 'ring-2 ring-offset-2 ring-indigo-600 scale-110 shadow-3xs' : 'opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                    title={color.label}
                  />
                );
              })}
            </div>

            {/* Custom Color Picker (Hex/RGB) */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs font-bold text-slate-500">
                {isRtl ? 'یا انتخاب رنگ دلخواه (Hex/RGB):' : 'Or select custom color (Hex/RGB):'}
              </span>
              <input
                type="color"
                value={newGoalCatColor.startsWith('#') ? newGoalCatColor : '#3b82f6'}
                onChange={(e) => setNewGoalCatColor(e.target.value)}
                className="w-8 h-8 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white shadow-3xs"
              />
              <input
                type="text"
                value={newGoalCatColor}
                onChange={(e) => setNewGoalCatColor(e.target.value)}
                placeholder="#3b82f6 یا کد دلخواه"
                className="text-xs font-mono p-2 border border-slate-200 rounded-xl w-44 font-bold text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                dir="ltr"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isCreatingGoal}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs rounded-2xl shadow-sm hover:shadow transition-all cursor-pointer"
            >
              {isCreatingGoal ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isRtl ? 'هوش مصنوعی در حال تفکر و تولید نقشه راه...' : 'Thinking & Generating Roadmap...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{isRtl ? 'تولید هوشمند نقشه راه جامع هدف' : 'Generate Full Roadmap with AI'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 3. GOALS LIST & EXPANDABLE ROADMAP PHASES */}
      <div className="space-y-6">
        <AnimatePresence>
          {(!data.goals || data.goals.length === 0) ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                <Target className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-700">
                {isRtl ? 'هیچ هدفی هنوز ثبت نشده است' : 'No goals created yet'}
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {isRtl ? 'عنوان هدف جدید خود را در فرم بالا وارد کنید تا هوش مصنوعی کل فازهای نقشه راه را به همراه تسک‌های ریز برای شما تولید کند.' : 'Enter your goal above to generate a full actionable roadmap.'}
              </p>
            </div>
          ) : (
            data.goals.map((goal) => {
              const progress = getGoalRealProgress(goal);
              const category = data.categories.find(c => c.id === goal.categoryId);
              const catBg = category ? category.color : (goal.categoryColor || 'bg-indigo-100 border-indigo-300 text-indigo-900');

              return (
                <motion.div
                  key={goal.goal_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="p-6 border-b border-slate-100 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      
                      {/* Title & Category Badge */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {catBg.startsWith('#') || catBg.startsWith('rgb') ? (
                            <span
                              className="text-[10px] font-black px-2.5 py-1 rounded-xl border shadow-3xs"
                              style={{
                                backgroundColor: `${catBg}20`,
                                borderColor: `${catBg}80`,
                                color: catBg
                              }}
                            >
                              {category ? category.nameFa : (goal.categoryName || 'دسته‌بندی هدف')}
                            </span>
                          ) : (
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border ${catBg}`}>
                              {category ? category.nameFa : (goal.categoryName || 'دسته‌بندی هدف')}
                            </span>
                          )}

                          <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-xl flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>پیشنهاد کاربر: {goal.total_weeks} هفته</span>
                          </span>

                          {goal.ai_estimated_weeks && (
                            <span className="text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-xl flex items-center gap-1">
                              <Brain className="w-3 h-3" />
                              <span>تخمین هوش مصنوعی: {goal.ai_estimated_weeks} هفته</span>
                            </span>
                          )}

                          <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl flex items-center gap-1">
                            <Award className="w-3 h-3" />
                            <span>شانس موفقیت: {goal.feasibility_score}%</span>
                          </span>
                        </div>

                        <h3 className="text-base font-black text-slate-800">
                          {goal.title}
                        </h3>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleInjectEntireRoadmap(goal)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer hover:-translate-y-0.5"
                          title="انتقال یک‌جای تمام فازهای نقشه راه به برنامه‌ریز هفتگی"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          <span>انتقال یک‌جای کل فازها</span>
                        </button>

                        {confirmDeleteGoalId === goal.goal_id ? (
                          <div className="flex items-center gap-1.5 p-1.5 bg-rose-50 border border-rose-200 rounded-xl text-xs">
                            <span className="font-bold text-rose-800 text-[10px] pl-1">حذف هدف؟</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteGoal(goal.goal_id)}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] rounded-lg transition-colors cursor-pointer"
                            >
                              بله، حذف
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGoalId(null)}
                              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                            >
                              انصراف
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteGoalId(goal.goal_id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="حذف هدف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-black text-slate-500">
                        <span>پیشرفت کلی مسیر هدف</span>
                        <span className="text-indigo-600">{progress.percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                          style={{ width: `${progress.percent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* AI Coaching Analysis */}
                    {goal.justification && (
                      <div className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl text-xs text-slate-600 leading-relaxed font-medium flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-black text-slate-800 block text-[11px]">تحلیل هوشمند و مشاوره راهبردی:</span>
                          <p>{goal.justification}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ROADMAP PHASES SECTION */}
                  <div className="p-6 bg-slate-50/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        <h4 className="text-xs font-black text-slate-800">
                          نقشه راه کامل و فازهای عملیاتی ({goal.phases?.length || 0} فاز)
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">
                        تسک‌ها بر اساس فاز در حافظه برنامه ذخیره شده‌اند
                      </span>
                    </div>

                    {/* Phases Grid / Accordion */}
                    <div className="space-y-3">
                      {goal.phases && goal.phases.map((phase) => {
                        const phaseKey = `${goal.goal_id}_p_${phase.phase_number}`;
                        const isExpanded = expandedPhases[phaseKey] ?? true;

                        return (
                          <div 
                            key={phaseKey}
                            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs transition-all"
                          >
                            {/* Phase Header */}
                            <div 
                              onClick={() => togglePhaseExpansion(phaseKey)}
                              className="p-4 bg-slate-50/80 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                                  {phase.phase_number}
                                </span>
                                <div>
                                  <h5 className="text-xs font-black text-slate-800 flex items-center gap-2">
                                    <span>{phase.title}</span>
                                    {phase.estimated_weeks && (
                                      <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                                        {phase.estimated_weeks}
                                      </span>
                                    )}
                                  </h5>
                                  <p className="text-[10px] text-slate-500 font-medium mt-0.5 line-clamp-1">
                                    {phase.description}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleInjectPhaseTasks(goal, phase);
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black transition-all cursor-pointer"
                                  title="تزریق تسک‌های این فاز به برنامه‌ریز هفتگی"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>تزریق تسک‌های این فاز به برنامه‌ریز</span>
                                </button>

                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                            </div>

                            {/* Phase Tasks Body */}
                            {isExpanded && (
                              <div className="p-4 space-y-2 border-t border-slate-100">
                                <p className="text-[11px] text-slate-600 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100/50 mb-3 font-medium">
                                  {phase.description}
                                </p>

                                <div className="space-y-2">
                                  {phase.tasks.map((task, idx) => (
                                    <div 
                                      key={task.id || idx}
                                      className="p-3 bg-slate-50/50 border border-slate-200/70 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-2 text-right"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${task.type === 'core' ? 'bg-blue-100 text-blue-800' : task.type === 'secondary' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                            {task.type === 'core' ? 'اصلی' : task.type === 'secondary' ? 'فرعی' : 'عادت'}
                                          </span>
                                          <span className="text-xs font-black text-slate-800">
                                            {task.title}
                                          </span>
                                        </div>

                                        {task.description && (
                                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                            {task.description}
                                          </p>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                                        {task.deadline_note && (
                                          <span className="text-[9px] text-slate-400 font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg">
                                            مهلت: {task.deadline_note}
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleInjectSingleTask(goal, task, phase.phase_number)}
                                          className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                                          title="انتقال تکی این کار به برنامه‌ریز"
                                        >
                                          <Plus className="w-3 h-3 text-emerald-600" />
                                          <span>انتقال تکی</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
