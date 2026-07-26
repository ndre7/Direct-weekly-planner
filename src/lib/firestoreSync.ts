import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  onSnapshot, 
  QuerySnapshot, 
  DocumentData 
} from 'firebase/firestore';
import { db } from './firebase.ts';
import { PlannerData, CoreTask, SecondaryTask, NoteItem } from '../types';

/**
 * 1. Main Document CRUD Operation
 * Updates settings, titles, and bounded static arrays on users/{uid}
 */
export async function updateMainDoc(uid: string, payload: Partial<PlannerData>): Promise<void> {
  if (!uid) return;
  const userDocRef = doc(db, 'users', uid);
  // Ensure we do not save subcollection arrays inside the main document to preserve the 1MB limit structure
  const { coreTasks, secondaryTasks, todoList, dailyThoughts, ...mainData } = payload as any;
  await setDoc(userDocRef, mainData, { merge: true });
}

/**
 * 2. CoreTasks Subcollection Operations (users/{uid}/coreTasks)
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

/**
 * 3. SecondaryTasks Subcollection Operations (users/{uid}/secondaryTasks)
 */
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

export async function deleteSecondaryTask(uid: string, taskId: string): Promise<void> {
  if (!uid || !taskId) return;
  const taskRef = doc(db, 'users', uid, 'secondaryTasks', taskId);
  await deleteDoc(taskRef);
}

/**
 * 4. Todos Subcollection Operations (users/{uid}/todos)
 */
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

/**
 * 5. DailyThoughts Subcollection Operations (users/{uid}/dailyThoughts)
 */
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
 * 6. Real-time Subscription Combining Main Doc and Subcollections
 * Listeners created:
 * - users/{uid} (main doc)
 * - users/{uid}/coreTasks
 * - users/{uid}/secondaryTasks
 * - users/{uid}/todos
 * - users/{uid}/dailyThoughts
 * 
 * Combines all into a unified PlannerData payload and calls onDataCombined callback.
 * Returns an unsubscribe function that cleans up all 5 listeners on logout/unmount.
 */
export function subscribeToUserData(
  uid: string, 
  onDataCombined: (data: Partial<PlannerData>) => void,
  onError?: (error: Error) => void
): () => void {
  if (!uid) return () => {};

  let mainDocData: Partial<PlannerData> = {};
  let coreTasksList: CoreTask[] = [];
  let secondaryTasksList: SecondaryTask[] = [];
  let todoListItems: NoteItem[] = [];
  let dailyThoughtsList: NoteItem[] = [];

  const notify = () => {
    onDataCombined({
      ...mainDocData,
      coreTasks: coreTasksList,
      secondaryTasks: secondaryTasksList,
      todoList: todoListItems,
      dailyThoughts: dailyThoughtsList
    });
  };

  // 1. Main Document Listener
  const mainDocRef = doc(db, 'users', uid);
  const unsubMain = onSnapshot(mainDocRef, (docSnap) => {
    if (docSnap.exists()) {
      mainDocData = docSnap.data() as Partial<PlannerData>;
      notify();
    }
  }, onError);

  // 2. CoreTasks Listener
  const coreTasksCol = collection(db, 'users', uid, 'coreTasks');
  const unsubCore = onSnapshot(coreTasksCol, (snapshot: QuerySnapshot<DocumentData>) => {
    const list: CoreTask[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as CoreTask);
    });
    coreTasksList = list;
    notify();
  }, onError);

  // 3. SecondaryTasks Listener
  const secondaryTasksCol = collection(db, 'users', uid, 'secondaryTasks');
  const unsubSec = onSnapshot(secondaryTasksCol, (snapshot: QuerySnapshot<DocumentData>) => {
    const list: SecondaryTask[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as SecondaryTask);
    });
    secondaryTasksList = list;
    notify();
  }, onError);

  // 4. Todos Listener
  const todosCol = collection(db, 'users', uid, 'todos');
  const unsubTodos = onSnapshot(todosCol, (snapshot: QuerySnapshot<DocumentData>) => {
    const list: NoteItem[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as NoteItem);
    });
    todoListItems = list;
    notify();
  }, onError);

  // 5. DailyThoughts Listener
  const dailyThoughtsCol = collection(db, 'users', uid, 'dailyThoughts');
  const unsubThoughts = onSnapshot(dailyThoughtsCol, (snapshot: QuerySnapshot<DocumentData>) => {
    const list: NoteItem[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as NoteItem);
    });
    dailyThoughtsList = list;
    notify();
  }, onError);

  // Unsubscribe function to tear down all 5 listeners
  return () => {
    unsubMain();
    unsubCore();
    unsubSec();
    unsubTodos();
    unsubThoughts();
  };
}
