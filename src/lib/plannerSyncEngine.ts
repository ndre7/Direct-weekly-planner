import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase.ts';
import { jalaliToGregorian } from '../utils/jalali.ts';
import { 
  PlannerData, 
  Category, 
  ClassSlot, 
  DailyTask, 
  ReminderItem, 
  Goal, 
  GoalPhase, 
  DetailsColumn, 
  SecondaryTaskColumn, 
  SecondaryTask, 
  CoreTask,
  NoteItem, 
  PostponedEvent 
} from '../types.ts';

export interface UserMirror {
  collections: Record<string, Map<string, string>>; // colName -> (docId -> hash)
  dailyTasks: Map<string, string>; // dayKey -> hash
  goalPhases: Map<string, Map<string, string>>; // goalId -> (phaseNum -> hash)
  pomoHistory: Map<string, string>; // dateISO -> hash
  waterHistory: Map<string, string>; // dateISO -> hash
  parentHash: string;
  // Status snapshot per dayKey for Phase C stats trigger
  dayStatusSnapshot: Map<string, string>; // dayKey -> statusSummaryHash
}

const userMirrors = new Map<string, UserMirror>();

export function getOrCreateMirror(userId: string): UserMirror {
  let mirror = userMirrors.get(userId);
  if (!mirror) {
    mirror = {
      collections: {},
      dailyTasks: new Map(),
      goalPhases: new Map(),
      pomoHistory: new Map(),
      waterHistory: new Map(),
      parentHash: '',
      dayStatusSnapshot: new Map()
    };
    userMirrors.set(userId, mirror);
  }
  return mirror;
}

export function resetMirror(userId: string): void {
  userMirrors.delete(userId);
}

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
 * Validates whether a given raw date value represents a plausible calendar date.
 */
export function isValidDateValue(val: any): boolean {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!str) return false;

  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return true;
  }

  // ISO Datetime string (2026-07-28T04:15:00...)
  if (str.includes('T') && !isNaN(Date.parse(str))) {
    return true;
  }

  // Numeric timestamp (positive ms)
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num > 100000000;
  }

  // Jalali format e.g. "1405/05/03" or "1405-05-03"
  const jalaliParts = str.split(/[/.\-]/);
  if (jalaliParts.length === 3) {
    const jy = Number(jalaliParts[0]);
    const jm = Number(jalaliParts[1]);
    const jd = Number(jalaliParts[2]);
    if (!isNaN(jy) && !isNaN(jm) && !isNaN(jd) && jy >= 1300 && jy <= 1500) {
      return true;
    }
  }

  return false;
}

/**
 * Fast, deterministic content hash for any JS object or primitive.
 */
