import { db } from './index.ts';
import { users, planners } from './schema.ts';
import { eq, and, ne } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, username?: string, passwordHash?: string) {
  try {
    const normEmail = email.toLowerCase().trim();
    const normUsername = (username && username.trim()) 
      ? username.trim().toLowerCase() 
      : normEmail.split('@')[0];

    // Check if the username is already taken by a DIFFERENT uid
    const existingUserWithUsername = await db.select()
      .from(users)
      .where(and(eq(users.username, normUsername), ne(users.uid, uid)));

    if (existingUserWithUsername.length > 0) {
      const customErr: any = new Error("این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است");
      customErr.code = '23505';
      throw customErr;
    }

    const valuesToSet: any = {
      email: normEmail,
      username: normUsername,
    };
    if (passwordHash) {
      valuesToSet.passwordHash = passwordHash;
    }

    const result = await db.insert(users)
      .values({
        uid,
        email: normEmail,
        username: normUsername,
        passwordHash: passwordHash || null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: valuesToSet,
      })
      .returning();

    return result[0];
  } catch (error: any) {
    if (error?.message === "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است") {
      throw error;
    }
    console.error("Error in getOrCreateUser:", error);
    const errCode = error?.code || error?.cause?.code;
    const errMsg = String(error?.message || '');
    if (errCode === '23505' || errMsg.includes('23505') || errMsg.includes('users_username_unique') || errMsg.includes('unique constraint')) {
      const customErr: any = new Error("این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است");
      customErr.code = '23505';
      throw customErr;
    }
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
