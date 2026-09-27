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
} from '../types.ts';
import {
  computeDiff,
  applyDiff,
  updateMirrorFromSnapshot,
  resetMirror,
  sanitizePhaseForStorage,
  extractScalarSettings,
  hashContent
} from './plannerSyncEngine.ts';

export { resetMirror };

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
    // If still fails, re-queue silently — merge so that any NEWER data
    // queued while this flush was in flight is not lost
    const current = pendingSyncQueue.get(userId) || {};
    pendingSyncQueue.set(userId, { ...pendingData, ...current });
  } finally {
    isFlushingQueue = false;
  }
}

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
    if (kbSize > 50) {
      console.warn(`[Planner Doc Size Warning] Parent document /planners/${userId} is ${kbSize.toFixed(2)} KB (> 50 KB). Top-level keys:`, Object.keys(data));
    }
    return byteSize;
  } catch (err) {
    console.error(`[Planner Doc Size Audit Error] Failed to audit /planners/${userId}:`, err);
    return 0;
  }
}

/**
 * Saves parent document scalar settings (/planners/{userId})
 */
export async function savePlannerSettings(userId: string, data: Partial<PlannerData>): Promise<void> {
  if (!userId) return;
  const plannerRef = doc(db, 'planners', userId);
  const scalarSettings = extractScalarSettings(data);
  await setDoc(plannerRef, { ...scalarSettings, updatedAt: new Date().toISOString() }, { merge: true });
}

