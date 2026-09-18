import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  getDocs,
  collection, 
  onSnapshot, 
  deleteField
} from 'firebase/firestore';
import { db, auth } from './firebase.ts';
import { jalaliToGregorian, JALALI_MONTHS } from '../utils/jalali.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota exceeded') || errMsg.includes('offline')) {
    return new Error(errMsg);
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error Details:', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export function isAuthValidForUser(userId: string, silent = true): boolean {
  if (!auth.currentUser) {
    if (!silent) console.warn(`[Firestore Auth Guard] auth.currentUser is null. Postponing Firestore operation for target user ${userId}.`);
    return false;
  }
  if (auth.currentUser.uid !== userId) {
    if (!silent) console.warn(`[Firestore Auth Guard] auth.currentUser.uid (${auth.currentUser.uid}) does not match target user ${userId}.`);
    return false;
  }
  return true;
}

const pendingSyncQueue = new Map<string, Partial<PlannerData>>();
let isFlushingQueue = false;

export function queuePendingSync(userId: string, data: Partial<PlannerData>): void {
  if (!userId) return;
  const existing = pendingSyncQueue.get(userId) || {};
  pendingSyncQueue.set(userId, { ...existing, ...data });
}

export async function flushPendingSyncQueue(userId: string): Promise<void> {
  if (!userId || isFlushingQueue) return;
  if (!isAuthValidForUser(userId, true)) return;

  const pendingData = pendingSyncQueue.get(userId);
  if (!pendingData) return;

  pendingSyncQueue.delete(userId);
  isFlushingQueue = true;
  try {
    await savePlannerSubcollections(userId, pendingData);
  } catch (_) {
    // If still fails, re-queue silently
    pendingSyncQueue.set(userId, pendingData);
  } finally {
    isFlushingQueue = false;
  }
}
import { 
  PlannerData, 
  CoreTask, 
  SecondaryTask, 
  NoteItem, 
  Category, 
  ClassSlot, 
  DailyTask,
  ReminderItem, 
  Goal, 
  GoalPhase, 
  DetailsColumn, 
  SecondaryTaskColumn, 
  PostponedEvent
} from '../types';

const WEEKDAY_OFFSETS: Record<string, number> = {
  saturday: 0,
  sunday: 1,
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6
};

/**
 * Normalizes any date representation (Jalali string, Unix timestamp, ISO string)
 * to a canonical YYYY-MM-DD Gregorian ISO string for sortable, indexable Firestore document keys.
 */
export function normalizeToDateISO(val: any): string {
  if (!val) {
    console.warn("[Date Normalization Warning] Empty date provided, using today ISO");
    return new Date().toISOString().split('T')[0];
  }

  const strVal = String(val).trim();

  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) {
    return strVal;
  }

  // ISO Datetime string (2026-07-28T04:15:00...)
  if (strVal.includes('T') && !isNaN(Date.parse(strVal))) {
    return new Date(strVal).toISOString().split('T')[0];
  }

  // Numeric timestamp
  if (/^\d+$/.test(strVal)) {
    const num = Number(strVal);
    const ms = num < 10000000000 ? num * 1000 : num;
    return new Date(ms).toISOString().split('T')[0];
  }

  // Jalali format e.g. "1405/05/03" or "1405-05-03"
  const jalaliParts = strVal.split(/[/.\-]/);
  if (jalaliParts.length === 3) {
    const jy = Number(jalaliParts[0]);
    const jm = Number(jalaliParts[1]);
    const jd = Number(jalaliParts[2]);
    if (!isNaN(jy) && !isNaN(jm) && !isNaN(jd) && jy >= 1300 && jy <= 1500) {
      try {
        const gDate = jalaliToGregorian(jy, jm, jd);
        return gDate.toISOString().split('T')[0];
      } catch (err) {
        console.warn(`[Date Normalization Error] Failed to parse Jalali date ${strVal}:`, err);
      }
    }
  }

  console.warn(`[Date Normalization Warning] Could not recognize date format '${strVal}', using today ISO`);
  return new Date().toISOString().split('T')[0];
}

/**
 * Derives the exact YYYY-MM-DD ISO date string and week identifier from the planner's week context.
 */
export function getISOFromWeekContext(dataCtx: Partial<PlannerData> | undefined, dayKey: string): { dateISO: string; weekIdentifier: string } {
  const offset = WEEKDAY_OFFSETS[dayKey?.toLowerCase()] ?? 0;

  if (dataCtx?.weekYear && dataCtx?.weekMonth && dataCtx?.weekStartDay) {
    const monthIdx = JALALI_MONTHS.indexOf(dataCtx.weekMonth);
    if (monthIdx >= 0) {
      try {
        const startGDate = jalaliToGregorian(dataCtx.weekYear, monthIdx + 1, dataCtx.weekStartDay);
        const targetGDate = new Date(startGDate.getTime() + offset * 86400000);
        const dateISO = targetGDate.toISOString().split('T')[0];
        const weekIdentifier = startGDate.toISOString().split('T')[0];
        return { dateISO, weekIdentifier };
      } catch (e) {
        console.warn("[Date ISO Context Warning] Failed to compute Jalali week context:", e);
      }
    }
  }

  const today = new Date();
  const dateISO = today.toISOString().split('T')[0];
  return { dateISO, weekIdentifier: dateISO };
}

/**
 * 1. Legacy User Subcollection Operations (users/{uid}/coreTasks, etc.)
 */
