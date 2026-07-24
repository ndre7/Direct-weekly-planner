export type Language = 'fa' | 'en';

export interface Category {
  id: string;
  nameFa: string;
  nameEn: string;
  color: string; // Tailwind class background (e.g. 'bg-emerald-500')
  textClass?: string; // Text color (e.g. 'text-white' or 'text-emerald-950')
  borderClass?: string;
  type?: 'core' | 'secondary' | 'both'; // Core, Secondary or Both types of tasks
  order?: number; // Position order for list rendering
}

export interface ClassSlot {
  id: string;
  row: number; // 1, 2, 3, 4
  dayKey: string; // 'saturday' | 'sunday' | ...
  textFa: string;
  textEn: string;
  timeFa: string;
  timeEn: string;
  categoryId?: string;
}

export interface DailyTask {
  id: string;
  textFa: string;
  textEn: string;
  categoryId: string; // e.g. 'sport', 'university', 'programming', 'language'
  status: 'pending' | 'completed' | 'failed';
  completionDate?: string; // Persian date of completion, e.g., "1405/03/05"
  link?: string;
  linkTitle?: string;
}

export interface NoteItem {
  id: string;
  text: string;
  completed: boolean;
  weekday?: string; // e.g., 'saturday' | 'sunday' | ...
}

export interface TextPair {
  fa: string;
  en: string;
}

export interface DetailsItem {
  id: string;
  text: string;
  date?: string; // deadline date, e.g. "1405/03/12"
  completed?: boolean;
  type?: string; // 'امتحان' | 'ارائه' | 'کوئیز' | etc.
  description?: string;
  categoryId?: string;
  emailReminder?: boolean;
  reminderOffset?: '1week' | '3days' | '1day' | '6hours' | '1hour';
  reminderSent?: boolean;
  deadline?: {
    day?: number;
    month?: string;
    weekday?: string;
    time?: string;
  };
}

export interface DetailsColumn {
  id: string;
  titleFa: string;
  titleEn: string;
  color?: string;
  items: DetailsItem[]; // List of custom objects instead of strings
}

export interface SecondaryTaskColumn {
  id: string;
  titleFa: string;
  titleEn: string;
  color?: string;
}

export interface SecondaryTask {
  id: string;
  columnId: string; // e.g. 'daily', 'learn', 'english', 'skill', 'reading', 'migration', 'leisure'
  categoryId?: string;
  textFa: string;
  textEn: string;
  status: 'pending' | 'completed' | 'failed'; // failed means past due / could not be rescheduled
  completionDate?: string; // Persian date of completion
  link?: string;
  linkTitle?: string;
  description?: string;
  emailReminder?: boolean;
  reminderOffset?: '1week' | '3days' | '1day' | '6hours' | '1hour';
  reminderSent?: boolean;
  deadline?: {
    day?: number;
    month?: string;
    weekday?: string;
    time?: string;
  };
}

export type ReminderFrequency =
  | 'every_day'       // هر روز
  | 'every_other_day' // یک روز در میان
  | 'even_days'       // روزهای زوج
  | 'odd_days'        // روزهای فرد
  | 'times_per_week'  // چند بار در هفته
  | 'times_per_month' // چند بار در ماه
  | 'weekly'          // هر هفته
  | 'every_10_days'   // هر ۱۰ روز
  | 'every_2_weeks'   // هر دو هفته
  | 'every_15_days'   // هر ۱۵ روز
  | 'every_20_days'   // هر ۲۰ روز
  | 'monthly';        // هر یک ماه

export interface ReminderItem {
  id: string;
  textFa: string;
  textEn: string;
  checkedDays: string[]; // ['saturday', 'sunday', ...]
  targetCount?: number;
  dayProgress?: { [dayKey: string]: number };
  frequency?: ReminderFrequency;
  time?: string;
  date?: string;
  emailReminder?: boolean;
  reminderOffset?: '1week' | '3days' | '1day' | '6hours' | '1hour';
  reminderSent?: boolean;
}