export function hashContent(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : JSON.stringify(val);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function sanitizePhaseForStorage(phase: GoalPhase): GoalPhase {
  const sanitized = { ...phase };
  if (sanitized.weeks && sanitized.weeks.length > 0) {
    sanitized.tasks = [];
  }
  return sanitized;
}

export function extractScalarSettings(state: Partial<PlannerData>): Record<string, any> {
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
    coreTasks,
    todoList,
    timebox,
    postponedEvents,
    weeklyEvents,
    dailyThoughts,
    pomodoroHistory,
    waterTrackerHistory,
    habitTracking,
    data: _oldBlob,
    ...rest
  } = state as any;

  const scalarSettings: Record<string, any> = {};

  // Checklist of permitted scalar settings for parent doc
  const allowedScalarKeys = [
    'month', 'term', 'activeClassesOnly', 'quoteText', 'quoteAuthor',
    'classRows', 'dailyTaskRows', 'activeClassStatus', 'classStatusList', 'activeDayKeys',
    'classesTitle', 'dailyTasksTitle', 'detailsTitle', 'secondaryTitle', 'remindersTitle',
    'notesTitle', 'todoTitle', 'coreTasksTitle', 'examsAndPresentationsTitle',
    'emailRemindersGlobalEnabled', 'emailReminderDefaultOffset', 'reminderEmailTargetType',
    'reminderCustomEmail', 'notes', 'weekStartDay', 'weekEndDay', 'weekYear', 'weekEndYear',
    'weekMonth', 'weekEndMonth'
  ];

  for (const key of allowedScalarKeys) {
    if (key in rest && rest[key] !== undefined) {
      scalarSettings[key] = rest[key];
    }
  }

  // Handle pomodoro (without unbounded history)
  if (rest.pomodoro && typeof rest.pomodoro === 'object') {
    const { history, ...pomoScalars } = rest.pomodoro;
    scalarSettings.pomodoro = pomoScalars;
  } else if (rest.pomodoro !== undefined) {
    scalarSettings.pomodoro = rest.pomodoro;
  }

  // Handle waterTracker (without unbounded history)
  if (rest.waterTracker && typeof rest.waterTracker === 'object') {
    const { history, ...waterScalars } = rest.waterTracker;
    scalarSettings.waterTracker = waterScalars;
  } else if (rest.waterTracker !== undefined) {
    scalarSettings.waterTracker = rest.waterTracker;
  }

  // Ironclad guard: ensure no stray objects or arrays leak to parent doc (preserving 1MB limit)
  for (const [k, v] of Object.entries(scalarSettings)) {
    if (k !== 'pomodoro' && k !== 'waterTracker' && k !== 'classStatusList' && k !== 'activeDayKeys') {
      if (typeof v === 'object' && v !== null) {
        console.warn(`[Parent Doc Guard] Stripping unexpected non-scalar field '${k}' from parent document.`);
        delete scalarSettings[k];
      }
    }
  }

  return scalarSettings;
}

export interface DiffResult {
  toSet: Array<{ collection: string; id: string; data: any }>;
  toDelete: Array<{ collection: string; id: string }>;
  parentData?: Record<string, any>;
  phaseSets: Array<{ goalId: string; phaseNumber: string; data: GoalPhase }>;
  phaseDeletes: Array<{ goalId: string; phaseNumber: string }>;
  // Days where task statuses or completion dates changed (for Phase C)
  changedStatusDays: string[];
}

/**
 * Computes diff between desired state and the local mirror
 */