export async function addCoreTask(uid: string, task: CoreTask): Promise<void> {
  if (!uid || !task.id) return;
  const taskRef = doc(db, 'users', uid, 'coreTasks', task.id);
  await setDoc(taskRef, task, { merge: true });
}

export async function updateCoreTask(uid: string, taskId: string, updates: Partial<CoreTask>): Promise<void> {
  if (!uid || !taskId) return;
  const taskRef = doc(db, 'users', uid, 'coreTasks', taskId);
  await updateDoc(taskRef, updates);
}

export async function deleteCoreTask(uid: string, taskId: string): Promise<void> {
  if (!uid || !taskId) return;
  const taskRef = doc(db, 'users', uid, 'coreTasks', taskId);
  await deleteDoc(taskRef);
}

export async function addSecondaryTask(uid: string, task: SecondaryTask): Promise<void> {
  if (!uid || !task.id) return;
  const taskRef = doc(db, 'users', uid, 'secondaryTasks', task.id);
  await setDoc(taskRef, task, { merge: true });
}

export async function updateSecondaryTask(uid: string, taskId: string, updates: Partial<SecondaryTask>): Promise<void> {
  if (!uid || !taskId) return;
  const taskRef = doc(db, 'users', uid, 'secondaryTasks', taskId);
  await updateDoc(taskRef, updates);
}

export async function addTodo(uid: string, todo: NoteItem): Promise<void> {
  if (!uid || !todo.id) return;
  const todoRef = doc(db, 'users', uid, 'todos', todo.id);
  await setDoc(todoRef, todo, { merge: true });
}

export async function updateTodo(uid: string, todoId: string, updates: Partial<NoteItem>): Promise<void> {
  if (!uid || !todoId) return;
  const todoRef = doc(db, 'users', uid, 'todos', todoId);
  await updateDoc(todoRef, updates);
}

export async function deleteTodo(uid: string, todoId: string): Promise<void> {
  if (!uid || !todoId) return;
  const todoRef = doc(db, 'users', uid, 'todos', todoId);
  await deleteDoc(todoRef);
}

export async function addDailyThought(uid: string, thought: NoteItem): Promise<void> {
  if (!uid || !thought.id) return;
  const thoughtRef = doc(db, 'users', uid, 'dailyThoughts', thought.id);
  await setDoc(thoughtRef, thought, { merge: true });
}

export async function updateDailyThought(uid: string, thoughtId: string, updates: Partial<NoteItem>): Promise<void> {
  if (!uid || !thoughtId) return;
  const thoughtRef = doc(db, 'users', uid, 'dailyThoughts', thoughtId);
  await updateDoc(thoughtRef, updates);
}

export async function deleteDailyThought(uid: string, thoughtId: string): Promise<void> {
  if (!uid || !thoughtId) return;
  const thoughtRef = doc(db, 'users', uid, 'dailyThoughts', thoughtId);
  await deleteDoc(thoughtRef);
}

/**
 * 2. Goal Task Deduplication Helper
 */
export function sanitizePhaseForStorage(phase: GoalPhase): GoalPhase {
  const sanitized = { ...phase };
  if (sanitized.weeks && sanitized.weeks.length > 0) {
    sanitized.tasks = [];
  }
  return sanitized;
}

export function sanitizeGoalForStorage(goal: Goal): Goal {
  const sanitized = { ...goal };
  if (sanitized.phases) {
    sanitized.phases = sanitized.phases.map(p => sanitizePhaseForStorage(p));
  }
  return sanitized;
}

/**
 * 3. Planner Settings (Parent Document: /planners/{userId})
 * Strips all subcollections, examColumns, and unbounded history arrays.
 */
export async function savePlannerSettings(userId: string, data: Partial<PlannerData>): Promise<void> {
  if (!userId) return;
  const plannerRef = doc(db, 'planners', userId);

  const {
    categories,
    classesSchedule,
    dailyTasks,
    reminders,
    goals,
    detailsColumns,
    examColumns,
    secondaryTaskColumns,
    secondaryTasks,
    todoList,
    timebox,
    postponedEvents,
    weeklyEvents,
    dailyThoughts,
    pomodoroHistory,
    waterTrackerHistory,
    habitTracking,
    data: oldMonolithicBlob,
    ...rest
  } = data as any;

  const scalarSettings: Record<string, any> = { ...rest, updatedAt: new Date().toISOString() };

  if (scalarSettings.pomodoro && typeof scalarSettings.pomodoro === 'object') {
    const { history, ...pomoScalars } = scalarSettings.pomodoro;
    scalarSettings.pomodoro = pomoScalars;
  }
  if (scalarSettings.waterTracker && typeof scalarSettings.waterTracker === 'object') {
    const { history, ...waterScalars } = scalarSettings.waterTracker;
    scalarSettings.waterTracker = waterScalars;
  }

  await setDoc(plannerRef, scalarSettings, { merge: true });
}

/**
 * Audits the byte size of the parent document /planners/{userId} to verify no subcollections leak.
 */
