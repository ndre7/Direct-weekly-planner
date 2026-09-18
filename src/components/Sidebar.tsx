import React, { useState, useMemo } from 'react';
import { PlannerData, User } from '../types';
import { clientRegister, clientLogin, clientGoogleLogin, clientSignOut, getAuthErrorMessage } from '../lib/auth.ts';
import { 
  X,
  User as UserIcon,
  Settings as SettingsIcon,
  CalendarDays,
  Undo2,
  Redo2,
  Calendar,
  CheckSquare,
  Sliders,
  Activity,
  TrendingUp,
  CheckCircle2,
  XCircle,
  FileText,
  BarChart3,
  BookOpen,
  ChevronLeft,
  CloudLightning,
  Lock,
  Eye,
  EyeOff,
  Mail,
  LogIn,
  UserPlus,
  RefreshCw,
  LogOut,
  ChevronRight,
  Target,
  Search,
  ArrowUpRight,
  Filter,
  Clock,
  History,
  Tag,
  Trash2,
  Hash
} from 'lucide-react';

interface SidebarProps {
  isEditMode: boolean;
  data: PlannerData;
  setData: React.Dispatch<React.SetStateAction<PlannerData>>;
  onOpenCalendarRange: () => void;
  onReset: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onExportPDF: () => void;
  onClose?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  activeTab: number;
  setActiveTab: (id: number) => void;
  showSettingsPage: boolean;
  setShowSettingsPage: (val: boolean) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  onSyncData: (user: User, customData?: PlannerData) => Promise<void>;
  onLoadData: (user: User) => Promise<PlannerData | null>;
  showToast: (msg: string) => void;
  lang: 'fa' | 'en';
  onOpenProfileModal?: () => void;
}

// Helper component to highlight search terms in results
const HighlightText: React.FC<{ text?: string; query: string }> = ({ text, query }) => {
  if (!text) return null;
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{text}</>;

  const normText = text
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/آ/g, 'ا')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا');

  const normQuery = trimmedQuery
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/آ/g, 'ا')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا');

  if (!normQuery || !normText.includes(normQuery)) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const foundIdx = normText.indexOf(normQuery, searchFrom);
    if (foundIdx === -1) {
      parts.push(text.slice(lastIdx));
      break;
    }
    if (foundIdx > lastIdx) {
      parts.push(text.slice(lastIdx, foundIdx));
    }
    const matchEnd = foundIdx + normQuery.length;
    parts.push(
      <mark
        key={`hl_${foundIdx}_${searchFrom}`}
        className="bg-amber-200/90 text-amber-950 dark:bg-amber-400 dark:text-amber-950 rounded-xs px-0.5 font-black decoration-clone"
      >
        {text.slice(foundIdx, matchEnd)}
      </mark>
    );
    lastIdx = matchEnd;
    searchFrom = matchEnd;
  }

  return <>{parts}</>;
};