export function computeDiff(userId: string, state: Partial<PlannerData>): DiffResult {
  const mirror = getOrCreateMirror(userId);
  const toSet: Array<{ collection: string; id: string; data: any }> = [];
  const toDelete: Array<{ collection: string; id: string }> = [];
  const phaseSets: Array<{ goalId: string; phaseNumber: string; data: GoalPhase }> = [];
  const phaseDeletes: Array<{ goalId: string; phaseNumber: string }> = [];
  const changedStatusDays: string[] = [];

  // Helper for array item collections
  const diffListCollection = (
    colName: string, 
    items: any[] | undefined, 
    getId: (item: any) => string | undefined, 
    cleanData?: (item: any) => any
  ) => {
    if (!mirror.collections[colName]) {
      mirror.collections[colName] = new Map();
    }
    const colMirror = mirror.collections[colName];
    const presentIds = new Set<string>();

    if (Array.isArray(items)) {
      for (const item of items) {
        const id = getId(item);
        if (!id) continue;
        presentIds.add(id);

        const dataToSave = cleanData ? cleanData(item) : item;
        const currentHash = hashContent(dataToSave);
        const cachedHash = colMirror.get(id);

        if (cachedHash !== currentHash) {
          toSet.push({ collection: colName, id, data: dataToSave });
        }
      }
    }

    // Items in mirror but no longer in state
    for (const [cachedId] of colMirror.entries()) {
      if (!presentIds.has(cachedId)) {
        toDelete.push({ collection: colName, id: cachedId });
      }
    }
  };

  // 1. Standard List Collections
  diffListCollection('categories', state.categories, (it: Category) => it.id);
  diffListCollection('classesSchedule', state.classesSchedule, (it: ClassSlot) => it.id);
  diffListCollection('coreTasks', state.coreTasks, (it: CoreTask) => it.id);
  diffListCollection('secondaryTasks', state.secondaryTasks, (it: SecondaryTask) => it.id);
  diffListCollection('secondaryColumns', state.secondaryTaskColumns, (it: SecondaryTaskColumn) => it.id);
  diffListCollection('reminders', state.reminders, (it: ReminderItem) => it.id);
  diffListCollection('todoList', state.todoList, (it: NoteItem) => it.id);
  diffListCollection('weeklyEvents', state.weeklyEvents, (it: NoteItem) => it.id);
  diffListCollection('dailyThoughts', state.dailyThoughts, (it: NoteItem) => it.id);
  diffListCollection('postponedEvents', state.postponedEvents, (it: PostponedEvent) => it.id);
  if (Array.isArray(state.timebox)) {
    diffListCollection('timebox', state.timebox, (it: any) => it.id);
  }

  // 2. Details Columns (Each column is a doc; max 200 items/column)
  const sanitizeColumn = (col: DetailsColumn) => {
    let items = col.items || [];
    if (items.length > 200) {
      console.warn(`[Diff Engine] Column '${col.id}' items exceed 200 (${items.length}), slicing first 200`);
      items = items.slice(0, 200);
    }
    return { ...col, items };
  };

  diffListCollection('detailsColumns', state.detailsColumns, (it: DetailsColumn) => it.id, sanitizeColumn);
  diffListCollection('examColumns', state.examColumns, (it: DetailsColumn) => it.id, sanitizeColumn);

  // 3. Goals & Phase Subcollections (Parent goal doc WITHOUT phases)
  if (!mirror.collections['goals']) {
    mirror.collections['goals'] = new Map();
  }
  const goalsMirror = mirror.collections['goals'];
  const presentGoalIds = new Set<string>();

  if (Array.isArray(state.goals)) {
    for (const goal of state.goals) {
      if (!goal.goal_id) continue;
      presentGoalIds.add(goal.goal_id);

      // Separate phases from goal doc
      const { phases, ...goalTopLevel } = goal;
      const goalHash = hashContent(goalTopLevel);
      if (goalsMirror.get(goal.goal_id) !== goalHash) {
        toSet.push({ collection: 'goals', id: goal.goal_id, data: goalTopLevel });
      }

      // Handle phases in subcollection
      if (!mirror.goalPhases.has(goal.goal_id)) {
        mirror.goalPhases.set(goal.goal_id, new Map());
      }
      const phasesMirror = mirror.goalPhases.get(goal.goal_id)!;
      const presentPhaseNums = new Set<string>();

      if (Array.isArray(phases)) {
        for (const phase of phases) {
          const phaseNumStr = String(phase.phase_number);
          presentPhaseNums.add(phaseNumStr);

          const sanitizedPhase = sanitizePhaseForStorage(phase);
          const phaseHash = hashContent(sanitizedPhase);
          if (phasesMirror.get(phaseNumStr) !== phaseHash) {
            phaseSets.push({ goalId: goal.goal_id, phaseNumber: phaseNumStr, data: sanitizedPhase });
          }
        }
      }

      for (const [cachedPhaseNum] of phasesMirror.entries()) {
        if (!presentPhaseNums.has(cachedPhaseNum)) {
          phaseDeletes.push({ goalId: goal.goal_id, phaseNumber: cachedPhaseNum });
        }
      }
    }
  }

  for (const [cachedGoalId] of goalsMirror.entries()) {
    if (!presentGoalIds.has(cachedGoalId)) {
      toDelete.push({ collection: 'goals', id: cachedGoalId });
      // Delete any cached phases
      const cachedPhases = mirror.goalPhases.get(cachedGoalId);
      if (cachedPhases) {
        for (const phaseNum of cachedPhases.keys()) {
          phaseDeletes.push({ goalId: cachedGoalId, phaseNumber: phaseNum });
        }
      }
    }
  }

  // 4. Daily Tasks (doc per dayKey)
  const validDayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const presentDays = new Set<string>();

  if (state.dailyTasks && typeof state.dailyTasks === 'object') {
    for (const [dayKey, tasks] of Object.entries(state.dailyTasks)) {
      presentDays.add(dayKey);
      const tasksArr = Array.isArray(tasks) ? tasks : [];
      const currentTasksHash = hashContent(tasksArr);
      const cachedTasksHash = mirror.dailyTasks.get(dayKey);

      if (cachedTasksHash !== currentTasksHash) {
        toSet.push({ collection: 'dailyTasks', id: dayKey, data: { dayKey, tasks: tasksArr } });
      }

      // Check status snapshot changes
      const statusSummary = hashContent(tasksArr.map(t => ({ i: t.id, s: t.status, d: t.completionDate })));
      if (mirror.dayStatusSnapshot.get(dayKey) !== statusSummary) {
        changedStatusDays.push(dayKey);
      }
    }
  }

  for (const [cachedDay] of mirror.dailyTasks.entries()) {
    if (!presentDays.has(cachedDay)) {
      toDelete.push({ collection: 'dailyTasks', id: cachedDay });
      changedStatusDays.push(cachedDay);
    }
  }

  // 5. Pomodoro History (doc per dateISO)
  const presentPomoDates = new Set<string>();
  let skippedPomoCount = 0;
  if (state.pomodoro?.history && Array.isArray(state.pomodoro.history)) {
    for (const entry of state.pomodoro.history) {
      const rawDate = entry?.date || entry?.timestamp || entry?.dateKey;
      if (!rawDate || !isValidDateValue(rawDate)) {
        skippedPomoCount++;
        continue;
      }
      const dateISO = normalizeToDateISO(rawDate);
      presentPomoDates.add(dateISO);

      const { updatedAt: _up, ...contentToHash } = entry;
      const currentHash = hashContent({ ...contentToHash, date: dateISO });
      const cachedHash = mirror.pomoHistory.get(dateISO);

      if (cachedHash !== currentHash) {
        toSet.push({
          collection: 'pomodoroHistory',
          id: dateISO,
          data: { ...entry, date: dateISO, updatedAt: new Date().toISOString() }
        });
      }
    }
    if (skippedPomoCount > 0) {
      console.warn(`[Diff Engine] Skipped ${skippedPomoCount} pomodoro history entries lacking valid dates.`);
    }
  }

  for (const [cachedDate] of mirror.pomoHistory.entries()) {
    if (!presentPomoDates.has(cachedDate)) {
      toDelete.push({ collection: 'pomodoroHistory', id: cachedDate });
    }
  }

  // 6. WaterTracker History (doc per dateISO)
  const presentWaterDates = new Set<string>();
  let skippedWaterCount = 0;
  if (state.waterTracker?.history && Array.isArray(state.waterTracker.history)) {
    for (const entry of state.waterTracker.history) {
      const rawDate = entry?.date || entry?.timestamp || entry?.dateKey;
      if (!rawDate || !isValidDateValue(rawDate)) {
        skippedWaterCount++;
        continue;
      }
      const dateISO = normalizeToDateISO(rawDate);
      presentWaterDates.add(dateISO);

      const { updatedAt: _up, ...contentToHash } = entry;
      const currentHash = hashContent({ ...contentToHash, date: dateISO });
      const cachedHash = mirror.waterHistory.get(dateISO);

      if (cachedHash !== currentHash) {
        toSet.push({
          collection: 'waterTrackerHistory',
          id: dateISO,
          data: { ...entry, date: dateISO, updatedAt: new Date().toISOString() }
        });
      }
    }
    if (skippedWaterCount > 0) {
      console.warn(`[Diff Engine] Skipped ${skippedWaterCount} water tracker history entries lacking valid dates.`);
    }
  }

  for (const [cachedDate] of mirror.waterHistory.entries()) {
    if (!presentWaterDates.has(cachedDate)) {
      toDelete.push({ collection: 'waterTrackerHistory', id: cachedDate });
    }
  }

  // 7. Parent Document Scalars
  let parentData: Record<string, any> | undefined = undefined;
  const scalarSettings = extractScalarSettings(state);
  const currentParentHash = hashContent(scalarSettings);
  if (mirror.parentHash !== currentParentHash) {
    parentData = scalarSettings;
  }

  return {
    toSet,
    toDelete,
    parentData,
    phaseSets,
    phaseDeletes,
    changedStatusDays
  };
}