export async function auditPlannerDocSize(userId: string): Promise<number> {
  if (!userId || !isAuthValidForUser(userId)) return 0;
  try {
    const snap = await getDoc(doc(db, 'planners', userId));
    if (!snap.exists()) return 0;
    const data = snap.data();
    const jsonString = JSON.stringify(data);
    const byteSize = new Blob([jsonString]).size;
    const kbSize = byteSize / 1024;
    console.log(`[Planner Doc Size Audit] /planners/${userId} parent doc size: ${kbSize.toFixed(2)} KB (${byteSize} bytes)`);
    if (kbSize > 50) {
      console.warn(`[Planner Doc Size Warning] Parent document /planners/${userId} is ${kbSize.toFixed(2)} KB (> 50 KB). Top-level keys present:`, Object.keys(data));
    }
    return byteSize;
  } catch (err) {
    console.error(`[Planner Doc Size Audit Error] Failed to audit /planners/${userId}:`, err);
    return 0;
  }
}

/**
 * 4. Subcollection CRUD Operations (/planners/{userId}/*)
 */

// Categories
export async function saveCategoryDoc(userId: string, category: Category): Promise<void> {
  if (!userId || !category.id) return;
  const ref = doc(db, 'planners', userId, 'categories', category.id);
  await setDoc(ref, category, { merge: true });
}

export async function deleteCategoryDoc(userId: string, categoryId: string): Promise<void> {
  if (!userId || !categoryId) return;
  await deleteDoc(doc(db, 'planners', userId, 'categories', categoryId));
}

// Classes Schedule
export async function saveClassScheduleDoc(userId: string, classItem: ClassSlot): Promise<void> {
  if (!userId || !classItem.id) return;
  const ref = doc(db, 'planners', userId, 'classesSchedule', classItem.id);
  await setDoc(ref, classItem, { merge: true });
}

export async function deleteClassSlotDoc(userId: string, classId: string): Promise<void> {
  if (!userId || !classId) return;
  await deleteDoc(doc(db, 'planners', userId, 'classesSchedule', classId));
}

// Daily Tasks (Working copy + Historical Snapshot + Daily Stats Rollup)
export async function saveDailyTasksDoc(userId: string, dayKey: string, tasks: DailyTask[], dataCtx?: Partial<PlannerData>): Promise<void> {
  if (!userId || !dayKey) return;
  // 1. Current week working copy
  const ref = doc(db, 'planners', userId, 'dailyTasks', dayKey);
  await setDoc(ref, { dayKey, tasks }, { merge: true });

  // 2. Immutable history snapshot
  const { dateISO, weekIdentifier } = getISOFromWeekContext(dataCtx, dayKey);
  const historyRef = doc(db, 'planners', userId, 'dailyTasksHistory', dateISO);
  await setDoc(historyRef, {
    date: dateISO,
    dayKey,
    weekIdentifier,
    tasks,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 3. Rollup stats for analytics
  if (dataCtx) {
    await saveDailyStatsDoc(userId, dateISO, {
      ...dataCtx,
      dailyTasks: { ...(dataCtx.dailyTasks || {}), [dayKey]: tasks }
    });
  }
}

// Reminders
export async function saveReminderDoc(userId: string, reminder: ReminderItem): Promise<void> {
  if (!userId || !reminder.id) return;
  const ref = doc(db, 'planners', userId, 'reminders', reminder.id);
  await setDoc(ref, reminder, { merge: true });
}

export async function deleteReminderDoc(userId: string, reminderId: string): Promise<void> {
  if (!userId || !reminderId) return;
  await deleteDoc(doc(db, 'planners', userId, 'reminders', reminderId));
}

// Goals & Phase Subcollections
export async function saveGoalDoc(userId: string, goal: Goal): Promise<void> {
  if (!userId || !goal.goal_id) return;
  const sanitizedGoal = sanitizeGoalForStorage(goal);
  const { phases, ...goalTopLevel } = sanitizedGoal;

  const goalRef = doc(db, 'planners', userId, 'goals', goal.goal_id);
  await setDoc(goalRef, goalTopLevel, { merge: true });

  if (phases && phases.length > 0) {
    for (const phase of phases) {
      const phaseNum = String(phase.phase_number);
      const phaseRef = doc(db, 'planners', userId, 'goals', goal.goal_id, 'phases', phaseNum);
      await setDoc(phaseRef, phase, { merge: true });
    }
  }
}

export async function deleteGoalDoc(userId: string, goalId: string): Promise<void> {
  if (!userId || !goalId) return;
  
  const phasesCol = collection(db, 'planners', userId, 'goals', goalId, 'phases');
  const phasesSnap = await getDocs(phasesCol);
  for (const phaseDoc of phasesSnap.docs) {
    await deleteDoc(phaseDoc.ref);
  }

  await deleteDoc(doc(db, 'planners', userId, 'goals', goalId));
}

// Details Columns
export async function saveDetailsColumnDoc(userId: string, column: DetailsColumn): Promise<void> {
  if (!userId || !column.id) return;
  const ref = doc(db, 'planners', userId, 'detailsColumns', column.id);
  await setDoc(ref, column, { merge: true });
}

export async function deleteDetailsColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'detailsColumns', columnId));
}

// Exam Columns (Fix A2)
export async function saveExamColumnDoc(userId: string, column: DetailsColumn): Promise<void> {
  if (!userId || !column.id) return;
  const ref = doc(db, 'planners', userId, 'examColumns', column.id);
  await setDoc(ref, column, { merge: true });
}

export async function deleteExamColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'examColumns', columnId));
}

// Secondary Task Columns
export async function saveSecondaryTaskColumnDoc(userId: string, column: SecondaryTaskColumn): Promise<void> {
  if (!userId || !column.id) return;
  const ref = doc(db, 'planners', userId, 'secondaryTaskColumns', column.id);
  await setDoc(ref, column, { merge: true });
}