export default function Sidebar({
  isEditMode,
  data,
  setData,
  onOpenCalendarRange,
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  activeTab,
  setActiveTab,
  showSettingsPage,
  setShowSettingsPage,
  currentUser,
  setCurrentUser,
  onSyncData,
  onLoadData,
  showToast,
  lang,
  onOpenProfileModal
}: SidebarProps) {
  const [sidebarMode, setSidebarMode] = useState<'main' | 'tabs'>('main');

  // Auth form states
  const [isAuthExpanded, setIsAuthExpanded] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [userInput, setUserInput] = useState<string>(''); // username for register, identifier for login
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const isRtl = lang === 'fa';

  const handleTermValueChange = (val: string) => {
    setData(prev => ({
      ...prev,
      term: val
    }));
  };

  // Helper to format date display
  const dateRangeDisplay = (() => {
    if (data.weekStartDay && data.weekEndDay) {
      const startM = data.weekMonth || (isRtl ? 'خرداد' : 'June');
      const endM = data.weekEndMonth || startM;
      const startY = data.weekYear || (isRtl ? 1405 : 2026);
      const endY = data.weekEndYear || startY;
      if (startY !== endY) {
        return isRtl 
          ? `${data.weekStartDay} ${startM} ${startY} تا ${data.weekEndDay} ${endM} ${endY}`
          : `${startM} ${data.weekStartDay}, ${startY} to ${endM} ${data.weekEndDay}, ${endY}`;
      } else if (startM !== endM) {
        return isRtl
          ? `${data.weekStartDay} ${startM} تا ${data.weekEndDay} ${endM} ${startY}`
          : `${startM} ${data.weekStartDay} to ${endM} ${data.weekEndDay}, ${startY}`;
      }
      return isRtl
        ? `${data.weekStartDay} تا ${data.weekEndDay} ${startM} ${startY}`
        : `${startM} ${data.weekStartDay} to ${data.weekEndDay}, ${startY}`;
    }
    return data.month || '---';
  })();

  // 9 tabs info bilingualized
  const tabsList = [
    { id: 1, name: isRtl ? "کلاس ها و کار های روزانه" : "Classes & Daily Tasks", icon: Calendar },
    { id: 6, name: isRtl ? "کار های اصلی" : "Core Tasks", icon: CheckSquare },
    { id: 3, name: isRtl ? "کار های فرعی" : "Secondary Tasks", icon: Sliders },
    { id: 10, name: isRtl ? "سیستم هوشمند مدیریت اهداف" : "Goal Management System", icon: Target },
    { id: 2, name: isRtl ? "ددلاین ها" : "Deadlines", icon: Activity },
    { id: 4, name: isRtl ? "یادآوری ها" : "Reminders", icon: TrendingUp },
    { id: 7, name: isRtl ? "کار های انجام شده / نشده" : "Completed / Expired", icon: CheckCircle2 },
    { id: 11, name: isRtl ? "امتحانات و ارائه‌ها" : "Exams & Presentations", icon: BookOpen },
    { id: 8, name: isRtl ? "لغو/تعویق ها" : "Cancelled / Postponed", icon: XCircle },
    { id: 5, name: isRtl ? "یادداشت ها" : "Notes", icon: FileText },
    { id: 9, name: isRtl ? "تحلیل (Analytics)" : "Analytics Dashboard", icon: BarChart3 },
  ];

  // English/Persian labels map
  const labels = {
    menuTitle: isRtl ? "منوی مدیریت سیستم" : "System Control Menu",
    closeTitle: isRtl ? "بستن" : "Close",
    syncActive: isRtl ? "همگام ابری فعال" : "Cloud Sync Active",
    syncBtn: isRtl ? "همگام‌سازی ابری" : "Sync Planner",
    logoutBtn: isRtl ? "خروج" : "Logout",
    joinCloud: isRtl ? "عضویت در حساب ابری" : "Join Cloud Account",
    joinSub: isRtl ? "کلیک کنید جهت ورود و همگام‌سازی" : "Sign in to synchronize across devices",
    loginTab: isRtl ? "ورود به حساب" : "Sign In",
    registerTab: isRtl ? "ایجاد حساب جدید" : "Register",
    usernameRegPlaceholder: isRtl ? "نام کاربری (انگلیسی)" : "Username (English letters)",
    emailPlaceholder: isRtl ? "آدرس ایمیل" : "Email address",
    usernameOrEmail: isRtl ? "نام کاربری یا ایمیل" : "Username or email",
    passwordPlaceholder: isRtl ? "کلمه عبور" : "Password",
    registerSubmit: isRtl ? "عضویت و ایجاد حساب ابری" : "Register & Sync",
    loginSubmit: isRtl ? "ورود و بارگذاری اطلاعات" : "Sign In & Load",
    dateRangeLabel: isRtl ? "بازه زمانی هفته" : "Active Week Date Range",
    prevStep: isRtl ? "مرحله قبل" : "Undo",
    nextStep: isRtl ? "مرحله بعد" : "Redo",
    sectionsLabel: isRtl ? "بخش‌های برنامه‌ریزی" : "Planner Sections",
    tabsLabel: isRtl ? "تب‌ها" : "Tabs List",
    showListLabel: isRtl ? "نمایش لیست" : "Open List",
    settingsLabel: isRtl ? "تنظیمات پیشرفته" : "System Settings",
    systemLabel: isRtl ? "سیستم" : "System",
    backMain: isRtl ? "بازگشت به منوی اصلی" : "Back to Main Menu",
    mainMenuSuffix: isRtl ? "منوی اصلی ←" : "← Main Menu"
  };

  // Search states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'tasks' | 'events' | 'deadlines' | 'notes'>('all');

  // Recent searches state initialized from localStorage
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('planner_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const saveSearchQuery = (queryToSave: string) => {
    const trimmed = queryToSave.trim();
    if (!trimmed || trimmed.length < 2) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('planner_recent_searches', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('planner_recent_searches');
    } catch (e) {
      console.error(e);
    }
  };

  const removeRecentSearch = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches(prev => {
      const updated = prev.filter(q => q !== termToRemove);
      try {
        localStorage.setItem('planner_recent_searches', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });
  };

  // Category chips
  const categoryChips = useMemo(() => {
    const defaults = isRtl
      ? [
          { label: '#دانشگاه', query: 'دانشگاه' },
          { label: '#آزاد', query: 'آزاد' },
          { label: '#شخصی', query: 'شخصی' },
          { label: '#کلاس‌ها', query: 'کلاس' },
          { label: '#ددلاین', query: 'ددلاین' },
          { label: '#کارهای_اصلی', query: 'اصلی' },
          { label: '#اهداف', query: 'هدف' },
          { label: '#یادداشت', query: 'یادداشت' },
        ]
      : [
          { label: '#University', query: 'University' },
          { label: '#Leisure', query: 'Leisure' },
          { label: '#Personal', query: 'Personal' },
          { label: '#Classes', query: 'Class' },
          { label: '#Deadlines', query: 'Deadline' },
          { label: '#CoreTasks', query: 'Core' },
          { label: '#Goals', query: 'Goal' },
          { label: '#Notes', query: 'Note' },
        ];

    if (data.categories && data.categories.length > 0) {
      data.categories.forEach(cat => {
        const name = isRtl ? cat.nameFa : cat.nameEn;
        if (name && name.trim()) {
          const formattedLabel = `#${name.trim().replace(/\s+/g, '_')}`;
          if (!defaults.some(d => d.query.toLowerCase() === name.trim().toLowerCase())) {
            defaults.push({ label: formattedLabel, query: name.trim() });
          }
        }
      });
    }

    return defaults;
  }, [data.categories, isRtl]);

  const normalizeText = (str: string) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/آ/g, 'ا')
      .replace(/أ/g, 'ا')
      .replace(/إ/g, 'ا')
      .trim();
  };

  const searchResults = useMemo(() => {
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return [];

    const normQuery = normalizeText(rawQuery);
    const results: Array<{
      id: string;
      title: string;
      subtitle?: string;
      tabId: number;
      tabName: string;
      icon: any;
      badge: string;
      badgeColor: string;
      typeCategory: 'tasks' | 'events' | 'deadlines' | 'notes';
      status?: 'completed' | 'pending' | 'failed';
      dateOrDay?: string;
    }> = [];

    const matches = (...texts: (string | undefined)[]) => {
      return texts.some(t => t && normalizeText(t).includes(normQuery));
    };

    const dayNamesFa: Record<string, string> = {
      saturday: 'شنبه',
      sunday: 'یکشنبه',
      monday: 'دوشنبه',
      tuesday: 'سه‌شنبه',
      wednesday: 'چهارشنبه',
      thursday: 'پنج‌شنبه',
      friday: 'جمعه'
    };

    const dayNamesEn: Record<string, string> = {
      saturday: 'Saturday',
      sunday: 'Sunday',
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday'
    };

    // 0. Search Navigation Tabs
    tabsList.forEach(t => {
      if (matches(t.name)) {
        results.push({
          id: `tab_nav_${t.id}`,
          title: t.name,
          subtitle: isRtl ? 'انتقال سریع به این بخش' : 'Quick navigate to section',
          tabId: t.id,
          tabName: t.name,
          icon: t.icon,
          badge: isRtl ? 'بخش' : 'Section',
          badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          typeCategory: 'events'
        });
      }
    });

    // 1. Classes & Schedule (Tab 1)
    if (data.classesSchedule) {
      data.classesSchedule.forEach(cs => {
        const dayLabel = isRtl ? (dayNamesFa[cs.dayKey] || cs.dayKey) : (dayNamesEn[cs.dayKey] || cs.dayKey);
        if (matches(cs.textFa, cs.textEn, cs.timeFa, cs.timeEn, cs.dayKey, dayLabel)) {
          results.push({
            id: `class_${cs.id}`,
            title: isRtl ? cs.textFa : (cs.textEn || cs.textFa),
            subtitle: `${dayLabel}${cs.timeFa || cs.timeEn ? ` • ${cs.timeFa || cs.timeEn}` : ''}`,
            tabId: 1,
            tabName: isRtl ? 'کلاس‌ها و برنامه‌ روزانه' : 'Classes & Daily Tasks',
            icon: Calendar,
            badge: isRtl ? 'کلاس' : 'Class',
            badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
            typeCategory: 'events',
            dateOrDay: dayLabel
          });
        }
      });
    }

    // Daily Tasks (Tab 1)
    if (data.dailyTasks) {
      Object.entries(data.dailyTasks).forEach(([dayKey, tasks]) => {
        tasks.forEach(dt => {
          const dayLabel = isRtl ? (dayNamesFa[dayKey] || dayKey) : (dayNamesEn[dayKey] || dayKey);
          const cat = data.categories?.find(c => c.id === dt.categoryId);
          const catName = cat ? (isRtl ? cat.nameFa : cat.nameEn) : '';

          if (matches(dt.textFa, dt.textEn, dt.linkTitle, catName, dayLabel, dt.completionDate)) {
            results.push({
              id: `daily_${dt.id}`,
              title: isRtl ? dt.textFa : (dt.textEn || dt.textFa),
              subtitle: `${dayLabel}${catName ? ` • ${catName}` : ''}${dt.completionDate ? ` (${dt.completionDate})` : ''}`,
              tabId: dt.status === 'completed' ? 7 : 1,
              tabName: dt.status === 'completed' 
                ? (isRtl ? 'کارهای انجام شده' : 'Completed Tasks')
                : (isRtl ? 'کارهای روزانه' : 'Daily Tasks'),
              icon: CheckSquare,
              badge: isRtl ? 'کار روزانه' : 'Daily Task',
              badgeColor: dt.status === 'completed'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200',
              typeCategory: 'tasks',
              status: dt.status,
              dateOrDay: dayLabel
            });
          }
        });
      });
    }

    // 2. Core Tasks (Tab 6)
    if (data.coreTasks) {
      data.coreTasks.forEach(ct => {
        const cat = data.categories?.find(c => c.id === ct.categoryId);
        const catName = cat ? (isRtl ? cat.nameFa : cat.nameEn) : '';
        if (matches(ct.title, ct.description, catName)) {
          results.push({
            id: `core_${ct.id}`,
            title: ct.title,
            subtitle: ct.description || catName || '',
            tabId: ct.status === 'completed' ? 7 : 6,
            tabName: isRtl ? 'کارهای اصلی' : 'Core Tasks',
            icon: CheckSquare,
            badge: isRtl ? 'کار اصلی' : 'Core Task',
            badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
            typeCategory: 'tasks',
            status: ct.status
          });
        }
      });
    }

    // 3. Secondary Tasks (Tab 3)
    if (data.secondaryTasks) {
      data.secondaryTasks.forEach(st => {
        const col = data.secondaryTaskColumns?.find(c => c.id === st.columnId);
        const colName = col ? (isRtl ? col.titleFa : col.titleEn) : '';
        if (matches(st.textFa, st.textEn, st.description, colName)) {
          results.push({
            id: `sec_${st.id}`,
            title: isRtl ? st.textFa : (st.textEn || st.textFa),
            subtitle: st.description || colName || '',
            tabId: st.status === 'completed' ? 7 : 3,
            tabName: isRtl ? 'کارهای فرعی' : 'Secondary Tasks',
            icon: Sliders,
            badge: isRtl ? 'کار فرعی' : 'Secondary Task',
            badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
            typeCategory: 'tasks',
            status: st.status
          });
        }
      });
    }

    // 4. Goals (Tab 10)
    if (data.goals) {
      data.goals.forEach(goal => {
        if (matches(goal.title, goal.justification)) {
          results.push({
            id: `goal_${goal.goal_id}`,
            title: goal.title,
            subtitle: goal.justification ? goal.justification.slice(0, 60) + '...' : (isRtl ? `دوره ${goal.total_weeks} هفته‌ای` : `${goal.total_weeks} weeks duration`),
            tabId: 10,
            tabName: isRtl ? 'مدیریت اهداف' : 'Goals System',
            icon: Target,
            badge: isRtl ? 'هدف' : 'Goal',
            badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
            typeCategory: 'tasks'
          });
        }
        goal.active_week_tasks?.forEach(gt => {
          if (matches(gt.title)) {
            results.push({
              id: `goaltask_${gt.id}`,
              title: gt.title,
              subtitle: isRtl ? `مربوط به هدف: ${goal.title}` : `Goal: ${goal.title}`,
              tabId: 10,
              tabName: isRtl ? 'مدیریت اهداف' : 'Goals System',
              icon: Target,
              badge: isRtl ? 'کار هدف' : 'Goal Task',
              badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
              typeCategory: 'tasks',
              status: gt.completed ? 'completed' : 'pending'
            });
          }
        });
        goal.milestones?.forEach((m, idx) => {
          if (matches(m.title)) {
            results.push({
              id: `goalm_${goal.goal_id}_${idx}`,
              title: m.title,
              subtitle: isRtl ? `مایلستون هفته ${m.week_number} • هدف: ${goal.title}` : `Week ${m.week_number} Milestone • Goal: ${goal.title}`,
              tabId: 10,
              tabName: isRtl ? 'مدیریت اهداف' : 'Goals System',
              icon: Target,
              badge: isRtl ? 'مایلستون' : 'Milestone',
              badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
              typeCategory: 'tasks',
              status: m.completed ? 'completed' : 'pending'
            });
          }
        });
      });
    }

    // 5. Deadlines (Tab 2)
    if (data.detailsColumns) {
      data.detailsColumns.forEach((col, colIdx) => {
        const colTitle = isRtl ? col.titleFa : col.titleEn;
        col.items?.forEach((item, itemIdx) => {
          if (matches(item.text, item.date, colTitle)) {
            results.push({
              id: `deadline_${col.id || colIdx}_${item.id || itemIdx}_${itemIdx}`,
              title: item.text,
              subtitle: `${colTitle}${item.date ? ` • ${item.date}` : ''}`,
              tabId: 2,
              tabName: isRtl ? 'ددلاین‌ها' : 'Deadlines',
              icon: Activity,
              badge: isRtl ? 'ددلاین' : 'Deadline',
              badgeColor: 'bg-red-50 text-red-700 border-red-200',
              typeCategory: 'deadlines',
              dateOrDay: item.date
            });
          }
        });
      });
    }

    // 6. Reminders (Tab 4)
    if (data.reminders) {
      data.reminders.forEach((rem, remIdx) => {
        if (matches(rem.textFa, rem.textEn)) {
          results.push({
            id: `reminder_${rem.id || remIdx}_${remIdx}`,
            title: isRtl ? rem.textFa : (rem.textEn || rem.textFa),
            subtitle: isRtl ? `روزها: ${rem.checkedDays?.length || 0} روز در هفته` : `${rem.checkedDays?.length || 0} days/week`,
            tabId: 4,
            tabName: isRtl ? 'یادآوری‌ها' : 'Reminders',
            icon: TrendingUp,
            badge: isRtl ? 'یادآوری' : 'Reminder',
            badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
            typeCategory: 'events'
          });
        }
      });
    }

    // 7. Postponed Events (Tab 8)
    if (data.postponedEvents) {
      data.postponedEvents.forEach((pe, peIdx) => {
        if (matches(pe.title, pe.description, pe.type, pe.action, pe.date, pe.newDate)) {
          results.push({
            id: `postponed_${pe.id || peIdx}_${peIdx}`,
            title: pe.title,
            subtitle: `${pe.action || ''} • ${pe.date || ''}${pe.newDate ? ` ➔ ${pe.newDate}` : ''}`,
            tabId: 8,
            tabName: isRtl ? 'لغو/تعویق ها' : 'Cancelled / Postponed',
            icon: XCircle,
            badge: pe.action || (isRtl ? 'لغوشده' : 'Cancelled'),
            badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
            typeCategory: 'events',
            dateOrDay: pe.date
          });
        }
      });
    }

    // 8. Notes, Thoughts & Todos (Tab 5)
    if (data.weeklyEvents) {
      data.weeklyEvents.forEach((we, weIdx) => {
        if (matches(we.text)) {
          results.push({
            id: `note_we_${we.id || weIdx}_${weIdx}`,
            title: we.text,
            subtitle: isRtl ? 'رویداد مهم هفته' : 'Weekly Event',
            tabId: 5,
            tabName: isRtl ? 'یادداشت‌ها' : 'Notes',
            icon: FileText,
            badge: isRtl ? 'رویداد هفته' : 'Weekly Event',
            badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
            typeCategory: 'notes'
          });
        }
      });
    }

    if (data.dailyThoughts) {
      data.dailyThoughts.forEach((dt, dtIdx) => {
        if (matches(dt.text)) {
          results.push({
            id: `note_dt_${dt.id || dtIdx}_${dtIdx}`,
            title: dt.text,
            subtitle: isRtl ? 'اندیشه و ایده روزانه' : 'Daily Thought',
            tabId: 5,
            tabName: isRtl ? 'یادداشت‌ها' : 'Notes',
            icon: FileText,
            badge: isRtl ? 'اندیشه روز' : 'Daily Thought',
            badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            typeCategory: 'notes'
          });
        }
      });
    }

    if (data.todoList) {
      data.todoList.forEach((td, tdIdx) => {
        if (matches(td.text)) {
          results.push({
            id: `todo_${td.id || tdIdx}_${tdIdx}`,
            title: td.text,
            subtitle: isRtl ? 'چک‌لیست سریع' : 'Quick Todo',
            tabId: 5,
            tabName: isRtl ? 'یادداشت‌ها و چک‌لیست' : 'Notes & Todo',
            icon: FileText,
            badge: isRtl ? 'چک‌لیست' : 'Todo',
            badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
            typeCategory: 'notes',
            status: td.completed ? 'completed' : 'pending'
          });
        }
      });
    }

    if (data.notes && matches(data.notes)) {
      results.push({
        id: `general_notes`,
        title: data.notes.slice(0, 90) + (data.notes.length > 90 ? '...' : ''),
        subtitle: isRtl ? 'متن یادداشت کلی هفته' : 'General Weekly Notes',
        tabId: 5,
        tabName: isRtl ? 'یادداشت‌ها' : 'Notes',
        icon: FileText,
        badge: isRtl ? 'یادداشت کلی' : 'General Note',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        typeCategory: 'notes'
      });
    }

    // Deduplicate result IDs to guarantee React key uniqueness
    const seenResultIds = new Set<string>();
    const finalResults: typeof results = [];
    results.forEach((resItem, idx) => {
      let uniqueId = resItem.id;
      if (seenResultIds.has(uniqueId)) {
        uniqueId = `${uniqueId}_${idx}`;
      }
      seenResultIds.add(uniqueId);
      finalResults.push({ ...resItem, id: uniqueId });
    });

    return finalResults;
  }, [searchQuery, data, isRtl]);

  const categoryCounts = useMemo(() => {
    return {
      all: searchResults.length,
      tasks: searchResults.filter(r => r.typeCategory === 'tasks').length,
      events: searchResults.filter(r => r.typeCategory === 'events').length,
      deadlines: searchResults.filter(r => r.typeCategory === 'deadlines').length,
      notes: searchResults.filter(r => r.typeCategory === 'notes').length,
    };
  }, [searchResults]);

  const filteredSearchResults = useMemo(() => {
    if (searchFilter === 'all') return searchResults;
    return searchResults.filter(r => r.typeCategory === searchFilter);
  }, [searchResults, searchFilter]);

  // Modern soft card styling matching the rest of the application
  const cardClass = "bg-white rounded-2xl border border-slate-200/85 p-4 shadow-3xs flex flex-col gap-1 transition-all hover:border-slate-300 hover:shadow-2xs";
  const btnStyle = "flex-1 border border-slate-200 hover:bg-slate-50 bg-white rounded-xl py-2 px-3 flex items-center justify-center gap-1.5 font-bold text-xs shadow-3xs transition-all active:scale-95 text-slate-700 hover:text-slate-900 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  const handleSelectTab = (id: number) => {
    setActiveTab(id);
    setShowSettingsPage(false);
    setSidebarMode('main');
    if (onClose) onClose();
  };

  const handleSelectSettings = () => {
    setShowSettingsPage(true);
    if (onClose) onClose();
  };

  // Auth Actions
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      if (authMode === 'register') {
        const loggedInUser = await clientRegister(emailInput, userInput, passwordInput);
        setCurrentUser(loggedInUser);
        localStorage.setItem('planner_user', JSON.stringify(loggedInUser));
        showToast(isRtl ? 'حساب کاربری ابری شما با موفقیت ساخته شد و وارد شدید!' : 'Cloud account created and signed in successfully!');
        
        // Auto-sync initial data
        await onSyncData(loggedInUser, data);
        setIsAuthExpanded(false);
      } else {
        const loggedInUser = await clientLogin(userInput, passwordInput);
        setCurrentUser(loggedInUser);
        localStorage.setItem('planner_user', JSON.stringify(loggedInUser));
        showToast(isRtl ? 'خوش آمدید! با موفقیت وارد حساب ابری خود شدید.' : 'Welcome back! Signed in to cloud successfully.');

        // Try load cloud data or offer sync
        const cloudData = await onLoadData(loggedInUser);
        if (cloudData) {
          const cloudConfirmMsg = isRtl 
            ? 'اطلاعات همگام‌سازی شده ابری شما پیدا شد. آیا می‌خواهید اطلاعات فعلی برنامه با نسخه ابری جایگزین شود؟'
            : 'Your synchronized cloud backup was found. Do you want to load and replace your current local planner with the cloud version?';

          if (window.confirm(cloudConfirmMsg)) {
            setData(cloudData);
            showToast(isRtl ? 'اطلاعات ابری با موفقیت بارگیری و جایگزین شد.' : 'Cloud data loaded and restored.');
          } else {
            // Keep local and sync to cloud
            await onSyncData(loggedInUser, data);
            showToast(isRtl ? 'داده‌های محلی فعلی شما روی حساب ابری ثبت شد.' : 'Local planner data backed up to the cloud.');
          }
        } else {
          // No cloud data, upload local data
          await onSyncData(loggedInUser, data);
        }
        setIsAuthExpanded(false);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(getAuthErrorMessage(err, isRtl));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const logoutMsg = isRtl 
      ? 'آیا مطمئن هستید که می‌خواهید از حساب ابری خود خارج شوید؟ داده‌های محلی شما باقی خواهند ماند.'
      : 'Are you sure you want to sign out? Your offline data will remain safe.';

    if (window.confirm(logoutMsg)) {
      try {
        await clientSignOut();
      } catch (err) {
        console.error("Firebase signOut error:", err);
      }
      setCurrentUser(null);
      localStorage.removeItem('planner_user');
      showToast(isRtl ? 'با موفقیت از حساب کاربری خود خارج شدید.' : 'Signed out of cloud account successfully.');
    }
  };

  const handleSyncClick = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      await onSyncData(currentUser, data);
      showToast(isRtl ? 'برنامه هفتگی شما با موفقیت روی سرور ابری همگام‌سازی شد!' : 'Weekly planner synced to cloud successfully!');
    } catch (err) {
      showToast(isRtl ? 'خطا در همگام‌سازی اطلاعات با سرور ابری!' : 'Error synchronizing with cloud server!');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <aside 
      className="w-full h-full bg-slate-50/30 p-5 flex flex-col gap-5 overflow-y-auto select-none border-l border-slate-100" 
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      
      {/* HEADER SECTION WITH CLOSE BUTTON */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-150">
        <span className="font-black text-slate-800 text-sm">{labels.menuTitle}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-slate-200 hover:bg-slate-100 bg-white flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all shadow-3xs active:scale-95 cursor-pointer"
            title={labels.closeTitle}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* SEARCH INPUT BAR & CATEGORY CHIPS */}
      <div className="flex flex-col gap-2 w-full">
        <div className="relative flex items-center w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveSearchQuery(searchQuery);
              }
            }}
            placeholder={isRtl ? 'جستجو در کارها، کلاس‌ها، یادداشت‌ها...' : 'Search tasks, events, notes...'}
            className={`w-full py-2.5 px-3 bg-white border border-slate-200/90 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-3xs ${
              isRtl ? 'pr-9 pl-8' : 'pl-9 pr-8'
            }`}
          />
          <Search className={`w-4 h-4 text-slate-400 absolute ${isRtl ? 'right-3' : 'left-3'} pointer-events-none`} />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={`absolute ${isRtl ? 'left-2.5' : 'right-2.5'} w-5 h-5 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer`}
              title={isRtl ? 'پاک کردن جستجو' : 'Clear search'}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Chips Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px]">
          <span className="text-slate-400 shrink-0 font-bold flex items-center gap-0.5">
            <Tag className="w-3 h-3 text-slate-400" />
          </span>
          {categoryChips.map((chip) => {
            const isActive = searchQuery.trim().toLowerCase() === chip.query.toLowerCase();
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  if (isActive) {
                    setSearchQuery('');
                  } else {
                    setSearchQuery(chip.query);
                    saveSearchQuery(chip.query);
                  }
                }}
                className={`px-2.5 py-1 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 border ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-3xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RECENT SEARCHES SECTION (WHEN SEARCH INPUT IS EMPTY) */}
      {searchQuery.trim().length === 0 && recentSearches.length > 0 && (
        <div className="bg-slate-100/70 rounded-2xl border border-slate-200/80 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-black text-slate-500">
            <div className="flex items-center gap-1.5 text-slate-600">
              <History className="w-3.5 h-3.5 text-indigo-500" />
              <span>{isRtl ? 'جستجوهای اخیر' : 'Recent Searches'}</span>
            </div>
            <button
              onClick={clearRecentSearches}
              className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors cursor-pointer"
              title={isRtl ? 'پاک کردن تاریخچه' : 'Clear history'}
            >
              <Trash2 className="w-3 h-3" />
              <span>{isRtl ? 'پاک کردن' : 'Clear'}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {recentSearches.map((term) => (
              <div
                key={term}
                onClick={() => {
                  setSearchQuery(term);
                  saveSearchQuery(term);
                }}
                className="group flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl text-[10px] font-bold text-slate-700 hover:text-indigo-700 transition-all cursor-pointer shadow-3xs"
              >
                <Clock className="w-2.5 h-2.5 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                <span>{term}</span>
                <button
                  onClick={(e) => removeRecentSearch(term, e)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors ml-0.5"
                  title={isRtl ? 'حذف' : 'Remove'}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SEARCH RESULTS OR NORMAL SIDEBAR CONTENT */}
      {searchQuery.trim().length > 0 ? (
        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header count */}
          <div className="flex items-center justify-between text-xs font-black text-slate-500 pb-1 border-b border-slate-150">
            <span>{isRtl ? 'نتایج جستجو' : 'Search Results'}</span>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {searchResults.length}
            </span>
          </div>

          {/* Filter categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px]">
            <button
              type="button"
              onClick={() => setSearchFilter('all')}
              className={`px-2.5 py-1 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                searchFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-3xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isRtl ? 'همه' : 'All'} ({categoryCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setSearchFilter('tasks')}
              className={`px-2.5 py-1 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                searchFilter === 'tasks'
                  ? 'bg-indigo-600 text-white shadow-3xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isRtl ? 'کارها' : 'Tasks'} ({categoryCounts.tasks})
            </button>
            <button
              type="button"
              onClick={() => setSearchFilter('events')}
              className={`px-2.5 py-1 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                searchFilter === 'events'
                  ? 'bg-blue-600 text-white shadow-3xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isRtl ? 'کلاس و رویداد' : 'Events'} ({categoryCounts.events})
            </button>
            <button
              type="button"
              onClick={() => setSearchFilter('deadlines')}
              className={`px-2.5 py-1 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                searchFilter === 'deadlines'
                  ? 'bg-red-600 text-white shadow-3xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isRtl ? 'ددلاین‌ها' : 'Deadlines'} ({categoryCounts.deadlines})
            </button>
            <button
              type="button"
              onClick={() => setSearchFilter('notes')}
              className={`px-2.5 py-1 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                searchFilter === 'notes'
                  ? 'bg-teal-600 text-white shadow-3xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {isRtl ? 'یادداشت‌ها' : 'Notes'} ({categoryCounts.notes})
            </button>
          </div>

          {/* Results List */}
          {filteredSearchResults.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5">
              {filteredSearchResults.map((item) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      saveSearchQuery(searchQuery);
                      handleSelectTab(item.tabId);
                      showToast(isRtl ? `انتقال به ${item.tabName}` : `Navigated to ${item.tabName}`);
                    }}
                    className="group bg-white rounded-2xl border border-slate-200/90 p-3 shadow-3xs hover:shadow-2xs hover:border-indigo-300 transition-all cursor-pointer flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                        {item.status && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                              item.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.status === 'completed'
                              ? isRtl
                                ? 'تکمیل شده'
                                : 'Completed'
                              : isRtl
                              ? 'در حال انجام'
                              : 'Pending'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">
                        <span>{item.tabName}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </div>
                    </div>

                    <div className="flex items-start gap-2 pt-0.5">
                      <div className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                        <IconComponent className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 transition-colors" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-bold text-xs text-slate-800 group-hover:text-indigo-950 transition-colors line-clamp-2 leading-snug">
                          <HighlightText text={item.title} query={searchQuery} />
                        </span>
                        {item.subtitle && (
                          <span className="text-[10px] font-medium text-slate-400 line-clamp-1 mt-0.5">
                            <HighlightText text={item.subtitle} query={searchQuery} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/85 p-6 shadow-3xs flex flex-col items-center justify-center text-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <span className="font-black text-xs text-slate-700">
                {isRtl ? 'نتیجه‌ای یافت نشد' : 'No results found'}
              </span>
              <span className="text-[10px] text-slate-400 font-bold leading-relaxed">
                {isRtl
                  ? 'عبارت دیگری را جستجو کنید یا فیلتر دسته‌بندی را تغییر دهید.'
                  : 'Try searching with different terms or select another category filter.'}
              </span>
            </div>
          )}

          {/* RECENT SEARCHES FOOTER (WHEN SEARCHING) */}
          {recentSearches.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200/60 bg-slate-50/80 rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10px] font-black text-slate-500">
                <div className="flex items-center gap-1 text-slate-600">
                  <History className="w-3 h-3 text-indigo-500" />
                  <span>{isRtl ? 'جستجوهای اخیر' : 'Recent Searches'}</span>
                </div>
                <button
                  onClick={clearRecentSearches}
                  className="text-[9px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-0.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>{isRtl ? 'پاک کردن' : 'Clear'}</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setSearchQuery(term);
                      saveSearchQuery(term);
                    }}
                    className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[9px] font-bold text-slate-600 hover:text-indigo-700 transition-all cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : sidebarMode === 'main' ? (
        <div className="flex flex-col gap-4">
          
          {/* Cloud Account Sync Area */}
          <div className="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-3xs flex flex-col gap-3">
            {currentUser ? (
              /* User is logged in */
              <div className="space-y-3">
                <div 
                  onClick={onOpenProfileModal}
                  className="flex items-center justify-between gap-2 p-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                  title={isRtl ? "ویرایش پروفایل کاربری" : "Edit User Profile"}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shadow-3xs overflow-hidden shrink-0">
                      {currentUser.avatar ? (
                        <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className={`flex flex-col min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                      <span className="font-black text-xs text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{currentUser.username}</span>
                      <span className="text-[9px] font-mono font-bold text-slate-400 truncate">{currentUser.email}</span>
                    </div>
                  </div>
                  <span className="text-[8px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap shrink-0">
                    {labels.syncActive}
                  </span>
                </div>

                <div className="flex gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={handleSyncClick}
                    disabled={isSyncing}
                    className="flex-1 py-1.5 px-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-400 font-black text-[10px] rounded-lg border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{labels.syncBtn}</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="py-1.5 px-2 border border-slate-200 hover:bg-red-50 dark:hover:bg-red-950/35 text-slate-500 hover:text-red-600 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                    title={labels.logoutBtn}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              /* User is logged out */
              <div className="space-y-2">
                <div 
                  onClick={() => setIsAuthExpanded(!isAuthExpanded)}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 shadow-3xs transition-all">
                      <UserIcon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                      <span className="font-black text-xs text-slate-700 group-hover:text-slate-900 transition-colors">{labels.joinCloud}</span>
                      <span className="text-[9px] text-slate-400 font-bold">{labels.joinSub}</span>
                    </div>
                  </div>
                  <CloudLightning className="w-4 h-4 text-amber-500 animate-pulse" />
                </div>

                {isAuthExpanded && (
                  <form onSubmit={handleAuthSubmit} className="pt-2 border-t border-slate-100 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Mode Selector */}
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('login'); setAuthError(null); }}
                        className={`py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${ authMode === 'login' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {labels.loginTab}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('register'); setAuthError(null); }}
                        className={`py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${ authMode === 'register' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {labels.registerTab}
                      </button>
                    </div>

                    {authError && (
                      <p className="text-[9px] font-bold text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/60 p-1.5 rounded-lg leading-relaxed text-right">
                        ⚠️ {authError}
                      </p>
                    )}

                    {/* Inputs */}
                    <div className="space-y-1.5">
                      {authMode === 'register' && (
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder={labels.usernameRegPlaceholder}
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            required
                            className={`w-full text-[10px] p-2 border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${ isRtl ? 'pr-7' : 'pl-7'}`}
                          />
                          <UserIcon className={`w-3.5 h-3.5 text-slate-400 absolute ${isRtl ? 'right-2' : 'left-2'}`} />
                        </div>
                      )}

                      {authMode === 'register' ? (
                        <div className="relative flex items-center">
                          <input
                            type="email"
                            placeholder={labels.emailPlaceholder}
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            required
                            className={`w-full text-[10px] p-2 border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${ isRtl ? 'pr-7' : 'pl-7'}`}
                          />
                          <Mail className={`w-3.5 h-3.5 text-slate-400 absolute ${isRtl ? 'right-2' : 'left-2'}`} />
                        </div>
                      ) : (
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder={labels.usernameOrEmail}
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            required
                            className={`w-full text-[10px] p-2 border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${ isRtl ? 'pr-7' : 'pl-7'}`}
                          />
                          <Mail className={`w-3.5 h-3.5 text-slate-400 absolute ${isRtl ? 'right-2' : 'left-2'}`} />
                        </div>
                      )}

                      <div className="relative flex items-center">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={labels.passwordPlaceholder}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          required
                          className={`w-full text-[10px] p-2 border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${ isRtl ? 'pr-7 pl-7' : 'pl-7 pr-7'}`}
                        />
                        <Lock className={`w-3.5 h-3.5 text-slate-400 absolute ${isRtl ? 'right-2' : 'left-2'}`} />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className={`absolute ${isRtl ? 'left-2' : 'right-2'} text-slate-400 hover:text-slate-600 focus:outline-none`}
                          title={showPassword ? (isRtl ? "مخفی کردن رمز" : "Hide password") : (isRtl ? "نمایش رمز" : "Show password")}
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isAuthLoading}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-3xs active:scale-95"
                    >
                      {authMode === 'register' ? <UserPlus className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
                      <span>{authMode === 'register' ? labels.registerSubmit : labels.loginSubmit}</span>
                    </button>

                    <div className="flex items-center my-1">
                      <div className="flex-1 border-t border-slate-200" />
                      <span className="px-2 text-[9px] text-slate-400 font-bold">{isRtl ? 'یا' : 'or'}</span>
                      <div className="flex-1 border-t border-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setAuthError(null);
                        setIsAuthLoading(true);
                        try {
                          const loggedInUser = await clientGoogleLogin();
                          setCurrentUser(loggedInUser);
                          localStorage.setItem('planner_user', JSON.stringify(loggedInUser));
                          showToast(isRtl ? 'ورود با گوگل با موفقیت انجام شد!' : 'Signed in with Google successfully!');
                          const cloudData = await onLoadData(loggedInUser);
                          if (cloudData) {
                            setData(cloudData);
                            localStorage.setItem('planner_data', JSON.stringify(cloudData));
                            showToast(isRtl ? 'اطلاعات برنامه‌ریزی شما بارگذاری شد!' : 'Your planner data was loaded successfully!');
                          }
                          setIsAuthExpanded(false);
                        } catch (err: any) {
                          console.error(err);
                          setAuthError(err.message || 'ورود با گوگل ناموفق بود');
                        } finally {
                          setIsAuthLoading(false);
                        }
                      }}
                      disabled={isAuthLoading}
                      className="w-full py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-black text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-3xs active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3.6 4.6 1.7l2.4-2.4C17.3 1.7 14.9 1 12.24 1A10 10 0 0 0 2.24 11a10 10 0 0 0 10 10c5.5 0 10-4.5 10-10c0-.685-.06-1.352-.16-2H12.24z"/>
                      </svg>
                      <span>{isRtl ? 'ورود با حساب گوگل' : 'Sign in with Google'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Date Range & Calendar Trigger */}
          <div 
            onClick={onOpenCalendarRange}
            className={cardClass + " cursor-pointer"}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-black text-[10px] text-slate-400">{labels.dateRangeLabel}</span>
              <CalendarDays className="w-4 h-4 text-blue-600" />
            </div>
            <span className={`text-xs font-black text-slate-700 leading-relaxed mt-1 ${isRtl ? 'text-right' : 'text-left'}`}>
              {dateRangeDisplay}
            </span>
          </div>


          {/* History Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={btnStyle}
              title={labels.prevStep}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{labels.prevStep}</span>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={btnStyle}
              title={labels.nextStep}
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>{labels.nextStep}</span>
            </button>
          </div>

          {/* Tabs Button */}
          <div className="flex flex-col gap-1.5 mt-2">
            <span className={`font-black text-[10px] text-slate-400 mb-1 ${isRtl ? 'text-right pr-2' : 'text-left pl-2'}`}>{labels.sectionsLabel}</span>
            
            <button
              onClick={() => setSidebarMode('tabs')}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 text-slate-700 bg-white hover:text-slate-900 hover:border-slate-350 hover:bg-slate-50 font-bold text-xs transition-all duration-200 cursor-pointer shadow-3xs"
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span className="font-black">{labels.tabsLabel}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="text-[10px] font-bold">{labels.showListLabel}</span>
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            </button>

            {/* Settings Tab / Card */}
            <button
              onClick={handleSelectSettings}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl border font-bold text-xs transition-all duration-200 mt-2 cursor-pointer ${ showSettingsPage ? 'bg-slate-800 border-slate-800 dark:bg-indigo-950 dark:border-indigo-900 text-white shadow-2xs' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-2.5">
                <SettingsIcon className={`w-4 h-4 ${showSettingsPage ? 'text-white animate-spin-slow' : 'text-slate-400'}`} />
                <span className="font-black">{labels.settingsLabel}</span>
              </div>
              {showSettingsPage ? (
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
              ) : (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">{labels.systemLabel}</span>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* --- SUB-VIEW: SELECT TAB (All other options slide away) --- */
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-3 duration-150">
          
          <button
            onClick={() => setSidebarMode('main')}
            className="w-full flex items-center justify-between p-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 text-indigo-700 font-bold text-xs hover:bg-indigo-50 transition-all cursor-pointer"
          >
            <span className="font-black">{labels.backMain}</span>
            <span className="text-[10px] font-mono font-bold text-indigo-500">{labels.mainMenuSuffix}</span>
          </button>

          <div className="flex flex-col gap-1.5 mt-2">
            <span className={`font-black text-[10px] text-slate-400 mb-1 ${isRtl ? 'text-right pr-2' : 'text-left pl-2'}`}>{labels.backMain}</span>
            
            {tabsList.map((tab) => {
              const IconComp = tab.icon;
              const isSelected = activeTab === tab.id && !showSettingsPage;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border font-bold text-xs transition-all duration-200 cursor-pointer ${ isSelected ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-400 shadow-3xs' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComp className={`w-4 h-4 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span>{tab.name}</span>
                  </div>
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

        </div>
      )}

    </aside>
  );
}