/**
 * Applies the calculated diff using writeBatch (max 450 ops/batch) and updates the mirror.
 */
export async function applyDiff(
  userId: string, 
  diff: DiffResult, 
  state: Partial<PlannerData>
): Promise<void> {
  const mirror = getOrCreateMirror(userId);
  const BATCH_LIMIT = 450;

  type BatchOp = 
    | { type: 'set'; path: string[]; data: any }
    | { type: 'delete'; path: string[] };

  const ops: BatchOp[] = [];

  // Parent doc
  if (diff.parentData) {
    ops.push({
      type: 'set',
      path: ['planners', userId],
      data: { ...diff.parentData, updatedAt: new Date().toISOString() }
    });
  }

  // toSet
  for (const item of diff.toSet) {
    ops.push({
      type: 'set',
      path: ['planners', userId, item.collection, item.id],
      data: item.data
    });
  }

  // toDelete
  for (const item of diff.toDelete) {
    ops.push({
      type: 'delete',
      path: ['planners', userId, item.collection, item.id]
    });
  }

  // phaseSets
  for (const p of diff.phaseSets) {
    ops.push({
      type: 'set',
      path: ['planners', userId, 'goals', p.goalId, 'phases', p.phaseNumber],
      data: p.data
    });
  }

  // phaseDeletes
  for (const p of diff.phaseDeletes) {
    ops.push({
      type: 'delete',
      path: ['planners', userId, 'goals', p.goalId, 'phases', p.phaseNumber]
    });
  }

  if (ops.length === 0) {
    return;
  }

  // Execute in batches
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const op of chunk) {
      const docRef = (doc as any)(db, ...op.path);
      if (op.type === 'set') {
        batch.set(docRef, op.data, { merge: true });
      } else {
        batch.delete(docRef);
      }
    }

    await batch.commit();
  }

  // Commit was successful -> update mirror
  updateMirrorFromSnapshot(userId, state);
}

