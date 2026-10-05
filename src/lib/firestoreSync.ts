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
  PostponedEvent,
  HabitTrackingWeekDoc
} from '../types.ts';
import {
  computeDiff,
  applyDiff,
  updateMirrorFromSnapshot,
  resetMirror,
  sanitizePhaseForStorage,
  extractScalarSettings,
  hashContent,
  normalizeToDateISO,
  isValidDateValue
} from './plannerSyncEngine.ts';

export { resetMirror, normalizeToDateISO, isValidDateValue };

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

/** 
 * @deprecated Use savePlannerSubcollections with diff engine.
 * NOTE: The active canonical collection in Firestore is 'secondaryColumns' (used by computeDiff and listeners).
 * This function also writes to 'secondaryColumns' to prevent fragmentation while retaining backwards compatibility.
 */
export async function saveSecondaryTaskColumnDoc(userId: string, column: SecondaryTaskColumn): Promise<void> {
  if (!userId || !column.id) return;
  await setDoc(doc(db, 'planners', userId, 'secondaryColumns', column.id), column, { merge: true });
}

/** 
 * @deprecated Use savePlannerSubcollections with diff engine.
 * NOTE: The active canonical collection in Firestore is 'secondaryColumns' (used by computeDiff and listeners).
 * This function also deletes from 'secondaryColumns' to retain backwards compatibility.
 */