export async function deleteSecondaryTaskColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'secondaryTaskColumns', columnId));
}

// Secondary Tasks
export async function saveSecondaryTaskDoc(userId: string, task: SecondaryTask): Promise<void> {
  if (!userId || !task.id) return;
  const ref = doc(db, 'planners', userId, 'secondaryTasks', task.id);
  await setDoc(ref, task, { merge: true });
}

export async function deleteSecondaryTaskDoc(userId: string, taskId: string): Promise<void> {
  if (!userId || !taskId) return;
  await deleteDoc(doc(db, 'planners', userId, 'secondaryTasks', taskId));
}

// Todo List
export async function saveTodoListDoc(userId: string, todo: NoteItem): Promise<void> {
  if (!userId || !todo.id) return;
  const ref = doc(db, 'planners', userId, 'todoList', todo.id);
  await setDoc(ref, todo, { merge: true });
}

export async function deleteTodoItemDoc(userId: string, todoId: string): Promise<void> {
  if (!userId || !todoId) return;
  await deleteDoc(doc(db, 'planners', userId, 'todoList', todoId));
}

// Timebox
export async function saveTimeboxDoc(userId: string, entry: any): Promise<void> {
  if (!userId || !entry.id) return;
  const ref = doc(db, 'planners', userId, 'timebox', entry.id);
  await setDoc(ref, entry, { merge: true });
}

export async function deleteTimeboxDoc(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  await deleteDoc(doc(db, 'planners', userId, 'timebox', entryId));
}

// Postponed Events
export async function savePostponedEventDoc(userId: string, event: PostponedEvent): Promise<void> {
  if (!userId || !event.id) return;
  const ref = doc(db, 'planners', userId, 'postponedEvents', event.id);
  await setDoc(ref, event, { merge: true });
}

export async function deletePostponedEventDoc(userId: string, eventId: string): Promise<void> {
  if (!userId || !eventId) return;
  await deleteDoc(doc(db, 'planners', userId, 'postponedEvents', eventId));
}

// Weekly Events
export async function saveWeeklyEventDoc(userId: string, event: NoteItem): Promise<void> {
  if (!userId || !event.id) return;
  const ref = doc(db, 'planners', userId, 'weeklyEvents', event.id);
  await setDoc(ref, event, { merge: true });
}

export async function deleteWeeklyEventDoc(userId: string, eventId: string): Promise<void> {
  if (!userId || !eventId) return;
  await deleteDoc(doc(db, 'planners', userId, 'weeklyEvents', eventId));
}

// Daily Thoughts
export async function saveDailyThoughtDoc(userId: string, thought: NoteItem): Promise<void> {
  if (!userId || !thought.id) return;
  const ref = doc(db, 'planners', userId, 'dailyThoughts', thought.id);
  await setDoc(ref, thought, { merge: true });
}

export async function deleteDailyThoughtDoc(userId: string, thoughtId: string): Promise<void> {
  if (!userId || !thoughtId) return;
  await deleteDoc(doc(db, 'planners', userId, 'dailyThoughts', thoughtId));
}