/**
 * Updates local mirror from state or cloud snapshot data to prevent echo
 */
export function updateMirrorFromSnapshot(userId: string, data: Partial<PlannerData>): void {
  const mirror = getOrCreateMirror(userId);

  // Helper for updating collection mirror
  const updateListColMirror = (colName: string, items: any[] | undefined, getId: (it: any) => string | undefined, cleanData?: (it: any) => any) => {
    if (items === undefined) return;
    const colMap = new Map<string, string>();
    if (Array.isArray(items)) {
      for (const item of items) {
        const id = getId(item);
        if (id) {
          colMap.set(id, hashContent(cleanData ? cleanData(item) : item));
        }
      }
    }
    mirror.collections[colName] = colMap;
  };

  updateListColMirror('categories', data.categories, (it: Category) => it.id);
  updateListColMirror('classesSchedule', data.classesSchedule, (it: ClassSlot) => it.id);
  updateListColMirror('coreTasks', data.coreTasks, (it: CoreTask) => it.id);
  updateListColMirror('secondaryTasks', data.secondaryTasks, (it: SecondaryTask) => it.id);
  updateListColMirror('secondaryColumns', data.secondaryTaskColumns, (it: SecondaryTaskColumn) => it.id);
  updateListColMirror('reminders', data.reminders, (it: ReminderItem) => it.id);
  updateListColMirror('todoList', data.todoList, (it: NoteItem) => it.id);
  updateListColMirror('weeklyEvents', data.weeklyEvents, (it: NoteItem) => it.id);
  updateListColMirror('dailyThoughts', data.dailyThoughts, (it: NoteItem) => it.id);
  updateListColMirror('postponedEvents', data.postponedEvents, (it: PostponedEvent) => it.id);
  if (data.timebox !== undefined && Array.isArray(data.timebox)) {
    updateListColMirror('timebox', data.timebox, (it: any) => it.id);
  }

  const sanitizeCol = (c: DetailsColumn) => {
    let items = c.items || [];
    if (items.length > 200) {
      console.warn(`[Mirror Engine] Column '${c.id}' items exceed 200 (${items.length}), slicing first 200`);
      items = items.slice(0, 200);
    }
    return { ...c, items };
  };
  updateListColMirror('detailsColumns', data.detailsColumns, (it: DetailsColumn) => it.id, sanitizeCol);
  updateListColMirror('examColumns', data.examColumns, (it: DetailsColumn) => it.id, sanitizeCol);

  // Goals & phases
  if (data.goals !== undefined) {
    const goalsMap = new Map<string, string>();
    if (Array.isArray(data.goals)) {
      for (const g of data.goals) {
        if (g.goal_id) {
          const { phases, ...topLevel } = g;
          goalsMap.set(g.goal_id, hashContent(topLevel));

          const phaseMap = new Map<string, string>();
          if (Array.isArray(phases)) {
            for (const p of phases) {
              phaseMap.set(String(p.phase_number), hashContent(sanitizePhaseForStorage(p)));
            }
          }
          mirror.goalPhases.set(g.goal_id, phaseMap);
        }
      }
    }
    mirror.collections['goals'] = goalsMap;
  }

  // Daily Tasks
  if (data.dailyTasks !== undefined && typeof data.dailyTasks === 'object') {
    mirror.dailyTasks.clear();
    for (const [dayKey, tasks] of Object.entries(data.dailyTasks)) {
      const arr = Array.isArray(tasks) ? tasks : [];
      mirror.dailyTasks.set(dayKey, hashContent(arr));
      mirror.dayStatusSnapshot.set(dayKey, hashContent(arr.map(t => ({ i: t.id, s: t.status, d: t.completionDate }))));
    }
  }

  // Pomodoro History
  if (data.pomodoro?.history !== undefined && Array.isArray(data.pomodoro.history)) {
    mirror.pomoHistory.clear();
    for (const entry of data.pomodoro.history) {
      const rawDate = entry?.date || entry?.timestamp || entry?.dateKey;
      if (!rawDate || !isValidDateValue(rawDate)) continue;
      const dateISO = normalizeToDateISO(rawDate);
      const { updatedAt: _up, ...contentToHash } = entry;
      mirror.pomoHistory.set(dateISO, hashContent({ ...contentToHash, date: dateISO }));
    }
  }

  // WaterTracker History
  if (data.waterTracker?.history !== undefined && Array.isArray(data.waterTracker.history)) {
    mirror.waterHistory.clear();
    for (const entry of data.waterTracker.history) {
      const rawDate = entry?.date || entry?.timestamp || entry?.dateKey;
      if (!rawDate || !isValidDateValue(rawDate)) continue;
      const dateISO = normalizeToDateISO(rawDate);
      const { updatedAt: _up, ...contentToHash } = entry;
      mirror.waterHistory.set(dateISO, hashContent({ ...contentToHash, date: dateISO }));
    }
  }

  // Parent scalars
  const scalars = extractScalarSettings(data);
  if (Object.keys(scalars).length > 0) {
    mirror.parentHash = hashContent(scalars);
  }
}