// -------------------------------------------------------------
// Legacy Functions (Kept for compatibility with @deprecated)
// -------------------------------------------------------------

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function addCoreTask(uid: string, task: CoreTask): Promise<void> {
  if (!uid || !task.id) return;
  await setDoc(doc(db, 'planners', uid, 'coreTasks', task.id), task, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function updateCoreTask(uid: string, taskId: string, updates: Partial<CoreTask>): Promise<void> {
  if (!uid || !taskId) return;
  await updateDoc(doc(db, 'planners', uid, 'coreTasks', taskId), updates);
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteCoreTask(uid: string, taskId: string): Promise<void> {
  if (!uid || !taskId) return;
  await deleteDoc(doc(db, 'planners', uid, 'coreTasks', taskId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function addSecondaryTask(uid: string, task: SecondaryTask): Promise<void> {
  if (!uid || !task.id) return;
  await setDoc(doc(db, 'planners', uid, 'secondaryTasks', task.id), task, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function updateSecondaryTask(uid: string, taskId: string, updates: Partial<SecondaryTask>): Promise<void> {
  if (!uid || !taskId) return;
  await updateDoc(doc(db, 'planners', uid, 'secondaryTasks', taskId), updates);
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function addTodo(uid: string, todo: NoteItem): Promise<void> {
  if (!uid || !todo.id) return;
  await setDoc(doc(db, 'planners', uid, 'todoList', todo.id), todo, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function updateTodo(uid: string, todoId: string, updates: Partial<NoteItem>): Promise<void> {
  if (!uid || !todoId) return;
  await updateDoc(doc(db, 'planners', uid, 'todoList', todoId), updates);
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteTodo(uid: string, todoId: string): Promise<void> {
  if (!uid || !todoId) return;
  await deleteDoc(doc(db, 'planners', uid, 'todoList', todoId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function addDailyThought(uid: string, thought: NoteItem): Promise<void> {
  if (!uid || !thought.id) return;
  await setDoc(doc(db, 'planners', uid, 'dailyThoughts', thought.id), thought, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function updateDailyThought(uid: string, thoughtId: string, updates: Partial<NoteItem>): Promise<void> {
  if (!uid || !thoughtId) return;
  await updateDoc(doc(db, 'planners', uid, 'dailyThoughts', thoughtId), updates);
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteDailyThought(uid: string, thoughtId: string): Promise<void> {
  if (!uid || !thoughtId) return;
  await deleteDoc(doc(db, 'planners', uid, 'dailyThoughts', thoughtId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveCategoryDoc(userId: string, category: Category): Promise<void> {
  if (!userId || !category.id) return;
  await setDoc(doc(db, 'planners', userId, 'categories', category.id), category, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteCategoryDoc(userId: string, categoryId: string): Promise<void> {
  if (!userId || !categoryId) return;
  await deleteDoc(doc(db, 'planners', userId, 'categories', categoryId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveClassScheduleDoc(userId: string, classItem: ClassSlot): Promise<void> {
  if (!userId || !classItem.id) return;
  await setDoc(doc(db, 'planners', userId, 'classesSchedule', classItem.id), classItem, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteClassSlotDoc(userId: string, classId: string): Promise<void> {
  if (!userId || !classId) return;
  await deleteDoc(doc(db, 'planners', userId, 'classesSchedule', classId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveReminderDoc(userId: string, reminder: ReminderItem): Promise<void> {
  if (!userId || !reminder.id) return;
  await setDoc(doc(db, 'planners', userId, 'reminders', reminder.id), reminder, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteReminderDoc(userId: string, reminderId: string): Promise<void> {
  if (!userId || !reminderId) return;
  await deleteDoc(doc(db, 'planners', userId, 'reminders', reminderId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveGoalDoc(userId: string, goal: Goal): Promise<void> {
  if (!userId || !goal.goal_id) return;
  const sanitized = sanitizePhaseForStorage ? goal : goal;
  const { phases, ...topLevel } = sanitized;
  await setDoc(doc(db, 'planners', userId, 'goals', goal.goal_id), topLevel, { merge: true });
  if (phases) {
    for (const phase of phases) {
      await setDoc(doc(db, 'planners', userId, 'goals', goal.goal_id, 'phases', String(phase.phase_number)), sanitizePhaseForStorage(phase), { merge: true });
    }
  }
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteGoalDoc(userId: string, goalId: string): Promise<void> {
  if (!userId || !goalId) return;
  const phasesSnap = await getDocs(collection(db, 'planners', userId, 'goals', goalId, 'phases'));
  for (const p of phasesSnap.docs) {
    await deleteDoc(p.ref);
  }
  await deleteDoc(doc(db, 'planners', userId, 'goals', goalId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveDetailsColumnDoc(userId: string, column: DetailsColumn): Promise<void> {
  if (!userId || !column.id) return;
  await setDoc(doc(db, 'planners', userId, 'detailsColumns', column.id), column, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteDetailsColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'detailsColumns', columnId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveExamColumnDoc(userId: string, column: DetailsColumn): Promise<void> {
  if (!userId || !column.id) return;
  await setDoc(doc(db, 'planners', userId, 'examColumns', column.id), column, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteExamColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'examColumns', columnId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveSecondaryTaskColumnDoc(userId: string, column: SecondaryTaskColumn): Promise<void> {
  if (!userId || !column.id) return;
  await setDoc(doc(db, 'planners', userId, 'secondaryTaskColumns', column.id), column, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteSecondaryTaskColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'secondaryTaskColumns', columnId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveSecondaryTaskDoc(userId: string, task: SecondaryTask): Promise<void> {
  if (!userId || !task.id) return;
  await setDoc(doc(db, 'planners', userId, 'secondaryTasks', task.id), task, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteSecondaryTaskDoc(userId: string, taskId: string): Promise<void> {
  if (!userId || !taskId) return;
  await deleteDoc(doc(db, 'planners', userId, 'secondaryTasks', taskId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveTodoListDoc(userId: string, todo: NoteItem): Promise<void> {
  if (!userId || !todo.id) return;
  await setDoc(doc(db, 'planners', userId, 'todoList', todo.id), todo, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteTodoItemDoc(userId: string, todoId: string): Promise<void> {
  if (!userId || !todoId) return;
  await deleteDoc(doc(db, 'planners', userId, 'todoList', todoId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveTimeboxDoc(userId: string, entry: any): Promise<void> {
  if (!userId || !entry.id) return;
  await setDoc(doc(db, 'planners', userId, 'timebox', entry.id), entry, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteTimeboxDoc(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  await deleteDoc(doc(db, 'planners', userId, 'timebox', entryId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function savePostponedEventDoc(userId: string, event: PostponedEvent): Promise<void> {
  if (!userId || !event.id) return;
  await setDoc(doc(db, 'planners', userId, 'postponedEvents', event.id), event, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deletePostponedEventDoc(userId: string, eventId: string): Promise<void> {
  if (!userId || !eventId) return;
  await deleteDoc(doc(db, 'planners', userId, 'postponedEvents', eventId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveWeeklyEventDoc(userId: string, event: NoteItem): Promise<void> {
  if (!userId || !event.id) return;
  await setDoc(doc(db, 'planners', userId, 'weeklyEvents', event.id), event, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteWeeklyEventDoc(userId: string, eventId: string): Promise<void> {
  if (!userId || !eventId) return;
  await deleteDoc(doc(db, 'planners', userId, 'weeklyEvents', eventId));
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function saveDailyThoughtDoc(userId: string, thought: NoteItem): Promise<void> {
  if (!userId || !thought.id) return;
  await setDoc(doc(db, 'planners', userId, 'dailyThoughts', thought.id), thought, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function deleteDailyThoughtDoc(userId: string, thoughtId: string): Promise<void> {
  if (!userId || !thoughtId) return;
  await deleteDoc(doc(db, 'planners', userId, 'dailyThoughts', thoughtId));
}

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

// -------------------------------------------------------------
// Phase C — Stats, Snapshots, Habits & Monthly Aggregation
// -------------------------------------------------------------

/**
 * C1. Saves daily numerical stats and task snapshot records for a changed day
 */
export async function saveDailyStatsAndSnapshot(
  userId: string, 
  dayKey: string, 
  data: Partial<PlannerData>
): Promise<void> {
  if (!userId || !dayKey) return;

  const { dateISO, weekIdentifier } = getISOFromWeekContext(data, dayKey);
  const tasksForDay: DailyTask[] = (data.dailyTasks && (data.dailyTasks as any)[dayKey]) || [];

  let tasksCompleted = 0;
  const tasksTotal = tasksForDay.length;
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
    const dayPomo = data.pomodoro.history.find((p: any) => normalizeToDateISO(p.date || p.timestamp) === dateISO);
    if (dayPomo) {
      focusMinutes = dayPomo.focusMinutes || dayPomo.minutes || 0;
    }
  }

  let waterMl = 0;
  if (data.waterTracker?.history && Array.isArray(data.waterTracker.history)) {
    const dayWater = data.waterTracker.history.find((w: any) => normalizeToDateISO(w.date || w.timestamp) === dateISO);
    if (dayWater) {
      waterMl = dayWater.amount || dayWater.waterMl || 0;
    }
  }

  let habitsCompleted = 0;
  let habitsTotal = 0;
  if (Array.isArray(data.reminders)) {
    data.reminders.forEach((r: ReminderItem) => {
      if (r.checkedDays && Array.isArray(r.checkedDays)) {
        habitsTotal++;
        if (r.checkedDays.includes(dayKey)) habitsCompleted++;
      } else if (r.dayProgress && r.dayProgress[dayKey] !== undefined) {
        habitsTotal++;
        if (Number(r.dayProgress[dayKey]) >= (r.targetCount || 1)) habitsCompleted++;
      }
    });
  }

  // 1. Daily Numerical Stats Doc (C1)
  const rollupRef = doc(db, 'planners', userId, 'dailyStats', dateISO);
  await setDoc(rollupRef, {
    date: dateISO,
    dayKey,
    weekIdentifier,
    tasksCompleted,
    tasksTotal,
    categoryBreakdown,
    focusMinutes,
    waterMl,
    habitsCompleted,
    habitsTotal,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 2. Daily Snapshots Doc with records array (C1)
  const records: Array<{
    id: string;
    kind: 'daily' | 'core' | 'secondary';
    text: string;
    status: 'pending' | 'completed' | 'failed';
    categoryId?: string;
    completionDate?: string;
  }> = [];

  tasksForDay.forEach(t => {
    records.push({
      id: t.id,
      kind: 'daily',
      text: t.textFa || t.textEn || '',
      status: t.status,
      categoryId: t.categoryId,
      completionDate: t.completionDate
    });
  });

  // Include coreTasks matching this day's weekday or deadline
  if (Array.isArray(data.coreTasks)) {
    data.coreTasks.forEach(ct => {
      const matchDay = ct.deadline?.weekday === dayKey;
      if (matchDay || (ct.status === 'completed' && ct.deadline)) {
        records.push({
          id: ct.id,
          kind: 'core',
          text: ct.title || ct.description || '',
          status: ct.status,
          categoryId: ct.categoryId
        });
      }
    });
  }

  // Include secondaryTasks matching this day's weekday or deadline
  if (Array.isArray(data.secondaryTasks)) {
    data.secondaryTasks.forEach(st => {
      const matchDay = st.deadline?.weekday === dayKey;
      if (matchDay || (st.status === 'completed' && st.deadline)) {
        records.push({
          id: st.id,
          kind: 'secondary',
          text: st.textFa || st.textEn || '',
          status: st.status,
          categoryId: st.categoryId,
          completionDate: st.completionDate
        });
      }
    });
  }

  const snapshotRef = doc(db, 'planners', userId, 'dailySnapshots', dateISO);
  await setDoc(snapshotRef, {
    date: dateISO,
    dayKey,
    weekIdentifier,
    records,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 3. Monthly Aggregate Stats Rollup (C3)
  await updateMonthlyStats(userId, dateISO, tasksCompleted, tasksTotal);
}

/**
 * C3. Aggregates monthly stats without field explosion
 */
export async function updateMonthlyStats(
  userId: string, 
  dateISO: string, 
  dailyCompleted: number, 
  dailyTotal: number
): Promise<void> {
  const monthKey = dateISO.slice(0, 7); // YYYY-MM
  const monthRef = doc(db, 'planners', userId, 'monthlyStats', monthKey);
  try {
    const snap = await getDoc(monthRef);
    let prevDays: Record<string, { completed: number; total: number }> = {};
    if (snap.exists()) {
      const d = snap.data();
      prevDays = d.days || {};
    }
    prevDays[dateISO] = { completed: dailyCompleted, total: dailyTotal };

    let sumComp = 0;
    let sumTot = 0;
    const dayKeys = Object.keys(prevDays);
    for (const k of dayKeys) {
      sumComp += (prevDays[k]?.completed || 0);
      sumTot += (prevDays[k]?.total || 0);
    }

    await setDoc(monthRef, {
      month: monthKey,
      tasksCompleted: sumComp,
      tasksTotal: sumTot,
      daysPresent: dayKeys.length,
      days: prevDays,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('[Monthly Stats Warning] Could not update monthly rollup:', err);
  }
}

/**
 * C2. Updates habitTracking/{weekStartDate} with cells matrix
 */
export async function syncHabitTrackingDoc(userId: string, data: Partial<PlannerData>): Promise<void> {
  if (!userId || !Array.isArray(data.reminders)) return;
  const { weekIdentifier } = getISOFromWeekContext(data, 'saturday');
  const cells: Record<string, Record<string, number>> = {};

  data.reminders.forEach((r: ReminderItem) => {
    if (!r.id) return;
    cells[r.id] = {};
    if (r.dayProgress) {
      for (const [dKey, prog] of Object.entries(r.dayProgress)) {
        cells[r.id][dKey] = Number(prog) || 0;
      }
    } else if (r.checkedDays && Array.isArray(r.checkedDays)) {
      for (const dKey of r.checkedDays) {
        cells[r.id][dKey] = 1;
      }
    }
  });

  const ref = doc(db, 'planners', userId, 'habitTracking', weekIdentifier);
  await setDoc(ref, {
    weekStartDate: weekIdentifier,
    cells,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * C5. Prunes dailySnapshots older than 400 days once per month
 */
export async function pruneOldSnapshots(userId: string): Promise<void> {
  if (!userId || !isAuthValidForUser(userId, true)) return;
  try {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const lastPrune = localStorage.getItem('planner_last_prune');
    if (lastPrune === currentMonthKey) {
      return;
    }

    const cutoffISO = new Date(Date.now() - 400 * 86400000).toISOString().split('T')[0];
    const snap = await getDocs(collection(db, 'planners', userId, 'dailySnapshots'));
    const deletions: Promise<void>[] = [];

    snap.forEach(d => {
      const docDate = d.data().date || d.id;
      if (typeof docDate === 'string' && docDate < cutoffISO) {
        deletions.push(deleteDoc(d.ref));
      }
    });

    if (deletions.length > 0) {
      await Promise.all(deletions);
      console.log(`[Snapshot Pruning] Pruned ${deletions.length} old snapshots (< ${cutoffISO})`);
    }

    localStorage.setItem('planner_last_prune', currentMonthKey);
  } catch (err) {
    console.warn('[Snapshot Pruning Warning] Failed to prune old snapshots:', err);
  }
}

// -------------------------------------------------------------
// Phase A2 — Rewritten savePlannerSubcollections with Diff Engine
// -------------------------------------------------------------

/**
 * Saves planner data using the Mirror-Diff Engine:
 * computeDiff -> applyDiff -> stats/history rollups
 */
export async function savePlannerSubcollections(userId: string, data: Partial<PlannerData>): Promise<void> {
  if (!userId) return;

  if (!isAuthValidForUser(userId, true)) {
    queuePendingSync(userId, data);
    return;
  }

  // 1. Compute and apply diff
  const diff = computeDiff(userId, data);
  await applyDiff(userId, diff, data);

  // 2. Phase C1 & C3: Daily Stats, Snapshots and Monthly Stats for changed days
  if (diff.changedStatusDays.length > 0) {
    for (const dayKey of diff.changedStatusDays) {
      try {
        await saveDailyStatsAndSnapshot(userId, dayKey, data);
      } catch (err) {
        console.warn(`[Stats Sync Warning] Failed to write daily stats for ${dayKey}:`, err);
      }
    }
  }

  // 3. Phase C2: Habit Tracking rollup
  if (Array.isArray(data.reminders)) {
    try {
      await syncHabitTrackingDoc(userId, data);
    } catch (err) {
      console.warn('[Habit Sync Warning] Failed to sync habit tracking:', err);
    }
  }

  // 4. Save unbounded history subcollections (if arrays provided)
  if (data.pomodoro?.history && Array.isArray(data.pomodoro.history)) {
    for (let idx = 0; idx < data.pomodoro.history.length; idx++) {
      const entry = data.pomodoro.history[idx];
      const dateKey = entry.date || entry.timestamp || `pomo_day_${idx}`;
      await savePomodoroHistoryDoc(userId, String(dateKey), entry);
    }
  }

  if (data.waterTracker?.history && Array.isArray(data.waterTracker.history)) {
    for (let idx = 0; idx < data.waterTracker.history.length; idx++) {
      const entry = data.waterTracker.history[idx];
      const dateKey = entry.date || entry.timestamp || `water_day_${idx}`;
      await saveWaterTrackerHistoryDoc(userId, String(dateKey), entry);
    }
  }

  // 5. Parent doc size audit
  await auditPlannerDocSize(userId);
}

// -------------------------------------------------------------
// Phase B — Two-Wave Subscription + Lightweight Debounced Notify
// -------------------------------------------------------------

export function subscribeToPlannerSubcollections(
  userId: string,
  onDataCombined: (data: Partial<PlannerData>) => void,
  onError?: (error: Error) => void
): () => void {
  if (!userId || !isAuthValidForUser(userId)) return () => {};

  let settingsData: Record<string, any> = {};
  let settingsReady = false;
  const readyCollections = new Set<string>();

  let categoriesList: Category[] = [];
  let classesScheduleList: ClassSlot[] = [];
  let dailyTasksMap: Record<string, DailyTask[]> = {
    saturday: [], sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: []
  };
  let coreTasksList: CoreTask[] = [];
  let secondaryTasksList: SecondaryTask[] = [];
  let remindersList: ReminderItem[] = [];

  // Wave 2 data
  let detailsColumnsList: DetailsColumn[] = [];
  let examColumnsList: DetailsColumn[] = [];
  let secondaryTaskColumnsList: SecondaryTaskColumn[] = [];
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

  const allUnsubs: (() => void)[] = [];
  let wave2Timer: ReturnType<typeof setTimeout> | null = null;
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  // B2: Debounced notify (trailing 300ms) with mirror sync
  const scheduleNotify = () => {
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      const combinedData: Partial<PlannerData> = {};

      if (settingsReady) {
        const { pomodoro: _pomo, waterTracker: _water, ...cleanSettings } = settingsData;
        Object.assign(combinedData, cleanSettings);
      }

      if (readyCollections.has('categories')) {
        combinedData.categories = categoriesList;
      }
      if (readyCollections.has('classesSchedule')) {
        combinedData.classesSchedule = classesScheduleList;
      }
      if (readyCollections.has('dailyTasks')) {
        combinedData.dailyTasks = dailyTasksMap;
      }
      if (readyCollections.has('coreTasks')) {
        combinedData.coreTasks = coreTasksList;
      }
      if (readyCollections.has('secondaryTasks')) {
        combinedData.secondaryTasks = secondaryTasksList;
      }
      if (readyCollections.has('secondaryColumns')) {
        combinedData.secondaryTaskColumns = secondaryTaskColumnsList;
      }
      if (readyCollections.has('reminders')) {
        combinedData.reminders = remindersList;
      }
      if (readyCollections.has('goals')) {
        const combinedGoals: Goal[] = goalsTopLevelList.map(goal => {
          const phases = goalPhasesMap.get(goal.goal_id) || [];
          return {
            ...goal,
            phases
          };
        });
        combinedData.goals = combinedGoals;
      }
      if (readyCollections.has('detailsColumns')) {
        combinedData.detailsColumns = detailsColumnsList;
      }
      if (readyCollections.has('examColumns')) {
        combinedData.examColumns = examColumnsList;
      }
      if (readyCollections.has('todoList')) {
        combinedData.todoList = todoListItems;
      }
      if (readyCollections.has('timebox')) {
        combinedData.timebox = timeboxEntries;
      }
      if (readyCollections.has('postponedEvents')) {
        combinedData.postponedEvents = postponedEventsList;
      }
      if (readyCollections.has('weeklyEvents')) {
        combinedData.weeklyEvents = weeklyEventsList;
      }
      if (readyCollections.has('dailyThoughts')) {
        combinedData.dailyThoughts = dailyThoughtsList;
      }
      if (readyCollections.has('pomodoroHistory')) {
        combinedData.pomodoro = {
          ...(settingsData.pomodoro || {}),
          history: pomodoroHistoryList
        };
      }
      if (readyCollections.has('waterTrackerHistory')) {
        combinedData.waterTracker = {
          ...(settingsData.waterTracker || {}),
          history: waterTrackerHistoryList
        };
      }
      if (readyCollections.has('habitTracking')) {
        combinedData.habitTracking = habitTrackingMap;
      }

      // Update local mirror before invoking callback to prevent echo (B2)
      updateMirrorFromSnapshot(userId, combinedData);
      onDataCombined(combinedData);
    }, 300);
  };

  // ---------------------------------------------------------
  // WAVE 1: Immediate Listeners
  // settings(parent), categories, classesSchedule, dailyTasks, coreTasks, secondaryTasks, reminders
  // ---------------------------------------------------------

  // 1. Parent settings
  allUnsubs.push(
    onSnapshot(doc(db, 'planners', userId), (snap) => {
      settingsReady = true;
      if (snap.exists()) {
        const { data: _oldBlob, ...cleanSettings } = snap.data();
        settingsData = cleanSettings;
        scheduleNotify();
      }
    }, onError)
  );

  // 2. Categories
  allUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'categories'), (snap) => {
      const isFirst = !readyCollections.has('categories');
      readyCollections.add('categories');
      if (!isFirst && snap.docChanges().length === 0) return;
      categoriesList = snap.docs.map(d => d.data() as Category);
      scheduleNotify();
    }, onError)
  );

  // 3. Classes Schedule
  allUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'classesSchedule'), (snap) => {
      const isFirst = !readyCollections.has('classesSchedule');
      readyCollections.add('classesSchedule');
      if (!isFirst && snap.docChanges().length === 0) return;
      classesScheduleList = snap.docs.map(d => d.data() as ClassSlot);
      scheduleNotify();
    }, onError)
  );

  // 4. Daily Tasks
  allUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'dailyTasks'), (snap) => {
      const isFirst = !readyCollections.has('dailyTasks');
      readyCollections.add('dailyTasks');
      if (!isFirst && snap.docChanges().length === 0) return;
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
      scheduleNotify();
    }, onError)
  );

  // 5. Core Tasks
  allUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'coreTasks'), (snap) => {
      const isFirst = !readyCollections.has('coreTasks');
      readyCollections.add('coreTasks');
      if (!isFirst && snap.docChanges().length === 0) return;
      coreTasksList = snap.docs.map(d => d.data() as CoreTask);
      scheduleNotify();
    }, onError)
  );

  // 6. Secondary Tasks
  allUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'secondaryTasks'), (snap) => {
      const isFirst = !readyCollections.has('secondaryTasks');
      readyCollections.add('secondaryTasks');
      if (!isFirst && snap.docChanges().length === 0) return;
      secondaryTasksList = snap.docs.map(d => d.data() as SecondaryTask);
      scheduleNotify();
    }, onError)
  );

  // 7. Reminders
  allUnsubs.push(
    onSnapshot(collection(db, 'planners', userId, 'reminders'), (snap) => {
      const isFirst = !readyCollections.has('reminders');
      readyCollections.add('reminders');
      if (!isFirst && snap.docChanges().length === 0) return;
      remindersList = snap.docs.map(d => d.data() as ReminderItem);
      scheduleNotify();
    }, onError)
  );

  // ---------------------------------------------------------
  // WAVE 2: Deferred Listeners (setTimeout 3000ms after Wave 1)
  // detailsColumns, examColumns, goals (+ phases), secondaryColumns, postponedEvents,
  // todoList, weeklyEvents, dailyThoughts, pomodoroHistory, waterTrackerHistory, habitTracking
  // ---------------------------------------------------------

  wave2Timer = setTimeout(() => {
    // 8. Details Columns
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'detailsColumns'), (snap) => {
        const isFirst = !readyCollections.has('detailsColumns');
        readyCollections.add('detailsColumns');
        if (!isFirst && snap.docChanges().length === 0) return;
        detailsColumnsList = snap.docs.map(d => d.data() as DetailsColumn);
        scheduleNotify();
      }, onError)
    );

    // 9. Exam Columns
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'examColumns'), (snap) => {
        const isFirst = !readyCollections.has('examColumns');
        readyCollections.add('examColumns');
        if (!isFirst && snap.docChanges().length === 0) return;
        examColumnsList = snap.docs.map(d => d.data() as DetailsColumn);
        scheduleNotify();
      }, onError)
    );

    // 10. Secondary Columns
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'secondaryColumns'), (snap) => {
        const isFirst = !readyCollections.has('secondaryColumns');
        readyCollections.add('secondaryColumns');
        if (!isFirst && snap.docChanges().length === 0) return;
        secondaryTaskColumnsList = snap.docs.map(d => d.data() as SecondaryTaskColumn);
        scheduleNotify();
      }, onError)
    );

    // 11. Goals & Subcollection Phases
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'goals'), (snap) => {
        const isFirst = !readyCollections.has('goals');
        readyCollections.add('goals');
        if (!isFirst && snap.docChanges().length === 0) return;
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
              scheduleNotify();
            }, onError);
            phaseUnsubs.set(goalId, unsubPhase);
          }
        });

        scheduleNotify();
      }, onError)
    );

    // 12. Postponed Events
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'postponedEvents'), (snap) => {
        const isFirst = !readyCollections.has('postponedEvents');
        readyCollections.add('postponedEvents');
        if (!isFirst && snap.docChanges().length === 0) return;
        postponedEventsList = snap.docs.map(d => d.data() as PostponedEvent);
        scheduleNotify();
      }, onError)
    );

    // 13. Todo List
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'todoList'), (snap) => {
        const isFirst = !readyCollections.has('todoList');
        readyCollections.add('todoList');
        if (!isFirst && snap.docChanges().length === 0) return;
        todoListItems = snap.docs.map(d => d.data() as NoteItem);
        scheduleNotify();
      }, onError)
    );

    // 14. Weekly Events
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'weeklyEvents'), (snap) => {
        const isFirst = !readyCollections.has('weeklyEvents');
        readyCollections.add('weeklyEvents');
        if (!isFirst && snap.docChanges().length === 0) return;
        weeklyEventsList = snap.docs.map(d => d.data() as NoteItem);
        scheduleNotify();
      }, onError)
    );

    // 15. Daily Thoughts
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'dailyThoughts'), (snap) => {
        const isFirst = !readyCollections.has('dailyThoughts');
        readyCollections.add('dailyThoughts');
        if (!isFirst && snap.docChanges().length === 0) return;
        dailyThoughtsList = snap.docs.map(d => d.data() as NoteItem);
        scheduleNotify();
      }, onError)
    );

    // 16. Pomodoro History
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'pomodoroHistory'), (snap) => {
        const isFirst = !readyCollections.has('pomodoroHistory');
        readyCollections.add('pomodoroHistory');
        if (!isFirst && snap.docChanges().length === 0) return;
        pomodoroHistoryList = snap.docs.map(d => d.data());
        scheduleNotify();
      }, onError)
    );

    // 17. WaterTracker History
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'waterTrackerHistory'), (snap) => {
        const isFirst = !readyCollections.has('waterTrackerHistory');
        readyCollections.add('waterTrackerHistory');
        if (!isFirst && snap.docChanges().length === 0) return;
        waterTrackerHistoryList = snap.docs.map(d => d.data());
        scheduleNotify();
      }, onError)
    );

    // 18. Habit Tracking
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'habitTracking'), (snap) => {
        const isFirst = !readyCollections.has('habitTracking');
        readyCollections.add('habitTracking');
        if (!isFirst && snap.docChanges().length === 0) return;
        const map: Record<string, any> = {};
        snap.docs.forEach(d => {
          map[d.id] = d.data();
        });
        habitTrackingMap = map;
        scheduleNotify();
      }, onError)
    );

    // 19. Timebox
    allUnsubs.push(
      onSnapshot(collection(db, 'planners', userId, 'timebox'), (snap) => {
        const isFirst = !readyCollections.has('timebox');
        readyCollections.add('timebox');
        if (!isFirst && snap.docChanges().length === 0) return;
        timeboxEntries = snap.docs.map(d => d.data());
        scheduleNotify();
      }, onError)
    );
  }, 3000);

  // Return master unsubscribe
  return () => {
    if (wave2Timer) clearTimeout(wave2Timer);
    if (notifyTimer) clearTimeout(notifyTimer);
    readyCollections.clear();
    settingsReady = false;
    allUnsubs.forEach(unsub => unsub());
    phaseUnsubs.forEach(unsub => unsub());
    phaseUnsubs.clear();
    goalPhasesMap.clear();
  };
}

const migratedUsersSet = new Set<string>();

/**
 * One-time Migration Routine
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

    // Save using new engine
    await savePlannerSubcollections(userId, sourceData);

    // Clean up monolithic 'data' blob
    try {
      await updateDoc(parentRef, {
        data: deleteField()
      });
      console.log(`[Migration] Cleaned up monolithic 'data' map from /planners/${userId}`);
    } catch (cleanErr) {
      console.error(`[Migration Warning] Could not remove 'data' field from /planners/${userId}:`, cleanErr);
    }

    await auditPlannerDocSize(userId);
    return { success: true, migratedCounts: counts };
  } catch (err) {
    console.error(`[Migration Error] Failed to migrate planner for user ${userId}:`, err);
    return { success: false, migratedCounts: counts };
  }
}