// History & Unbounded Subcollections (Normalized dates B2 & B3)
export async function savePomodoroHistoryDoc(userId: string, rawDateKey: string, entry: any): Promise<void> {
  if (!userId || !rawDateKey) return;
  const dateISO = normalizeToDateISO(rawDateKey);
  const ref = doc(db, 'planners', userId, 'pomodoroHistory', dateISO);
  await setDoc(ref, { ...entry, date: dateISO, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function saveWaterTrackerHistoryDoc(userId: string, rawDateKey: string, entry: any): Promise<void> {
  if (!userId || !rawDateKey) return;
  const dateISO = normalizeToDateISO(rawDateKey);
  const ref = doc(db, 'planners', userId, 'waterTrackerHistory', dateISO);
  await setDoc(ref, { ...entry, date: dateISO, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function saveHabitTrackingDoc(userId: string, weekKey: string, entry: any, dataCtx?: Partial<PlannerData>): Promise<void> {
  if (!userId || !weekKey) return;
  let weekStartDate = entry.weekStartDate ? normalizeToDateISO(entry.weekStartDate) : '';
  if (!weekStartDate) {
    const { weekIdentifier } = getISOFromWeekContext(dataCtx, 'saturday');
    weekStartDate = weekIdentifier;
  }

  const docId = weekStartDate || String(weekKey);
  const ref = doc(db, 'planners', userId, 'habitTracking', docId);
  await setDoc(ref, {
    weekStartDate,
    label: weekKey,
    entry: entry.habits || entry,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

// Daily Stats Rollup Subcollection (B5)
export async function saveDailyStatsDoc(userId: string, dateISO: string, data: Partial<PlannerData>): Promise<void> {
  if (!userId || !dateISO) return;

  const normalizedDate = normalizeToDateISO(dateISO);

  const gDate = new Date(normalizedDate);
  const utcDay = gDate.getUTCDay();
  const dayIndex = (utcDay + 1) % 7;
  const dayKey = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'][dayIndex];

  const tasksForDay: DailyTask[] = (data.dailyTasks && (data.dailyTasks as any)[dayKey]) || [];

  let tasksCompleted = 0;
  let tasksTotal = tasksForDay.length;
  const categoryBreakdown: Record<string, { completed: number; total: number }> = {};

  tasksForDay.forEach(t => {
    if (t.status === 'completed') tasksCompleted++;
    const catId = t.categoryId || 'uncategorized';
    if (!categoryBreakdown[catId]) {
      categoryBreakdown[catId] = { completed: 0, total: 0 };
    }
    categoryBreakdown[catId].total++;
    if (t.status === 'completed') {
      categoryBreakdown[catId].completed++;
    }
  });

  let focusMinutes = 0;
  if (data.pomodoro?.history && Array.isArray(data.pomodoro.history)) {
    const dayPomo = data.pomodoro.history.find((p: any) => normalizeToDateISO(p.date || p.timestamp) === normalizedDate);
    if (dayPomo) {
      focusMinutes = dayPomo.focusMinutes || dayPomo.minutes || 0;
    }
  }

  let waterMl = 0;
  if (data.waterTracker?.history && Array.isArray(data.waterTracker.history)) {
    const dayWater = data.waterTracker.history.find((w: any) => normalizeToDateISO(w.date || w.timestamp) === normalizedDate);
    if (dayWater) {
      waterMl = dayWater.amount || dayWater.waterMl || 0;
    }
  }

  let habitsCompleted = 0;
  let habitsTotal = 0;
  if (data.habitTracking) {
    const habitEntries = Array.isArray(data.habitTracking) ? data.habitTracking : Object.values(data.habitTracking);
    habitEntries.forEach((h: any) => {
      if (h.completedDays && Array.isArray(h.completedDays)) {
        habitsTotal++;
        if (h.completedDays.includes(dayKey)) habitsCompleted++;
      }
    });
  }

  const rollupRef = doc(db, 'planners', userId, 'dailyStats', normalizedDate);
  await setDoc(rollupRef, {
    date: normalizedDate,
    dayKey,
    tasksCompleted,
    tasksTotal,
    categoryBreakdown,
    focusMinutes,
    waterMl,
    habitsCompleted,
    habitsTotal,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Saves entire planner data into appropriate subcollections and parent document settings
 */
export async function savePlannerSubcollections(userId: string, data: Partial<PlannerData>): Promise<void> {
  if (!userId) return;

  if (!isAuthValidForUser(userId, true)) {
    queuePendingSync(userId, data);
    return;
  }

  // 1. Save parent doc scalar settings (no arrays / subcollections)
  await savePlannerSettings(userId, data);

  // 2. Save categories
  if (Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      await saveCategoryDoc(userId, cat);
    }
  }

  // 3. Save classesSchedule
  if (Array.isArray(data.classesSchedule)) {
    for (const cls of data.classesSchedule) {
      await saveClassScheduleDoc(userId, cls);
    }
  }

  // 4. Save dailyTasks
  if (data.dailyTasks && typeof data.dailyTasks === 'object') {
    for (const [dayKey, tasks] of Object.entries(data.dailyTasks)) {
      if (Array.isArray(tasks)) {
        await saveDailyTasksDoc(userId, dayKey, tasks as DailyTask[], data);
      }
    }
  }

  // 5. Save reminders
  if (Array.isArray(data.reminders)) {
    for (const rem of data.reminders) {
      await saveReminderDoc(userId, rem);
    }
  }

  // 6. Save goals
  if (Array.isArray(data.goals)) {
    for (const goal of data.goals) {
      await saveGoalDoc(userId, goal);
    }
  }

  // 7. Save detailsColumns
  if (Array.isArray(data.detailsColumns)) {
    for (const col of data.detailsColumns) {
      await saveDetailsColumnDoc(userId, col);
    }
  }

  // 8. Save examColumns (Fix A2)
  if (Array.isArray(data.examColumns)) {
    for (const col of data.examColumns) {
      await saveExamColumnDoc(userId, col);
    }
  }

  // 9. Save secondaryTaskColumns
  if (Array.isArray(data.secondaryTaskColumns)) {
    for (const col of data.secondaryTaskColumns) {
      await saveSecondaryTaskColumnDoc(userId, col);
    }
  }

  // 10. Save secondaryTasks
  if (Array.isArray(data.secondaryTasks)) {
    for (const task of data.secondaryTasks) {
      await saveSecondaryTaskDoc(userId, task);
    }
  }

  // 11. Save todoList
  if (Array.isArray(data.todoList)) {
    for (const todo of data.todoList) {
      await saveTodoListDoc(userId, todo);
    }
  }

  // 12. Save timebox
  if (Array.isArray(data.timebox)) {
    for (const tb of data.timebox) {
      await saveTimeboxDoc(userId, tb);
    }
  }

  // 13. Save postponedEvents
  if (Array.isArray(data.postponedEvents)) {
    for (const pe of data.postponedEvents) {
      await savePostponedEventDoc(userId, pe);
    }
  }

  // 14. Save weeklyEvents
  if (Array.isArray(data.weeklyEvents)) {
    for (const we of data.weeklyEvents) {
      await saveWeeklyEventDoc(userId, we);
    }
  }

  // 15. Save dailyThoughts
  if (Array.isArray(data.dailyThoughts)) {
    for (const dt of data.dailyThoughts) {
      await saveDailyThoughtDoc(userId, dt);
    }
  }

  // 16. Save pomodoro history
  if (data.pomodoro?.history && Array.isArray(data.pomodoro.history)) {
    for (let idx = 0; idx < data.pomodoro.history.length; idx++) {
      const entry = data.pomodoro.history[idx];
      const dateKey = entry.date || entry.timestamp || `pomo_day_${idx}`;
      await savePomodoroHistoryDoc(userId, String(dateKey), entry);
    }
  }

  // 17. Save waterTracker history
  if (data.waterTracker?.history && Array.isArray(data.waterTracker.history)) {
    for (let idx = 0; idx < data.waterTracker.history.length; idx++) {
      const entry = data.waterTracker.history[idx];
      const dateKey = entry.date || entry.timestamp || `water_day_${idx}`;
      await saveWaterTrackerHistoryDoc(userId, String(dateKey), entry);
    }
  }

  // 18. Save habitTracking
  if (data.habitTracking) {
    if (Array.isArray(data.habitTracking)) {
      for (let idx = 0; idx < data.habitTracking.length; idx++) {
        const entry = data.habitTracking[idx];
        const weekKey = entry.weekKey || entry.id || `week_${idx}`;
        await saveHabitTrackingDoc(userId, String(weekKey), entry, data);
      }
    } else if (typeof data.habitTracking === 'object') {
      for (const [weekKey, entry] of Object.entries(data.habitTracking)) {
        await saveHabitTrackingDoc(userId, weekKey, entry, data);
      }
    }
  }

  // Audit parent doc size
  await auditPlannerDocSize(userId);
}

/**
 * 5. Real-Time Subscription for /planners/{userId} + Subcollections
 */
export function subscribeToPlannerSubcollections(
  userId: string,
  onDataCombined: (data: Partial<PlannerData>) => void,
  onError?: (error: Error) => void
): () => void {
  if (!userId || !isAuthValidForUser(userId)) return () => {};

  let settingsData: Record<string, any> = {};
  let categoriesList: Category[] = [];
  let classesScheduleList: ClassSlot[] = [];
  let dailyTasksMap: Record<string, DailyTask[]> = {
    saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: []
  };
  let remindersList: ReminderItem[] = [];
  let detailsColumnsList: DetailsColumn[] = [];
  let examColumnsList: DetailsColumn[] = [];
  let secondaryTaskColumnsList: SecondaryTaskColumn[] = [];
  let secondaryTasksList: SecondaryTask[] = [];
  let todoListItems: NoteItem[] = [];
  let timeboxEntries: any[] = [];
  let postponedEventsList: PostponedEvent[] = [];
  let weeklyEventsList: NoteItem[] = [];
  let dailyThoughtsList: NoteItem[] = [];
  let pomodoroHistoryList: any[] = [];
  let waterTrackerHistoryList: any[] = [];
  let habitTrackingMap: Record<string, any> = {};

  let goalsTopLevelList: Goal[] = [];
  const phaseUnsubs = new Map<string, () => void>();
  const goalPhasesMap = new Map<string, GoalPhase[]>();

  const notify = () => {
    const combinedGoals: Goal[] = goalsTopLevelList.map(goal => {
      const phases = goalPhasesMap.get(goal.goal_id) || [];
      return {
        ...goal,
        phases
      };
    });

    const pomoState = {
      ...(settingsData.pomodoro || {}),
      history: pomodoroHistoryList
    };

    const waterState = {
      ...(settingsData.waterTracker || {}),
      history: waterTrackerHistoryList
    };

    onDataCombined({
      ...settingsData,
      categories: categoriesList,
      classesSchedule: classesScheduleList,
      dailyTasks: dailyTasksMap,
      reminders: remindersList,
      goals: combinedGoals,
      detailsColumns: detailsColumnsList,
      examColumns: examColumnsList,
      secondaryTaskColumns: secondaryTaskColumnsList,
      secondaryTasks: secondaryTasksList,
      todoList: todoListItems,
      timebox: timeboxEntries,
      postponedEvents: postponedEventsList,
      weeklyEvents: weeklyEventsList,
      dailyThoughts: dailyThoughtsList,
      pomodoro: pomoState,
      waterTracker: waterState,
      habitTracking: habitTrackingMap
    });
  };

  const topLevelUnsubs: (() => void)[] = [];

  // 1. Parent Settings Doc
  const parentRef = doc(db, 'planners', userId);
  topLevelUnsubs.push(
    onSnapshot(parentRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const { data: _oldBlob, ...cleanSettings } = d;
        settingsData = cleanSettings;
        notify();
      }
    }, onError)
  );

  // 2. Categories
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'categories'), (snap) => {
      categoriesList = snap.docs.map(d => d.data() as Category);
      notify();
    }, onError)
  );

  // 3. Classes Schedule
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'classesSchedule'), (snap) => {
      classesScheduleList = snap.docs.map(d => d.data() as ClassSlot);
      notify();
    }, onError)
  );

  // 4. Daily Tasks
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'dailyTasks'), (snap) => {
      const newMap: Record<string, DailyTask[]> = {
        saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: []
      };
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.dayKey) {
          newMap[data.dayKey] = data.tasks || [];
        }
      });
      dailyTasksMap = newMap;
      notify();
    }, onError)
  );

  // 5. Reminders
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'reminders'), (snap) => {
      remindersList = snap.docs.map(d => d.data() as ReminderItem);
      notify();
    }, onError)
  );

  // 6. Goals & Per-Goal Phases Listener
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'goals'), (snap) => {
      goalsTopLevelList = snap.docs.map(d => d.data() as Goal);
      const currentGoalIds = new Set(snap.docs.map(d => d.id));

      for (const [goalId, unsub] of Array.from(phaseUnsubs.entries())) {
        if (!currentGoalIds.has(goalId)) {
          unsub();
          phaseUnsubs.delete(goalId);
          goalPhasesMap.delete(goalId);
        }
      }

      snap.docs.forEach(goalDoc => {
        const goalId = goalDoc.id;
        if (!phaseUnsubs.has(goalId)) {
          const phasesCol = collection(db, 'planners', userId, 'goals', goalId, 'phases');
          const unsubPhase = onSnapshot(phasesCol, (phaseSnap) => {
            const phasesList: GoalPhase[] = [];
            phaseSnap.forEach(pDoc => {
              const pData = pDoc.data() as GoalPhase;
              if (pData.weeks && pData.weeks.length > 0) {
                pData.tasks = pData.weeks.flatMap(w => w.tasks || []);
              }
              phasesList.push(pData);
            });
            phasesList.sort((a, b) => (a.phase_number || 0) - (b.phase_number || 0));
            goalPhasesMap.set(goalId, phasesList);
            notify();
          }, onError);
          phaseUnsubs.set(goalId, unsubPhase);
        }
      });

      notify();
    }, onError)
  );

  // 7. Details Columns
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'detailsColumns'), (snap) => {
      detailsColumnsList = snap.docs.map(d => d.data() as DetailsColumn);
      notify();
    }, onError)
  );

  // 8. Exam Columns
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'examColumns'), (snap) => {
      examColumnsList = snap.docs.map(d => d.data() as DetailsColumn);
      notify();
    }, onError)
  );

  // 9. Secondary Task Columns
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'secondaryTaskColumns'), (snap) => {
      secondaryTaskColumnsList = snap.docs.map(d => d.data() as SecondaryTaskColumn);
      notify();
    }, onError)
  );

  // 10. Secondary Tasks
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'secondaryTasks'), (snap) => {
      secondaryTasksList = snap.docs.map(d => d.data() as SecondaryTask);
      notify();
    }, onError)
  );

  // 11. Todo List
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'todoList'), (snap) => {
      todoListItems = snap.docs.map(d => d.data() as NoteItem);
      notify();
    }, onError)
  );

  // 12. Timebox
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'timebox'), (snap) => {
      timeboxEntries = snap.docs.map(d => d.data());
      notify();
    }, onError)
  );

  // 13. Postponed Events
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'postponedEvents'), (snap) => {
      postponedEventsList = snap.docs.map(d => d.data() as PostponedEvent);
      notify();
    }, onError)
  );

  // 14. Weekly Events
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'weeklyEvents'), (snap) => {
      weeklyEventsList = snap.docs.map(d => d.data() as NoteItem);
      notify();
    }, onError)
  );

  // 15. Daily Thoughts
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'dailyThoughts'), (snap) => {
      dailyThoughtsList = snap.docs.map(d => d.data() as NoteItem);
      notify();
    }, onError)
  );

  // 16. Pomodoro History
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'pomodoroHistory'), (snap) => {
      pomodoroHistoryList = snap.docs.map(d => d.data());
      notify();
    }, onError)
  );

  // 17. WaterTracker History
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'waterTrackerHistory'), (snap) => {
      waterTrackerHistoryList = snap.docs.map(d => d.data());
      notify();
    }, onError)
  );

  // 18. Habit Tracking
  topLevelUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'habitTracking'), (snap) => {
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        map[d.id] = d.data();
      });
      habitTrackingMap = map;
      notify();
    }, onError)
  );

  return () => {
    topLevelUnsubs.forEach(unsub => unsub());
    phaseUnsubs.forEach(unsub => unsub());
    phaseUnsubs.clear();
    goalPhasesMap.clear();
  };
}