export async function deleteSecondaryTaskColumnDoc(userId: string, columnId: string): Promise<void> {
  if (!userId || !columnId) return;
  await deleteDoc(doc(db, 'planners', userId, 'secondaryColumns', columnId));
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

/** @deprecated Use savePlannerSubcollections with diff engine */
export async function savePomodoroHistoryDoc(userId: string, rawDateKey: string, entry: any): Promise<void> {
  if (!userId || !rawDateKey) return;
  const dateISO = normalizeToDateISO(rawDateKey);
  const ref = doc(db, 'planners', userId, 'pomodoroHistory', dateISO);
  await setDoc(ref, { ...entry, date: dateISO, updatedAt: new Date().toISOString() }, { merge: true });
}

/** @deprecated Use savePlannerSubcollections with diff engine */
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
    const dayPomo = data.pomodoro.history.find((p: any) => {
      const raw = p.date || p.timestamp || p.dateKey;
      return raw && isValidDateValue(raw) && normalizeToDateISO(raw) === dateISO;
    });
    if (dayPomo) {
      focusMinutes = dayPomo.focusMinutes || dayPomo.minutes || 0;
    }
  }

  let waterMl = 0;
  if (data.waterTracker?.history && Array.isArray(data.waterTracker.history)) {
    const dayWater = data.waterTracker.history.find((w: any) => {
      const raw = w.date || w.timestamp || w.dateKey;
      return raw && isValidDateValue(raw) && normalizeToDateISO(raw) === dateISO;
    });
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

/**
 * Idempotent one-time cleanup to remove subcollection arrays that leaked into parent doc planners/{uid}
 */
export async function cleanupLeakedParentFields(userId: string): Promise<void> {
  if (!userId || !isAuthValidForUser(userId, true)) return;
  try {
    const snap = await getDoc(doc(db, 'planners', userId));
    if (!snap.exists()) return;
    const leaked: Record<string, any> = {};
    const d = snap.data();
    // هر کلیدی که باید در زیرکالکشن باشد ولی در والد درز کرده:
    for (const key of ['coreTasks', 'secondaryTasks', 'todoList',
                       'weeklyEvents', 'dailyThoughts', 'postponedEvents',
                       'categories', 'classesSchedule', 'reminders',
                       'detailsColumns', 'examColumns']) {
      if (d[key] !== undefined) leaked[key] = deleteField();
    }
    if (Object.keys(leaked).length === 0) return;
    await updateDoc(doc(db, 'planners', userId), leaked);
    console.log(`[Parent Cleanup] Removed leaked fields: ${Object.keys(leaked).join(', ')}`);
  } catch (err) {
    console.warn('[Parent Cleanup Warning]', err);
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

  // 4. Parent doc size audit
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
  let habitTrackingMap: Record<string, HabitTrackingWeekDoc> = {};

  let goalsTopLevelList: Goal[] = [];
  const phaseUnsubs = new Map<string, () => void>();
  const goalPhasesMap = new Map<string, GoalPhase[]>();

  const allUnsubs: (() => void)[] = [];
  const listenerRetries = new Map<string, number>();
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let isUnsubscribed = false;
  let wave2Timer: ReturnType<typeof setTimeout> | null = null;
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  const handleListenerError = (colName: string, err: any, retryFn: () => void) => {
    if (isUnsubscribed) return;
    const count = listenerRetries.get(colName) || 0;
    console.warn(`[Firestore Listener Resilience] Error on '${colName}' (attempt ${count + 1}/5):`, err);
    if (count < 5) {
      listenerRetries.set(colName, count + 1);
      const delay = 2000 * Math.pow(2, count); // 2s, 4s, 8s, 16s, 32s
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        if (!isUnsubscribed) {
          retryFn();
        }
      }, delay);
      retryTimers.add(timer);
    } else {
      console.error(`[Firestore Listener Resilience] '${colName}' exceeded max retries (5). Notifying consumer.`);
      if (onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

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
  // WAVE 1: Immediate Listeners (7 listeners with resilience)
  // settings(parent), categories, classesSchedule, dailyTasks, coreTasks, secondaryTasks, reminders
  // ---------------------------------------------------------

  // 1. Parent settings
  let parentUnsub: (() => void) | null = null;
  const startParentListener = () => {
    if (isUnsubscribed) return;
    if (parentUnsub) {
      const idx = allUnsubs.indexOf(parentUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { parentUnsub(); } catch (_) {}
    }
    parentUnsub = onSnapshot(doc(db, 'planners', userId), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('parent');
      if (snap.metadata.hasPendingWrites) return;
      settingsReady = true;
      if (snap.exists()) {
        const { data: _oldBlob, ...cleanSettings } = snap.data();
        settingsData = cleanSettings;
        scheduleNotify();
      }
    }, (err) => handleListenerError('parent', err, startParentListener));
    allUnsubs.push(parentUnsub);
  };
  startParentListener();

  // 2. Categories
  let categoriesUnsub: (() => void) | null = null;
  const startCategoriesListener = () => {
    if (isUnsubscribed) return;
    if (categoriesUnsub) {
      const idx = allUnsubs.indexOf(categoriesUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { categoriesUnsub(); } catch (_) {}
    }
    categoriesUnsub = onSnapshot(collection(db, 'planners', userId, 'categories'), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('categories');
      if (snap.metadata.hasPendingWrites) return;
      const isFirst = !readyCollections.has('categories');
      readyCollections.add('categories');
      if (!isFirst && snap.docChanges().length === 0) return;
      categoriesList = snap.docs.map(d => d.data() as Category);
      scheduleNotify();
    }, (err) => handleListenerError('categories', err, startCategoriesListener));
    allUnsubs.push(categoriesUnsub);
  };
  startCategoriesListener();

  // 3. Classes Schedule
  let classesScheduleUnsub: (() => void) | null = null;
  const startClassesScheduleListener = () => {
    if (isUnsubscribed) return;
    if (classesScheduleUnsub) {
      const idx = allUnsubs.indexOf(classesScheduleUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { classesScheduleUnsub(); } catch (_) {}
    }
    classesScheduleUnsub = onSnapshot(collection(db, 'planners', userId, 'classesSchedule'), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('classesSchedule');
      if (snap.metadata.hasPendingWrites) return;
      const isFirst = !readyCollections.has('classesSchedule');
      readyCollections.add('classesSchedule');
      if (!isFirst && snap.docChanges().length === 0) return;
      classesScheduleList = snap.docs.map(d => d.data() as ClassSlot);
      scheduleNotify();
    }, (err) => handleListenerError('classesSchedule', err, startClassesScheduleListener));
    allUnsubs.push(classesScheduleUnsub);
  };
  startClassesScheduleListener();

  // 4. Daily Tasks
  let dailyTasksUnsub: (() => void) | null = null;
  const startDailyTasksListener = () => {
    if (isUnsubscribed) return;
    if (dailyTasksUnsub) {
      const idx = allUnsubs.indexOf(dailyTasksUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { dailyTasksUnsub(); } catch (_) {}
    }
    dailyTasksUnsub = onSnapshot(collection(db, 'planners', userId, 'dailyTasks'), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('dailyTasks');
      if (snap.metadata.hasPendingWrites) return;
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
    }, (err) => handleListenerError('dailyTasks', err, startDailyTasksListener));
    allUnsubs.push(dailyTasksUnsub);
  };
  startDailyTasksListener();

  // 5. Core Tasks
  let coreTasksUnsub: (() => void) | null = null;
  const startCoreTasksListener = () => {
    if (isUnsubscribed) return;
    if (coreTasksUnsub) {
      const idx = allUnsubs.indexOf(coreTasksUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { coreTasksUnsub(); } catch (_) {}
    }
    coreTasksUnsub = onSnapshot(collection(db, 'planners', userId, 'coreTasks'), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('coreTasks');
      if (snap.metadata.hasPendingWrites) return;
      const isFirst = !readyCollections.has('coreTasks');
      readyCollections.add('coreTasks');
      if (!isFirst && snap.docChanges().length === 0) return;
      coreTasksList = snap.docs.map(d => d.data() as CoreTask);
      scheduleNotify();
    }, (err) => handleListenerError('coreTasks', err, startCoreTasksListener));
    allUnsubs.push(coreTasksUnsub);
  };
  startCoreTasksListener();

  // 6. Secondary Tasks
  let secondaryTasksUnsub: (() => void) | null = null;
  const startSecondaryTasksListener = () => {
    if (isUnsubscribed) return;
    if (secondaryTasksUnsub) {
      const idx = allUnsubs.indexOf(secondaryTasksUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { secondaryTasksUnsub(); } catch (_) {}
    }
    secondaryTasksUnsub = onSnapshot(collection(db, 'planners', userId, 'secondaryTasks'), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('secondaryTasks');
      if (snap.metadata.hasPendingWrites) return;
      const isFirst = !readyCollections.has('secondaryTasks');
      readyCollections.add('secondaryTasks');
      if (!isFirst && snap.docChanges().length === 0) return;
      secondaryTasksList = snap.docs.map(d => d.data() as SecondaryTask);
      scheduleNotify();
    }, (err) => handleListenerError('secondaryTasks', err, startSecondaryTasksListener));
    allUnsubs.push(secondaryTasksUnsub);
  };
  startSecondaryTasksListener();

  // 7. Reminders
  let remindersUnsub: (() => void) | null = null;
  const startRemindersListener = () => {
    if (isUnsubscribed) return;
    if (remindersUnsub) {
      const idx = allUnsubs.indexOf(remindersUnsub);
      if (idx !== -1) allUnsubs.splice(idx, 1);
      try { remindersUnsub(); } catch (_) {}
    }
    remindersUnsub = onSnapshot(collection(db, 'planners', userId, 'reminders'), { includeMetadataChanges: true }, (snap) => {
      listenerRetries.delete('reminders');
      if (snap.metadata.hasPendingWrites) return;
      const isFirst = !readyCollections.has('reminders');
      readyCollections.add('reminders');
      if (!isFirst && snap.docChanges().length === 0) return;
      remindersList = snap.docs.map(d => d.data() as ReminderItem);
      scheduleNotify();
    }, (err) => handleListenerError('reminders', err, startRemindersListener));
    allUnsubs.push(remindersUnsub);
  };
  startRemindersListener();

  // ---------------------------------------------------------
  // WAVE 2: Deferred Listeners (setTimeout 3000ms after Wave 1)
  // detailsColumns, examColumns, secondaryColumns, goals (+ phases), postponedEvents,
  // todoList, weeklyEvents, dailyThoughts, pomodoroHistory, waterTrackerHistory, habitTracking, timebox
  // ---------------------------------------------------------

  wave2Timer = setTimeout(() => {
    if (isUnsubscribed) return;

    // 8. Details Columns
    let detailsColumnsUnsub: (() => void) | null = null;
    const startDetailsColumnsListener = () => {
      if (isUnsubscribed) return;
      if (detailsColumnsUnsub) {
        const idx = allUnsubs.indexOf(detailsColumnsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { detailsColumnsUnsub(); } catch (_) {}
      }
      detailsColumnsUnsub = onSnapshot(collection(db, 'planners', userId, 'detailsColumns'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('detailsColumns');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('detailsColumns');
        readyCollections.add('detailsColumns');
        if (!isFirst && snap.docChanges().length === 0) return;
        detailsColumnsList = snap.docs.map(d => d.data() as DetailsColumn);
        scheduleNotify();
      }, (err) => handleListenerError('detailsColumns', err, startDetailsColumnsListener));
      allUnsubs.push(detailsColumnsUnsub);
    };
    startDetailsColumnsListener();

    // 9. Exam Columns
    let examColumnsUnsub: (() => void) | null = null;
    const startExamColumnsListener = () => {
      if (isUnsubscribed) return;
      if (examColumnsUnsub) {
        const idx = allUnsubs.indexOf(examColumnsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { examColumnsUnsub(); } catch (_) {}
      }
      examColumnsUnsub = onSnapshot(collection(db, 'planners', userId, 'examColumns'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('examColumns');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('examColumns');
        readyCollections.add('examColumns');
        if (!isFirst && snap.docChanges().length === 0) return;
        examColumnsList = snap.docs.map(d => d.data() as DetailsColumn);
        scheduleNotify();
      }, (err) => handleListenerError('examColumns', err, startExamColumnsListener));
      allUnsubs.push(examColumnsUnsub);
    };
    startExamColumnsListener();

    // 10. Secondary Columns
    let secondaryColumnsUnsub: (() => void) | null = null;
    const startSecondaryColumnsListener = () => {
      if (isUnsubscribed) return;
      if (secondaryColumnsUnsub) {
        const idx = allUnsubs.indexOf(secondaryColumnsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { secondaryColumnsUnsub(); } catch (_) {}
      }
      secondaryColumnsUnsub = onSnapshot(collection(db, 'planners', userId, 'secondaryColumns'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('secondaryColumns');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('secondaryColumns');
        readyCollections.add('secondaryColumns');
        if (!isFirst && snap.docChanges().length === 0) return;
        secondaryTaskColumnsList = snap.docs.map(d => d.data() as SecondaryTaskColumn);
        scheduleNotify();
      }, (err) => handleListenerError('secondaryColumns', err, startSecondaryColumnsListener));
      allUnsubs.push(secondaryColumnsUnsub);
    };
    startSecondaryColumnsListener();

    // 11. Goals & Subcollection Phases
    const startGoalPhaseListener = (goalId: string, currentGoalIds: Set<string>) => {
      if (isUnsubscribed) return;
      const colKey = `goalPhase_${goalId}`;
      const phasesCol = collection(db, 'planners', userId, 'goals', goalId, 'phases');
      const unsubPhase = onSnapshot(phasesCol, { includeMetadataChanges: true }, (phaseSnap) => {
        listenerRetries.delete(colKey);
        if (phaseSnap.metadata.hasPendingWrites) return;
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
      }, (err) => {
        if (currentGoalIds.has(goalId)) {
          handleListenerError(colKey, err, () => startGoalPhaseListener(goalId, currentGoalIds));
        }
      });
      phaseUnsubs.set(goalId, unsubPhase);
    };

    let goalsUnsub: (() => void) | null = null;
    const startGoalsListener = () => {
      if (isUnsubscribed) return;
      if (goalsUnsub) {
        const idx = allUnsubs.indexOf(goalsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { goalsUnsub(); } catch (_) {}
      }
      goalsUnsub = onSnapshot(collection(db, 'planners', userId, 'goals'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('goals');
        if (snap.metadata.hasPendingWrites) return;
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
            listenerRetries.delete(`goalPhase_${goalId}`);
          }
        }

        snap.docs.forEach(goalDoc => {
          const goalId = goalDoc.id;
          if (!phaseUnsubs.has(goalId)) {
            startGoalPhaseListener(goalId, currentGoalIds);
          }
        });

        scheduleNotify();
      }, (err) => handleListenerError('goals', err, startGoalsListener));
      allUnsubs.push(goalsUnsub);
    };
    startGoalsListener();

    // 12. Postponed Events
    let postponedEventsUnsub: (() => void) | null = null;
    const startPostponedEventsListener = () => {
      if (isUnsubscribed) return;
      if (postponedEventsUnsub) {
        const idx = allUnsubs.indexOf(postponedEventsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { postponedEventsUnsub(); } catch (_) {}
      }
      postponedEventsUnsub = onSnapshot(collection(db, 'planners', userId, 'postponedEvents'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('postponedEvents');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('postponedEvents');
        readyCollections.add('postponedEvents');
        if (!isFirst && snap.docChanges().length === 0) return;
        postponedEventsList = snap.docs.map(d => d.data() as PostponedEvent);
        scheduleNotify();
      }, (err) => handleListenerError('postponedEvents', err, startPostponedEventsListener));
      allUnsubs.push(postponedEventsUnsub);
    };
    startPostponedEventsListener();

    // 13. Todo List
    let todoListUnsub: (() => void) | null = null;
    const startTodoListListener = () => {
      if (isUnsubscribed) return;
      if (todoListUnsub) {
        const idx = allUnsubs.indexOf(todoListUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { todoListUnsub(); } catch (_) {}
      }
      todoListUnsub = onSnapshot(collection(db, 'planners', userId, 'todoList'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('todoList');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('todoList');
        readyCollections.add('todoList');
        if (!isFirst && snap.docChanges().length === 0) return;
        todoListItems = snap.docs.map(d => d.data() as NoteItem);
        scheduleNotify();
      }, (err) => handleListenerError('todoList', err, startTodoListListener));
      allUnsubs.push(todoListUnsub);
    };
    startTodoListListener();

    // 14. Weekly Events
    let weeklyEventsUnsub: (() => void) | null = null;
    const startWeeklyEventsListener = () => {
      if (isUnsubscribed) return;
      if (weeklyEventsUnsub) {
        const idx = allUnsubs.indexOf(weeklyEventsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { weeklyEventsUnsub(); } catch (_) {}
      }
      weeklyEventsUnsub = onSnapshot(collection(db, 'planners', userId, 'weeklyEvents'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('weeklyEvents');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('weeklyEvents');
        readyCollections.add('weeklyEvents');
        if (!isFirst && snap.docChanges().length === 0) return;
        weeklyEventsList = snap.docs.map(d => d.data() as NoteItem);
        scheduleNotify();
      }, (err) => handleListenerError('weeklyEvents', err, startWeeklyEventsListener));
      allUnsubs.push(weeklyEventsUnsub);
    };
    startWeeklyEventsListener();

    // 15. Daily Thoughts
    let dailyThoughtsUnsub: (() => void) | null = null;
    const startDailyThoughtsListener = () => {
      if (isUnsubscribed) return;
      if (dailyThoughtsUnsub) {
        const idx = allUnsubs.indexOf(dailyThoughtsUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { dailyThoughtsUnsub(); } catch (_) {}
      }
      dailyThoughtsUnsub = onSnapshot(collection(db, 'planners', userId, 'dailyThoughts'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('dailyThoughts');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('dailyThoughts');
        readyCollections.add('dailyThoughts');
        if (!isFirst && snap.docChanges().length === 0) return;
        dailyThoughtsList = snap.docs.map(d => d.data() as NoteItem);
        scheduleNotify();
      }, (err) => handleListenerError('dailyThoughts', err, startDailyThoughtsListener));
      allUnsubs.push(dailyThoughtsUnsub);
    };
    startDailyThoughtsListener();

    // 16. Pomodoro History
    let pomodoroHistoryUnsub: (() => void) | null = null;
    const startPomodoroHistoryListener = () => {
      if (isUnsubscribed) return;
      if (pomodoroHistoryUnsub) {
        const idx = allUnsubs.indexOf(pomodoroHistoryUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { pomodoroHistoryUnsub(); } catch (_) {}
      }
      pomodoroHistoryUnsub = onSnapshot(collection(db, 'planners', userId, 'pomodoroHistory'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('pomodoroHistory');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('pomodoroHistory');
        readyCollections.add('pomodoroHistory');
        if (!isFirst && snap.docChanges().length === 0) return;
        pomodoroHistoryList = snap.docs.map(d => d.data());
        scheduleNotify();
      }, (err) => handleListenerError('pomodoroHistory', err, startPomodoroHistoryListener));
      allUnsubs.push(pomodoroHistoryUnsub);
    };
    startPomodoroHistoryListener();

    // 17. WaterTracker History
    let waterTrackerHistoryUnsub: (() => void) | null = null;
    const startWaterTrackerHistoryListener = () => {
      if (isUnsubscribed) return;
      if (waterTrackerHistoryUnsub) {
        const idx = allUnsubs.indexOf(waterTrackerHistoryUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { waterTrackerHistoryUnsub(); } catch (_) {}
      }
      waterTrackerHistoryUnsub = onSnapshot(collection(db, 'planners', userId, 'waterTrackerHistory'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('waterTrackerHistory');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('waterTrackerHistory');
        readyCollections.add('waterTrackerHistory');
        if (!isFirst && snap.docChanges().length === 0) return;
        waterTrackerHistoryList = snap.docs.map(d => d.data());
        scheduleNotify();
      }, (err) => handleListenerError('waterTrackerHistory', err, startWaterTrackerHistoryListener));
      allUnsubs.push(waterTrackerHistoryUnsub);
    };
    startWaterTrackerHistoryListener();

    // 18. Habit Tracking
    let habitTrackingUnsub: (() => void) | null = null;
    const startHabitTrackingListener = () => {
      if (isUnsubscribed) return;
      if (habitTrackingUnsub) {
        const idx = allUnsubs.indexOf(habitTrackingUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { habitTrackingUnsub(); } catch (_) {}
      }
      habitTrackingUnsub = onSnapshot(collection(db, 'planners', userId, 'habitTracking'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('habitTracking');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('habitTracking');
        readyCollections.add('habitTracking');
        if (!isFirst && snap.docChanges().length === 0) return;
        const map: Record<string, HabitTrackingWeekDoc> = {};
        snap.docs.forEach(d => {
          map[d.id] = d.data() as HabitTrackingWeekDoc;
        });
        habitTrackingMap = map;
        scheduleNotify();
      }, (err) => handleListenerError('habitTracking', err, startHabitTrackingListener));
      allUnsubs.push(habitTrackingUnsub);
    };
    startHabitTrackingListener();

    // 19. Timebox
    let timeboxUnsub: (() => void) | null = null;
    const startTimeboxListener = () => {
      if (isUnsubscribed) return;
      if (timeboxUnsub) {
        const idx = allUnsubs.indexOf(timeboxUnsub);
        if (idx !== -1) allUnsubs.splice(idx, 1);
        try { timeboxUnsub(); } catch (_) {}
      }
      timeboxUnsub = onSnapshot(collection(db, 'planners', userId, 'timebox'), { includeMetadataChanges: true }, (snap) => {
        listenerRetries.delete('timebox');
        if (snap.metadata.hasPendingWrites) return;
        const isFirst = !readyCollections.has('timebox');
        readyCollections.add('timebox');
        if (!isFirst && snap.docChanges().length === 0) return;
        timeboxEntries = snap.docs.map(d => d.data());
        scheduleNotify();
      }, (err) => handleListenerError('timebox', err, startTimeboxListener));
      allUnsubs.push(timeboxUnsub);
    };
    startTimeboxListener();
  }, 3000);

  // Return master unsubscribe
  return () => {
    isUnsubscribed = true;
    if (wave2Timer) clearTimeout(wave2Timer);
    if (notifyTimer) clearTimeout(notifyTimer);
    retryTimers.forEach(t => clearTimeout(t));
    retryTimers.clear();
    readyCollections.clear();
    settingsReady = false;
    allUnsubs.forEach(unsub => {
      try { unsub(); } catch (_) {}
    });
    allUnsubs.length = 0;
    phaseUnsubs.forEach(unsub => {
      try { unsub(); } catch (_) {}
    });
    phaseUnsubs.clear();
    goalPhasesMap.clear();
    listenerRetries.clear();
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
