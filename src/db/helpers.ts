import { db } from './index.ts';
import { users, planners } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, username?: string) {
  try {
    const result = await db.insert(users)
      .values({
        uid,
        email,
        username: username || email.split('@')[0],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          username: username || email.split('@')[0],
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error("Error in getOrCreateUser:", error);
    throw new Error("Failed to register or retrieve user in Cloud SQL.", { cause: error });
  }
}

export async function getPlanner(userId: string) {
  try {
    const result = await db.select()
      .from(planners)
      .where(eq(planners.userId, userId));
    return result[0] || null;
  } catch (error) {
    console.error("Error in getPlanner:", error);
    throw new Error("Failed to fetch planner data from Cloud SQL.", { cause: error });
  }
}

export async function savePlanner(userId: string, data: any) {
  try {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const result = await db.insert(planners)
      .values({
        userId,
        data: dataString,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: planners.userId,
        set: {
          data: dataString,
          syncedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error("Error in savePlanner:", error);
    throw new Error("Failed to save planner data to Cloud SQL.", { cause: error });
  }
}

export async function getAllUsers() {
  try {
    const result = await db.select().from(users).orderBy(users.createdAt);
    return result;
  } catch (error) {
    console.error("Error in getAllUsers:", error);
    throw new Error("Failed to fetch all users from Cloud SQL.", { cause: error });
  }
}

export async function suspendUser(userId: string, suspend: boolean) {
  try {
    const result = await db.update(users)
      .set({ suspended: suspend })
      .where(eq(users.uid, userId))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Error in suspendUser:", error);
    throw new Error("Failed to update suspension status in Cloud SQL.", { cause: error });
  }
}

export async function deleteUserAndData(userId: string) {
  try {
    await db.delete(planners).where(eq(planners.userId, userId));
    const result = await db.delete(users).where(eq(users.uid, userId)).returning();
    return result[0];
  } catch (error) {
    console.error("Error in deleteUserAndData:", error);
    throw new Error("Failed to delete user and their data from Cloud SQL.", { cause: error });
  }
}