const migratedUsersSet = new Set<string>();

/**
 * 6. One-time Migration Routine
 * Reads monolithic `data` blob from /planners/{userId}, splits into subcollections with goal task deduplication,
 * and cleans up the parent document.
 */
export async function migratePlannerDataToSubcollections(
  userId: string, 
  oldData?: any
): Promise<{ success: boolean; migratedCounts: Record<string, number> }> {
  const counts: Record<string, number> = {
    categories: 0,
    classesSchedule: 0,
    dailyTasksDays: 0,
    reminders: 0,
    goals: 0,
    detailsColumns: 0,
    examColumns: 0,
    secondaryTaskColumns: 0,
    secondaryTasks: 0,
    todoList: 0,
    timebox: 0,
    postponedEvents: 0,
    weeklyEvents: 0,
    dailyThoughts: 0,
    pomodoroHistory: 0,
    waterTrackerHistory: 0,
    habitTracking: 0
  };

  if (!userId || migratedUsersSet.has(userId)) return { success: true, migratedCounts: counts };
  if (!isAuthValidForUser(userId, true)) {
    return { success: false, migratedCounts: counts };
  }

  // Mark migrated immediately so re-renders or concurrent calls return instantly
  migratedUsersSet.add(userId);

  try {
    let sourceData = oldData;
    const parentRef = doc(db, 'planners', userId);

    if (!sourceData) {
      const snap = await getDoc(parentRef);
      if (snap.exists() && snap.data().data) {
        sourceData = snap.data().data;
      }
    }

    if (!sourceData) {
      await auditPlannerDocSize(userId);
      return { success: true, migratedCounts: counts };
    }

    // 1. Save Subcollections
    if (Array.isArray(sourceData.categories)) {
      for (const cat of sourceData.categories) {
        await saveCategoryDoc(userId, cat);
        counts.categories++;
      }
    }

    if (Array.isArray(sourceData.classesSchedule)) {
      for (const cls of sourceData.classesSchedule) {
        await saveClassScheduleDoc(userId, cls);
        counts.classesSchedule++;
      }
    }

    if (sourceData.dailyTasks && typeof sourceData.dailyTasks === 'object') {
      for (const [dayKey, tasks] of Object.entries(sourceData.dailyTasks)) {
        if (Array.isArray(tasks)) {
          await saveDailyTasksDoc(userId, dayKey, tasks as DailyTask[], sourceData);
          counts.dailyTasksDays++;
        }
      }
    }

    if (Array.isArray(sourceData.reminders)) {
      for (const rem of sourceData.reminders) {
        await saveReminderDoc(userId, rem);
        counts.reminders++;
      }
    }

    if (Array.isArray(sourceData.goals)) {
      for (const goal of sourceData.goals) {
        await saveGoalDoc(userId, goal);
        counts.goals++;
      }
    }

    if (Array.isArray(sourceData.detailsColumns)) {
      for (const col of sourceData.detailsColumns) {
        await saveDetailsColumnDoc(userId, col);
        counts.detailsColumns++;
      }
    }

    if (Array.isArray(sourceData.examColumns)) {
      for (const col of sourceData.examColumns) {
        await saveExamColumnDoc(userId, col);
        counts.examColumns++;
      }
    }

    if (Array.isArray(sourceData.secondaryTaskColumns)) {
      for (const col of sourceData.secondaryTaskColumns) {
        await saveSecondaryTaskColumnDoc(userId, col);
        counts.secondaryTaskColumns++;
      }
    }

    if (Array.isArray(sourceData.secondaryTasks)) {
      for (const task of sourceData.secondaryTasks) {
        await saveSecondaryTaskDoc(userId, task);
        counts.secondaryTasks++;
      }
    }

    if (Array.isArray(sourceData.todoList)) {
      for (const todo of sourceData.todoList) {
        await saveTodoListDoc(userId, todo);
        counts.todoList++;
      }
    }

    if (Array.isArray(sourceData.timebox)) {
      for (const tb of sourceData.timebox) {
        await saveTimeboxDoc(userId, tb);
        counts.timebox++;
      }
    }

    if (Array.isArray(sourceData.postponedEvents)) {
      for (const pe of sourceData.postponedEvents) {
        await savePostponedEventDoc(userId, pe);
        counts.postponedEvents++;
      }
    }

    if (Array.isArray(sourceData.weeklyEvents)) {
      for (const we of sourceData.weeklyEvents) {
        await saveWeeklyEventDoc(userId, we);
        counts.weeklyEvents++;
      }
    }

    if (Array.isArray(sourceData.dailyThoughts)) {
      for (const dt of sourceData.dailyThoughts) {
        await saveDailyThoughtDoc(userId, dt);
        counts.dailyThoughts++;
      }
    }

    if (sourceData.pomodoro?.history && Array.isArray(sourceData.pomodoro.history)) {
      for (let idx = 0; idx < sourceData.pomodoro.history.length; idx++) {
        const entry = sourceData.pomodoro.history[idx];
        const dateKey = entry.date || entry.timestamp || `pomo_day_${idx}`;
        await savePomodoroHistoryDoc(userId, String(dateKey), entry);
        counts.pomodoroHistory++;
      }
    }

    if (sourceData.waterTracker?.history && Array.isArray(sourceData.waterTracker.history)) {
      for (let idx = 0; idx < sourceData.waterTracker.history.length; idx++) {
        const entry = sourceData.waterTracker.history[idx];
        const dateKey = entry.date || entry.timestamp || `water_day_${idx}`;
        await saveWaterTrackerHistoryDoc(userId, String(dateKey), entry);
        counts.waterTrackerHistory++;
      }
    }

    if (sourceData.habitTracking) {
      if (Array.isArray(sourceData.habitTracking)) {
        for (let idx = 0; idx < sourceData.habitTracking.length; idx++) {
          const entry = sourceData.habitTracking[idx];
          const weekKey = entry.weekKey || entry.id || `week_${idx}`;
          await saveHabitTrackingDoc(userId, String(weekKey), entry, sourceData);
          counts.habitTracking++;
        }
      } else if (typeof sourceData.habitTracking === 'object') {
        for (const [weekKey, entry] of Object.entries(sourceData.habitTracking)) {
          await saveHabitTrackingDoc(userId, weekKey, entry, sourceData);
          counts.habitTracking++;
        }
      }
    }

    // 2. Save Scalar Settings & Remove Monolithic Data Blob with explicit logging
    await savePlannerSettings(userId, sourceData);
    try {
      await updateDoc(parentRef, {
        data: deleteField()
      });
      console.log(`[Migration] Cleaned up monolithic 'data' map from /planners/${userId}`);
    } catch (cleanErr) {
      console.error(`[Migration Warning] Could not remove 'data' field from /planners/${userId}:`, cleanErr);
    }

    console.log(`[Migration Complete] User ${userId} planner migrated successfully. Counts:`, counts);
    await auditPlannerDocSize(userId);
    return { success: true, migratedCounts: counts };
  } catch (err) {
    console.error(`[Migration Error] Failed to migrate planner for user ${userId}:`, err);
    return { success: false, migratedCounts: counts };
  }
}