export interface CoreTask {
  id: string;
  categoryId: string; // references Category.id
  title: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  link?: string;
  linkTitle?: string;
  emailReminder?: boolean;
  reminderOffset?: '1week' | '3days' | '1day' | '6hours' | '1hour';
  reminderSent?: boolean;
  deadline?: {
    day?: number;
    month?: string;
    weekday?: string;
    time?: string;
  };
}

export interface PostponedEvent {
  id: string;
  title: string;
  type: string;        // e.g. "کلاس" | "امتحان" | "ارائه" | "سایر"
  action: string;      // e.g. "لغو شده" | "به تعویق افتاده"
  date: string;        // e.g. "1405/03/10"
  newDate?: string;    // e.g. "1405/03/17" (if postponed)
  description?: string;
}

export interface PlannerData {
  month: string; // e.g. "خرداد 1405"
  term: string; // e.g. "ترم دانشگاه : 6"
  activeClassesOnly: boolean; // "کلاس ها فعال"
  quoteText: string;
  quoteAuthor: string;
  categories: Category[];
  classesSchedule: ClassSlot[];
  dailyTasks: { [dayKey: string]: DailyTask[] };
  detailsColumns: DetailsColumn[];
  secondaryTaskColumns: SecondaryTaskColumn[];
  secondaryTasks: SecondaryTask[];
  reminders: ReminderItem[];
  coreTasks?: CoreTask[];
  notes: string;
  weeklyEvents?: NoteItem[];
  dailyThoughts?: NoteItem[];
  todoList: NoteItem[];
  // Calendar range parameters (hotel/flight booking range style)
  weekStartDay?: number; // 1 to 31
  weekEndDay?: number;   // 1 to 31
  weekYear?: number;     // e.g. 1405
  weekEndYear?: number;  // e.g. 1406
  weekMonth?: string;    // e.g. "خرداد"
  weekEndMonth?: string;  // e.g. "تیر" (if range spans across consecutive months)
  // Dynamic class rows
  classRows?: number;
  dailyTaskRows?: number;
  // Dynamic statuses
  classStatusList?: string[];
  activeClassStatus?: string;
  // Customizable section titles
  classesTitle?: string;
  dailyTasksTitle?: string;
  detailsTitle?: string;
  secondaryTitle?: string;
  remindersTitle?: string;
  notesTitle?: string;
  todoTitle?: string;
  coreTasksTitle?: string;
  examsAndPresentationsTitle?: string;
  examColumns?: DetailsColumn[];
  emailRemindersGlobalEnabled?: boolean;
  emailReminderDefaultOffset?: '1week' | '3days' | '1day' | '6hours' | '1hour';
  reminderEmailTargetType?: 'user' | 'custom';
  reminderCustomEmail?: string;
  activeDayKeys?: string[];
  postponedEvents?: PostponedEvent[];
  goals?: Goal[];
}

export interface GoalMilestone {
  week_number: number;
  title: string;
  completed: boolean;
}

export interface GoalTask {
  id: string;
  title: string;
  description?: string;
  type: 'core' | 'secondary' | 'habit';
  completed: boolean;
  goal_id?: string;
}

export interface GoalPhaseTask {
  id?: string;
  title: string;
  description?: string;
  type: 'core' | 'secondary' | 'habit';
  suggested_weekday?: string;
  deadline_note?: string;
  completed?: boolean;
}

export interface GoalPhase {
  phase_number: number;
  title: string;
  description: string;
  estimated_weeks?: string;
  tasks: GoalPhaseTask[];
  completed?: boolean;
}

export interface Goal {
  goal_id: string;
  title: string;
  total_weeks: number;
  ai_estimated_weeks?: number;
  current_week_index: number;
  categoryId?: string; // Links to Category.id for custom category & color
  categoryName?: string;
  categoryColor?: string;
  milestones: GoalMilestone[];
  phases?: GoalPhase[]; // Entire AI generated roadmap saved in memory
  active_week_tasks: GoalTask[];
  completed_tasks_count?: number;
  feasibility_score?: number;
  justification?: string;
  colorTheme?: string; // e.g. 'emerald', 'indigo', 'amber', 'rose', 'purple'
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  expiresAt?: string;
  token?: string;
}

