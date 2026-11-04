import "dotenv/config";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
  try {
    setGlobalDispatcher(new EnvHttpProxyAgent());
    console.log("[Server Proxy] undici EnvHttpProxyAgent configured successfully for outbound requests");
  } catch (proxyErr) {
    console.error("[Server Proxy] Failed to set global dispatcher:", proxyErr);
  }
}

import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { detectProvider, ALLOWED_BASE_URL_HOSTS, PROVIDERS, ProviderId } from "./src/shared/providers.ts";
import { adminAuth } from "./src/lib/firebase-admin.ts";
import { 
  getOrCreateUser, 
  getPlanner, 
  savePlanner, 
  getAllUsers, 
  suspendUser, 
  deleteUserAndData 
} from "./src/db/helpers.ts";
import { db } from "./src/db/index.ts";
import { users } from "./src/db/schema.ts";
import { eq, and, ne } from "drizzle-orm";

const app = express();
const PORT = 3000;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash) return false; // fail-closed
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false; // fail-closed
  const [salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

const GEMINI_MODEL = "gemini-3.6-flash";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "nimadarai05@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email?: string | null) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

// تعلیق حساب (suspend) و یکتایی username در حالت آفلاین دسکتاپ به دلیل نبود PostgreSQL اعمال نمی‌شوند
const hasSql = Boolean(process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME);

app.use(express.json({ limit: "50mb" }));

// --- API ROUTES ---

app.post("/api/auth/server-register", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: "ایمیل و رمز عبور الزامی است." });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const rawUsername = (username && typeof username === 'string' && username.trim()) 
      ? username.trim() 
      : trimmedEmail.split('@')[0];
    const trimmedUsername = rawUsername.toLowerCase();

    if (password.length < 6) {
      return res.status(400).json({ error: "کلمه عبور باید حداقل ۶ کاراکتر باشد." });
    }

    // Check if username is taken in DB (case-insensitive check)
    const existingUsername = await db.select().from(users).where(eq(users.username, trimmedUsername));
    if (existingUsername.length > 0) {
      return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است." });
    }

    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(trimmedEmail);
    } catch (e: any) {
      const errCode = e?.code || e?.message || '';
      if (errCode.includes('user-not-found') || errCode.includes('auth/user-not-found')) {
        try {
          firebaseUser = await adminAuth.createUser({
            email: trimmedEmail,
            password: password,
            displayName: trimmedUsername,
          });
        } catch (createErr: any) {
          console.error("Firebase admin createUser error:", createErr);
          const cCode = createErr?.code || createErr?.message || '';
          if (cCode.includes('email-already-exists') || cCode.includes('already in use')) {
            return res.status(400).json({ error: "این ایمیل قبلاً توسط کاربر دیگری ثبت شده است." });
          }
          return res.status(500).json({ error: `خطای سرور فایربیس: ${createErr?.message || 'مشکل در ساخت حساب کاربر'}` });
        }
      } else {
        console.error("Firebase admin getUserByEmail error:", e);
        return res.status(500).json({ error: `خطای پیکربندی سرور: ${e?.message || 'عدم دسترسی به سرویس فایربیس'}` });
      }
    }

    const passwordHash = hashPassword(password);

    // Save to database
    let dbUser;
    try {
      dbUser = await getOrCreateUser(firebaseUser.uid, trimmedEmail, trimmedUsername, passwordHash);
    } catch (dbErr: any) {
      if (dbErr?.code === '23505' || String(dbErr?.message).includes('این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است')) {
        return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است." });
      }
      throw dbErr;
    }

    if (dbUser.suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }

    // Create custom token for client sign-in
    const customToken = await adminAuth.createCustomToken(firebaseUser.uid);

    res.json({
      success: true,
      customToken,
      user: {
        id: firebaseUser.uid,
        email: trimmedEmail,
        username: dbUser.username || trimmedUsername,
      }
    });
  } catch (error: any) {
    console.error("Server register error:", error);
    const msg = error?.message || "خطا در ثبت‌نام کاربری";
    if (msg.includes("email-already-exists") || msg.includes("already in use")) {
      return res.status(400).json({ error: "این ایمیل قبلاً توسط کاربر دیگری ثبت شده است." });
    }
    res.status(500).json({ error: msg });
  }
});

app.post("/api/auth/server-login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: "نام کاربری/ایمیل و کلمه عبور الزامی است." });
    }

    let input = emailOrUsername.trim().toLowerCase();
    let email = input;
    let dbUsername = input.split('@')[0];

    if (!input.includes('@')) {
      const foundUser = await db.select().from(users).where(eq(users.username, input));
      if (foundUser.length === 0) {
        return res.status(400).json({ error: "کاربر با این نام کاربری یافت نشد." });
      }
      email = foundUser[0].email.toLowerCase();
      dbUsername = foundUser[0].username || dbUsername;
    }

    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(email);
    } catch (e: any) {
      const errCode = e?.code || e?.message || '';
      if (errCode.includes('user-not-found') || errCode.includes('auth/user-not-found')) {
        try {
          firebaseUser = await adminAuth.createUser({
            email: email,
            password: password,
            displayName: dbUsername
          });
        } catch (createErr: any) {
          console.error("Firebase admin createUser error in login fallback:", createErr);
          return res.status(400).json({ error: "حساب کاربری با این مشخصات یافت نشد." });
        }
      } else {
        console.error("Firebase admin getUserByEmail error in server-login:", e);
        return res.status(500).json({ error: `خطای پیکربندی سرور: ${e?.message || 'عدم دسترسی به سرویس فایربیس'}` });
      }
    }

    let dbUser;
    try {
      dbUser = await getOrCreateUser(firebaseUser.uid, email, dbUsername);
    } catch (dbErr: any) {
      if (dbErr?.code === '23505' || String(dbErr?.message).includes('این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است')) {
        return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است" });
      }
      throw dbErr;
    }

    if (dbUser.passwordHash) {
      if (!verifyPassword(password, dbUser.passwordHash)) {
        return res.status(400).json({ error: "کلمه عبور وارد شده نادرست است." });
      }
    } else {
      // Store current password hash in DB for future logins
      const newHash = hashPassword(password);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.uid, firebaseUser.uid));
      dbUser.passwordHash = newHash;
    }

    if (dbUser.suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }

    const customToken = await adminAuth.createCustomToken(firebaseUser.uid);

    res.json({
      success: true,
      customToken,
      user: {
        id: firebaseUser.uid,
        email: email,
        username: dbUser.username || firebaseUser.displayName || dbUsername,
      }
    });
  } catch (error: any) {
    console.error("Server login error:", error);
    res.status(500).json({ error: error.message || "خطا در ورود به حساب کاربری" });
  }
});

app.post("/api/auth/firebase-sync", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;
    const { username } = req.body;
    let normUsername: string | undefined = undefined;

    if (!hasSql) {
      return res.json({ success: true, localMode: true, user: {
        id: userToken.uid,
        email: userToken.email || '',
        username: (userToken as any).name || (userToken.email || '').split('@')[0] || 'کاربر'
      }});
    }

    if (username && typeof username === 'string' && username.trim()) {
      normUsername = username.trim().toLowerCase();
      const existingUserWithUsername = await db
        .select()
        .from(users)
        .where(and(eq(users.username, normUsername), ne(users.uid, userToken.uid)));

      if (existingUserWithUsername.length > 0) {
        return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است" });
      }
    }

    let user;
    try {
      user = await getOrCreateUser(userToken.uid, userToken.email!, normUsername);
    } catch (dbErr: any) {
      if (dbErr?.code === '23505' || String(dbErr?.message).includes('این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است')) {
        return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است" });
      }
      throw dbErr;
    }
    
    if (user.suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }
    
    res.json({
      success: true,
      user: {
        id: user.uid,
        email: user.email,
        username: user.username,
      }
    });
  } catch (error: any) {
    console.error("Firebase sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/update-username", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;
    const { username } = req.body;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: "لطفاً یک نام کاربری معتبر وارد کنید" });
    }

    const trimmedUsername = username.trim().toLowerCase();

    if (!hasSql) {
      return res.json({
        success: true,
        localMode: true,
        username: trimmedUsername,
        email: userToken.email
      });
    }

    // Check if username is already taken by another user
    const existingUserWithUsername = await db
      .select()
      .from(users)
      .where(and(eq(users.username, trimmedUsername), ne(users.uid, userToken.uid)));

    if (existingUserWithUsername.length > 0) {
      return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است. لطفاً نام کاربری یکتای دیگری انتخاب کنید." });
    }

    // Update in database with unique constraint error handling
    try {
      await db.update(users).set({ username: trimmedUsername }).where(eq(users.uid, userToken.uid));
    } catch (dbErr: any) {
      const errCode = dbErr?.code || dbErr?.cause?.code;
      const errMsg = String(dbErr?.message || '');
      if (errCode === '23505' || errMsg.includes('23505') || errMsg.includes('users_username_unique')) {
        return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است. لطفاً نام کاربری یکتای دیگری انتخاب کنید." });
      }
      throw dbErr;
    }

    res.json({
      success: true,
      username: trimmedUsername,
      email: userToken.email
    });
  } catch (error: any) {
    console.error("Update username error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/get-email", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: "نام کاربری مشخص نیست" });
    }
    
    const normUsername = username.trim().toLowerCase();
    const result = await db.select().from(users).where(eq(users.username, normUsername));
    if (result.length === 0) {
      return res.status(404).json({ error: "کاربر یافت نشد" });
    }
    
    res.json({ email: result[0].email });
  } catch (error: any) {
    console.error("get-email error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/validate", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;

    if (!hasSql) {
      return res.json({ success: true, localMode: true, user: {
        id: userToken.uid,
        email: userToken.email || '',
        username: (userToken as any).name || (userToken.email || '').split('@')[0] || 'کاربر'
      }});
    }

    const userResult = await db.select().from(users).where(eq(users.uid, userToken.uid));
    
    if (userResult.length === 0) {
      return res.status(404).json({ error: "کاربر یافت نشد", userNotFound: true });
    }
    
    if (userResult[0].suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }
    
    res.json({
      success: true,
      user: {
        id: userResult[0].uid,
        email: userResult[0].email,
        username: userResult[0].username,
      }
    });
  } catch (error: any) {
    console.error("Validate error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/refresh", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;

    if (!hasSql) {
      return res.json({ success: true, localMode: true, user: {
        id: userToken.uid,
        email: userToken.email || '',
        username: (userToken as any).name || (userToken.email || '').split('@')[0] || 'کاربر'
      }});
    }

    const userResult = await db.select().from(users).where(eq(users.uid, userToken.uid));
    
    if (userResult.length === 0) {
      return res.status(404).json({ error: "کاربر یافت نشد", userNotFound: true });
    }
    
    if (userResult[0].suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }
    
    res.json({
      success: true,
      user: {
        id: userResult[0].uid,
        email: userResult[0].email,
        username: userResult[0].username,
      }
    });
  } catch (error: any) {
    console.error("Refresh error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/planner/sync", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;
    const { data } = req.body;

    if (!hasSql) {
      return res.json({ success: true, localMode: true });
    }

    const userResult = await db.select().from(users).where(eq(users.uid, userToken.uid));
    if (userResult.length === 0) {
      return res.status(401).json({ error: "کاربر معتبر نیست" });
    }
    if (userResult[0].suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }
    
    await savePlanner(userToken.uid, data);
    res.json({ success: true, syncedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error("Sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/planner/load", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;

    if (!hasSql) {
      return res.json({ success: true, localMode: true, data: null });
    }

    const userResult = await db.select().from(users).where(eq(users.uid, userToken.uid));
    if (userResult.length === 0) {
      return res.status(401).json({ error: "کاربر معتبر نیست" });
    }
    if (userResult[0].suspended) {
      return res.status(403).json({ error: "حساب کاربری شما تعلیق شده است" });
    }
    
    const planner = await getPlanner(userToken.uid);
    if (!planner) {
      return res.json({ success: true, data: null, message: "داده‌ای ذخیره نشده است" });
    }
    
    res.json({ success: true, data: JSON.parse(planner.data), syncedAt: planner.syncedAt });
  } catch (error: any) {
    console.error("Load error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/users", requireAuth, async (req: AuthRequest, res) => {
  try {
    const adminToken = req.user!;
    if (!isAdmin(adminToken.email)) {
      return res.status(403).json({ error: "شما دسترسی ادمین به این بخش را ندارید" });
    }
    
    const userList = await getAllUsers();
    const mapped = userList.map(u => ({
      id: u.uid,
      email: u.email,
      username: u.username,
      createdAt: u.createdAt.toISOString(),
      suspended: u.suspended,
    }));
    
    res.json({ success: true, users: mapped });
  } catch (error: any) {
    console.error("Admin list users error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/users/suspend", requireAuth, async (req: AuthRequest, res) => {
  try {
    const adminToken = req.user!;
    if (!isAdmin(adminToken.email)) {
      return res.status(403).json({ error: "شما دسترسی ادمین به این بخش را ندارید" });
    }
    
    const { targetUserId, suspend } = req.body;
    if (adminToken.uid === targetUserId) {
      return res.status(400).json({ error: "شما نمی‌توانید حساب کاربری خودتان را تعلیق کنید" });
    }
    
    if (suspend === true) {
      try {
        await adminAuth.revokeRefreshTokens(targetUserId);
      } catch (revokeErr) {
        console.warn("Failed to revoke refresh tokens for suspended user:", revokeErr);
      }
    }

    await suspendUser(targetUserId, suspend);
    res.json({ 
      success: true, 
      message: suspend ? "حساب کاربر با موفقیت تعلیق شد" : "تعلیق حساب کاربر با موفقیت برداشته شد" 
    });
  } catch (error: any) {
    console.error("Admin suspend error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/users/delete", requireAuth, async (req: AuthRequest, res) => {
  try {
    const adminToken = req.user!;
    if (!isAdmin(adminToken.email)) {
      return res.status(403).json({ error: "شما دسترسی ادمین به این بخش را ندارید" });
    }
    
    const { targetUserId } = req.body;
    if (adminToken.uid === targetUserId) {
      return res.status(400).json({ error: "شما نمی‌توانید حساب کاربری خودتان را حذف کنید" });
    }
    
    await deleteUserAndData(targetUserId);
    res.json({ success: true, message: "حساب کاربر با موفقیت حذف شد" });
  } catch (error: any) {
    console.error("Admin delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/delete-account", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;
    await deleteUserAndData(userToken.uid);
    res.json({ success: true, message: "حساب کاربری و اطلاعات شما با موفقیت به طور کامل حذف گردید" });
  } catch (error: any) {
    console.error("Delete account error:", error);
    res.status(500).json({ error: error.message || "حذف حساب کاربری ناموفق بود" });
  }
});

// --- GEMINI MULTI-ACCOUNT FALLBACK SYSTEM ---
interface GeminiAccount {
  client: GoogleGenAI;
  label: string;
  keyHash: string;
}

function computeKeyHash(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

function discoverGeminiApiKeys(userKeysHeader?: string | string[]): GeminiAccount[] {
  const accounts: GeminiAccount[] = [];
  const seenKeys = new Set<string>();

  // 1. Process custom user keys passed from header first
  if (userKeysHeader) {
    const rawHeader = Array.isArray(userKeysHeader) ? userKeysHeader.join(',') : userKeysHeader;
    const splitKeys = rawHeader
      .split(/[,\r\n]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0);

    let userKeyIndex = 1;
    for (const key of splitKeys) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const keyHash = computeKeyHash(key);
        console.log(`[Gemini Fallback] Discovered user key [user-key-${userKeyIndex}]: len=${key.length}, hash=${keyHash}`);
        accounts.push({
          client: new GoogleGenAI({
            apiKey: key,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          }),
          label: `user-key-${userKeyIndex++}`,
          keyHash
        });
      }
    }
  }

  // 2. Primary environment key
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
    const primaryKey = process.env.GEMINI_API_KEY.trim();
    if (!seenKeys.has(primaryKey)) {
      seenKeys.add(primaryKey);
      const keyHash = computeKeyHash(primaryKey);
      console.log(`[Gemini Fallback] Discovered env key [primary]: len=${primaryKey.length}, hash=${keyHash}`);
      accounts.push({
        client: new GoogleGenAI({
          apiKey: primaryKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        }),
        label: "primary",
        keyHash
      });
    }
  }

  // 3. Extra nth_account_of_gais accounts
  const extraAccounts: { num: number; key: string }[] = [];
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (!envVal || envVal.trim() === "") continue;
    const match = envKey.match(/^(\d+)th_account_of_gais$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      extraAccounts.push({ num, key: envVal.trim() });
    }
  }

  extraAccounts.sort((a, b) => a.num - b.num);

  for (const acc of extraAccounts) {
    if (!seenKeys.has(acc.key)) {
      seenKeys.add(acc.key);
      const keyHash = computeKeyHash(acc.key);
      console.log(`[Gemini Fallback] Discovered env key [account-${acc.num}]: len=${acc.key.length}, hash=${keyHash}`);
      accounts.push({
        client: new GoogleGenAI({
          apiKey: acc.key,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        }),
        label: `account-${acc.num}`,
        keyHash
      });
    }
  }

  return accounts;
}

const unavailablePairs = new Set<string>();

const GEMINI_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
const GOAL_ANALYSIS_MODELS = ["gemini-3.1-pro-preview", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];

interface ParsedCustomKey {
  id: string;
  key: string;
  provider: string;
  providerName?: string;
  modelMode?: 'exact' | 'cascade';
  model?: string;
  baseUrl?: string;
}

function parseCustomApiKeys(req: express.Request): ParsedCustomKey[] {
  const headerVal = req.headers['x-custom-api-keys'];
  let rawList: any[] = [];
  if (headerVal && typeof headerVal === 'string') {
    try {
      const parsed = JSON.parse(headerVal);
      if (Array.isArray(parsed)) rawList.push(...parsed);
    } catch (_) {}
  }
  if (Array.isArray((req.body as any)?.customKeys)) {
    rawList.push(...(req.body as any).customKeys);
  }
  if ((req.body as any)?.apiKey && (req.body as any)?.provider) {
    rawList.push({
      id: 'body_key',
      key: (req.body as any).apiKey,
      provider: (req.body as any).provider,
      model: (req.body as any).model,
      modelMode: (req.body as any).model ? 'exact' : 'cascade',
      baseUrl: (req.body as any).baseUrl
    });
  }
  if (rawList.length === 0) return [];

  try {
    const validProviders = new Set(PROVIDERS.map(p => p.id));
    const result: ParsedCustomKey[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const key = typeof item.key === 'string' ? item.key.trim() : '';
      if (key.length <= 5) continue;
      const provider = typeof item.provider === 'string' ? item.provider.trim() : '';
      if (!validProviders.has(provider as ProviderId)) continue;

      let baseUrl = typeof item.baseUrl === 'string' ? item.baseUrl.trim() : undefined;
      if (baseUrl) {
        try {
          if (baseUrl.includes('@')) continue;
          const u = new URL(baseUrl);
          if (u.protocol !== 'https:' || !ALLOWED_BASE_URL_HOSTS.includes(u.hostname) || u.username || u.password) {
            continue;
          }
        } catch {
          continue;
        }
      }

      const modelMode: 'exact' | 'cascade' = item.modelMode === 'exact' ? 'exact' : 'cascade';
      const rawModel = typeof item.model === 'string' ? item.model.trim() : '';
      if (modelMode === 'exact' && !rawModel) {
        // Skip keys in exact mode that do not specify a model
        continue;
      }

      result.push({
        id: typeof item.id === 'string' ? item.id : `key_${Date.now()}`,
        key,
        provider,
        providerName: typeof item.providerName === 'string' ? item.providerName : undefined,
        modelMode,
        model: rawModel || undefined,
        baseUrl
      });
      if (result.length >= 10) break;
    }
    return result;
  } catch {
    return [];
  }
}

interface CustomKeyExecutionResult {
  text: string;
  model: string;
  tokenCount: number;
}

async function executeCustomKeyCall(
  customKey: ParsedCustomKey,
  options: GeminiFallbackOptions,
  deadlineMs: number
): Promise<CustomKeyExecutionResult | null> {
  const providerDef = PROVIDERS.find(p => p.id === customKey.provider);
  const isExactMode = customKey.modelMode === 'exact';
  const modelsToTry: string[] = isExactMode && customKey.model
    ? [customKey.model]
    : (providerDef?.candidateModels && providerDef.candidateModels.length > 0
        ? providerDef.candidateModels
        : (customKey.model ? [customKey.model] : options.preferredModels));

  const isUserExplicitModel = isExactMode && !!customKey.model;

  for (const model of modelsToTry) {
    if (Date.now() >= deadlineMs) break;

    const remainingChainMs = Math.max(1000, deadlineMs - Date.now());
    const requestTimeoutMs = Math.min(60000, remainingChainMs);

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

      try {
        let text = '';
        let tokenCount: number | undefined;

        if (customKey.provider === 'gemini') {
          const client = new GoogleGenAI({ apiKey: customKey.key });
          const config = options.getConfigForModel(model);
          const response = await client.models.generateContent({
            model,
            contents: options.prompt,
            config
          });
          text = response.text || '';
          tokenCount = response.usageMetadata?.totalTokenCount;
        } else if (customKey.provider === 'anthropic') {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': customKey.key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model,
              max_tokens: Math.min(options.maxOutputTokens ?? 4096, 8192),
              messages: [{ role: 'user', content: options.prompt }]
            }),
            signal: controller.signal
          });

          if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            const err = new Error(errBody || `Anthropic HTTP ${resp.status}`);
            (err as any).status = resp.status;
            throw err;
          }

          const data: any = await resp.json();
          text = data.content?.[0]?.text || '';
          if (data.usage) {
            tokenCount = (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
          }
        } else {
          let endpoint = customKey.baseUrl || providerDef?.defaultBaseUrl || 'https://api.openai.com/v1';
          if (!endpoint.endsWith('/chat/completions')) {
            endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
          }

          let requestedLimit = options.maxOutputTokens ?? 32768;
          if (model.includes('gpt-oss') || customKey.provider === 'gemini') {
            requestedLimit = Math.min(requestedLimit, 65536);
          } else {
            requestedLimit = Math.min(requestedLimit, 32768);
          }

          let currentTokens = requestedLimit;
          let useCompletionTokens = true;
          let jsonModeActive = !!providerDef?.jsonMode;

          const buildReqBody = (tokens: number, useComp: boolean, useJson: boolean) => {
            const body: any = {
              model,
              messages: [{ role: 'user', content: options.prompt }]
            };
            if (useComp) {
              body.max_completion_tokens = tokens;
            } else {
              body.max_tokens = tokens;
            }
            if (useJson) {
              body.response_format = { type: 'json_object' };
            }
            return body;
          };

          let reqBody = buildReqBody(currentTokens, useCompletionTokens, jsonModeActive);

          let resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${customKey.key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(reqBody),
            signal: controller.signal
          });

          // Handle 400 retries for response_format, max_completion_tokens, and token size
          while (resp.status === 400) {
            const errTxt = await resp.text().catch(() => '');
            const lowerErr = errTxt.toLowerCase();

            // 1. Retry if response_format unsupported
            if (jsonModeActive && lowerErr.includes('response_format')) {
              jsonModeActive = false;
              reqBody = buildReqBody(currentTokens, useCompletionTokens, false);
              resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${customKey.key}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(reqBody),
                signal: controller.signal
              });
              continue;
            }

            // 2. Retry if max_completion_tokens unsupported -> fallback to max_tokens
            if (useCompletionTokens && (lowerErr.includes('max_completion_tokens') || lowerErr.includes('unrecognized') || lowerErr.includes('unknown parameter') || lowerErr.includes('extra fields'))) {
              useCompletionTokens = false;
              reqBody = buildReqBody(currentTokens, false, jsonModeActive);
              resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${customKey.key}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(reqBody),
                signal: controller.signal
              });
              continue;
            }

            // 3. Retry if token limit exceeded -> halve tokens and retry
            if ((lowerErr.includes('max_tokens') || lowerErr.includes('maximum') || lowerErr.includes('context_length') || lowerErr.includes('token')) && currentTokens > 2048) {
              currentTokens = Math.floor(currentTokens / 2);
              reqBody = buildReqBody(currentTokens, useCompletionTokens, jsonModeActive);
              resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${customKey.key}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(reqBody),
                signal: controller.signal
              });
              continue;
            }

            const err = new Error(errTxt || 'HTTP 400');
            (err as any).status = 400;
            throw err;
          }

          if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            const err = new Error(errBody || `OpenAI-compatible HTTP ${resp.status}`);
            (err as any).status = resp.status;
            throw err;
          }

          const data: any = await resp.json();
          text = data.choices?.[0]?.message?.content || '';
          tokenCount = data.usage?.total_tokens;
        }

        clearTimeout(timer);

        if (!text || !text.trim()) {
          break;
        }

        if (typeof tokenCount !== 'number') {
          tokenCount = Math.round((options.prompt.length + text.length) / 4);
        }

        return { text, model, tokenCount };
      } catch (err: any) {
        clearTimeout(timer);

        const status = err?.status || err?.response?.status;
        const msg = (err?.message || String(err)).toLowerCase();

        if (
          status === 401 ||
          status === 403 ||
          msg.includes('api_key_invalid') ||
          msg.includes('api key not valid') ||
          msg.includes('unauthorized') ||
          msg.includes('unauthenticated') ||
          msg.includes('permission_denied') ||
          msg.includes('invalid x-api-key')
        ) {
          return null;
        }

        if (isUserExplicitModel) {
          return null;
        }

        if (
          status === 404 ||
          (status === 400 && (
            msg.includes('model_not_found') ||
            msg.includes('does not exist') ||
            msg.includes('not supported') ||
            msg.includes('unknown model') ||
            msg.includes('not found') ||
            msg.includes('deprecated') ||
            msg.includes('retired')
          )) ||
          msg.includes('no longer available') ||
          msg.includes('not found') ||
          msg.includes('does not exist') ||
          msg.includes('model_not_found') ||
          msg.includes('deprecated') ||
          msg.includes('retired')
        ) {
          break;
        }

        if (
          status === 429 ||
          msg.includes('resource_exhausted') ||
          msg.includes('quota') ||
          msg.includes('rate limit')
        ) {
          let delaySec = 0;
          const match = msg.match(/(\d+(\.\d+)?)s/);
          if (match) delaySec = parseFloat(match[1]);

          if (attempts === 1 && delaySec > 0 && delaySec <= 10) {
            await sleep(Math.ceil(delaySec * 1000));
            continue;
          }
          break;
        }

        break;
      }
    }
  }

  return null;
}

interface GeminiFallbackOptions {
  prompt: string;
  preferredModels: string[];
  getConfigForModel: (modelName: string) => any;
  userKeysHeader?: string | string[];
  customKeys?: ParsedCustomKey[];
  maxOutputTokens?: number;
}

interface GeminiFallbackResult {
  text: string;
  accountLabel: string;
  modelName: string;
  usedCustomKeyId?: string;
  usedProvider?: string;
  usedModel?: string;
  tokenCount?: number;
  source?: "custom" | "server";
}

export class GeminiFallbackError extends Error {
  reason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown";
  userMessage: string;

  constructor(
    reason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown",
    userMessage: string,
    message: string
  ) {
    super(message);
    this.name = "GeminiFallbackError";
    this.reason = reason;
    this.userMessage = userMessage;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiWithFallback(options: GeminiFallbackOptions): Promise<GeminiFallbackResult> {
  if (options.customKeys && options.customKeys.length > 0) {
    const chainDeadline = Date.now() + 120000;
    for (const customKey of options.customKeys) {
      if (Date.now() >= chainDeadline) break;
      const customRes = await executeCustomKeyCall(customKey, options, chainDeadline);
      if (customRes && customRes.text) {
        return {
          text: customRes.text,
          accountLabel: customKey.providerName || customKey.provider,
          modelName: customRes.model,
          usedCustomKeyId: customKey.id,
          usedProvider: customKey.provider,
          usedModel: customRes.model,
          tokenCount: customRes.tokenCount,
          source: "custom"
        };
      }
    }
  }
  const accounts = discoverGeminiApiKeys(options.userKeysHeader);
  if (accounts.length === 0) {
    throw new GeminiFallbackError(
      "unknown",
      "هیچ کلید Gemini یافت نشد. از تنظیمات > کلیدهای Gemini یک کلید وارد کنید یا GEMINI_API_KEY را در فایل .env تنظیم کنید.",
      "No Gemini API keys found in environment."
    );
  }

  let lastReason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown" = "unknown";
  let lastErrorMessage = "";

  for (const account of accounts) {
    let skipAccount = false;

    for (const modelName of options.preferredModels) {
      if (skipAccount) break;

      const cacheKey = `${account.keyHash}:${modelName}`;
      if (unavailablePairs.has(cacheKey)) {
        console.log(`[Gemini Fallback] Skipping ${account.label}:${modelName} (cached as unavailable)`);
        continue;
      }

      console.log(`[Gemini Fallback] Attempting ${account.label} with model ${modelName}`);

      let attempts = 0;
      const maxAttempts = 2; // Allow 1 retry for short quota delay

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const config = options.getConfigForModel(modelName);
          const response = await account.client.models.generateContent({
            model: modelName,
            contents: options.prompt,
            config,
          });

          const text = response.text || "";
          return {
            text,
            accountLabel: account.label,
            modelName,
            source: "server",
            usedModel: modelName,
            tokenCount: response.usageMetadata?.totalTokenCount || Math.round((options.prompt.length + text.length) / 4)
          };

        } catch (error: any) {
          const status = error?.status || error?.response?.status;
          const msg = (error?.message || String(error)).toLowerCase();

          console.warn(`[Gemini Fallback] Error on ${account.label} using ${modelName}:`, error?.message || error);
          lastErrorMessage = error?.message || String(error);

          // 1. Auth error (401/403, invalid/revoked key)
          if (status === 401 || status === 403 || msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("unauthorized") || msg.includes("permission_denied")) {
            console.warn(`[Gemini Fallback] Auth error on ${account.label}. Skipping account.`);
            lastReason = "auth_error";
            skipAccount = true;
            break;
          }

          // 2. Model unavailable / retired (404, "not found", "no longer available", "deprecated", "retired")
          if (status === 404 || msg.includes("no longer available") || msg.includes("not found") || msg.includes("deprecated") || msg.includes("retired")) {
            console.warn(`[Gemini Fallback] Model ${modelName} unavailable on ${account.label}. Caching as retired.`);
            unavailablePairs.add(cacheKey);
            lastReason = "model_unavailable";
            break; // move to next model
          }

          // 3. Quota exceeded (429 / RESOURCE_EXHAUSTED)
          if (status === 429 || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("rate limit")) {
            lastReason = "quota_exhausted";
            
            // Check for short retry delay
            let delaySec = 0;
            if (error?.details) {
              const detailsStr = JSON.stringify(error.details);
              const match = detailsStr.match(/(\d+(\.\d+)?)s/);
              if (match) {
                delaySec = parseFloat(match[1]);
              }
            }

            if (attempts === 1 && delaySec > 0 && delaySec <= 10) {
              console.log(`[Gemini Fallback] Quota retry delay suggested: ${delaySec}s. Waiting...`);
              await sleep(Math.ceil(delaySec * 1000));
              continue; // retry attempt 2
            }

            console.warn(`[Gemini Fallback] Quota exhausted for ${account.label}:${modelName}. Moving next.`);
            break; // move to next model
          }

          // 4. Other errors (schema, validation, malformed prompt) -> non-retryable
          console.error(`[Gemini Fallback] Non-retryable error on ${account.label}:${modelName}`);
          throw error;
        }
      }
    }
  }

  // All exhausted
  let userMsg = "سقف استفاده از تمامی حساب‌های هوش مصنوعی موقتاً به پایان رسیده است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.";
  if (lastReason === "auth_error") {
    userMsg = "خطای احراز هویت در کلیدهای API هوش مصنوعی رخ داده است.";
  } else if (lastReason === "model_unavailable") {
    userMsg = "مدل‌های هوش مصنوعی در حال حاضر در دسترس نیستند.";
  }

  throw new GeminiFallbackError(
    lastReason,
    userMsg,
    `All Gemini accounts and fallback models exhausted. Last error: ${lastErrorMessage}`
  );
}

function sanitizeErrorMessage(msg: string, keyToScrub?: string): string {
  if (!msg || typeof msg !== 'string') return 'خطای نامشخص در اعتبارسنجی کلید';
  let clean = msg.replace(/<[^>]*>/g, ' ');
  if (keyToScrub && keyToScrub.length >= 4) {
    clean = clean.split(keyToScrub).join('***');
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.slice(0, 300);
}

// 4.9. Validate Personal API Key (BYOK)
app.post("/api/gemini/validate-key", requireAuth, async (req: AuthRequest, res) => {
  const { apiKey, provider, baseUrl, model, modelMode } = req.body || {};
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length <= 5) {
    return res.status(400).json({ valid: false, error: 'کلید نامعتبر یا بسیار کوتاه است.' });
  }

  const trimmedKey = apiKey.trim();
  const prov = (typeof provider === 'string' ? provider.trim() : detectProvider(trimmedKey)) as ProviderId;
  const providerDef = PROVIDERS.find(p => p.id === prov);

  if (baseUrl) {
    try {
      if (typeof baseUrl !== 'string' || baseUrl.includes('@')) {
        return res.status(400).json({ valid: false, error: 'آدرس Base URL نامعتبر است.' });
      }
      const u = new URL(baseUrl);
      if (u.protocol !== 'https:' || !ALLOWED_BASE_URL_HOSTS.includes(u.hostname) || u.username || u.password) {
        return res.status(400).json({ valid: false, error: 'هاست Base URL مجاز نیست.' });
      }
    } catch {
      return res.status(400).json({ valid: false, error: 'آدرس Base URL نامعتبر است.' });
    }
  }

  const isExact = modelMode === 'exact';
  const modelsToValidate: string[] = isExact && model
    ? [model]
    : (providerDef?.candidateModels && providerDef.candidateModels.length > 0
        ? providerDef.candidateModels
        : (model ? [model] : ['gpt-4o-mini']));

  let lastError = '';
  let isAuthFailure = false;

  for (const targetModel of modelsToValidate) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      if (prov === 'gemini') {
        const client = new GoogleGenAI({ apiKey: trimmedKey });
        await client.models.generateContent({
          model: targetModel,
          contents: 'ping',
          config: { maxOutputTokens: 16 }
        });
        clearTimeout(timer);
        return res.json({ valid: true, model: targetModel, workingModel: targetModel });
      } else if (prov === 'anthropic') {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: targetModel,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'ping' }]
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (resp.ok) {
          return res.json({ valid: true, model: targetModel, workingModel: targetModel });
        }
        const errText = await resp.text().catch(() => '');
        const status = resp.status;
        lastError = sanitizeErrorMessage(errText || `خطای سرویس (${status})`, trimmedKey);
        if (status === 401 || status === 403) {
          isAuthFailure = true;
          break;
        }
      } else {
        let endpoint = baseUrl || providerDef?.defaultBaseUrl || 'https://api.openai.com/v1';
        if (!endpoint.endsWith('/chat/completions')) {
          endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
        }

        let reqBody: any = {
          model: targetModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 16
        };

        let resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${trimmedKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody),
          signal: controller.signal
        });

        if (resp.status === 400) {
          const errBody = await resp.text().catch(() => '');
          if (errBody.toLowerCase().includes('max_completion_tokens')) {
            delete reqBody.max_tokens;
            reqBody.max_completion_tokens = 16;
            resp = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${trimmedKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(reqBody),
              signal: controller.signal
            });
          }
        }

        clearTimeout(timer);
        if (resp.ok) {
          return res.json({ valid: true, model: targetModel, workingModel: targetModel });
        }

        const errText = await resp.text().catch(() => '');
        const status = resp.status;
        lastError = sanitizeErrorMessage(errText || `خطای سرویس (${status})`, trimmedKey);
        if (status === 401 || status === 403) {
          isAuthFailure = true;
          break;
        }
      }
    } catch (err: any) {
      clearTimeout(timer);
      const msg = err?.message || String(err);
      const status = err?.status || err?.response?.status;
      lastError = sanitizeErrorMessage(msg, trimmedKey);
      if (status === 401 || status === 403 || msg.toLowerCase().includes('api_key_invalid') || msg.toLowerCase().includes('unauthorized')) {
        isAuthFailure = true;
        break;
      }
    }
  }

  if (isAuthFailure) {
    return res.status(401).json({ valid: false, error: lastError || 'کلید وارد شده نامعتبر یا غیرمجاز است.' });
  }

  if (isExact) {
    const isModelNotFound = lastError.toLowerCase().includes('model_not_found') || 
                            lastError.toLowerCase().includes('does not exist') || 
                            lastError.toLowerCase().includes('404');
    const userMsg = isModelNotFound 
      ? `مدل انتخابی '${model}' در این سرویس یافت نشد یا بازنشسته شده است. از دکمه «دریافت مدل‌های فعال» استفاده کنید.`
      : lastError;
    return res.status(400).json({ valid: false, error: userMsg });
  }

  return res.status(400).json({ 
    valid: false, 
    error: lastError || 'هیچ‌یک از مدل‌های کاندید برای این ارائه‌دهنده در دسترس نیستند. لطفاً یک مدل دقیق مشخص کنید.' 
  });
});

// 4.10. Fetch Live Provider Models (BYOK)
app.post("/api/gemini/list-models", requireAuth, async (req: AuthRequest, res) => {
  const { provider, apiKey, baseUrl } = req.body || {};
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length <= 5) {
    return res.status(400).json({ success: false, models: [], error: 'کلید نامعتبر یا بسیار کوتاه است.' });
  }

  const trimmedKey = apiKey.trim();
  const prov = (typeof provider === 'string' ? provider.trim() : detectProvider(trimmedKey)) as ProviderId;
  const providerDef = PROVIDERS.find(p => p.id === prov);

  if (baseUrl) {
    try {
      if (typeof baseUrl !== 'string' || baseUrl.includes('@')) {
        return res.status(400).json({ success: false, models: [], error: 'آدرس Base URL نامعتبر است.' });
      }
      const u = new URL(baseUrl);
      if (u.protocol !== 'https:' || !ALLOWED_BASE_URL_HOSTS.includes(u.hostname) || u.username || u.password) {
        return res.status(400).json({ success: false, models: [], error: 'هاست Base URL مجاز نیست.' });
      }
    } catch {
      return res.status(400).json({ success: false, models: [], error: 'آدرس Base URL نامعتبر است.' });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    let models: string[] = [];

    if (prov === 'gemini') {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}`, {
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return res.status(resp.status).json({ success: false, models: [], error: sanitizeErrorMessage(errText || `خطا در فراخوانی جمینای (${resp.status})`, trimmedKey) });
      }
      const data: any = await resp.json().catch(() => ({}));
      if (Array.isArray(data.models)) {
        models = data.models
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods.includes('generateContent') : true)
          .map((m: any) => typeof m.name === 'string' ? m.name.replace(/^models\//, '') : '')
          .filter(Boolean);
      }
    } else if (prov === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': trimmedKey,
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return res.status(resp.status).json({ success: false, models: [], error: sanitizeErrorMessage(errText || `خطا در فراخوانی آنتروپیک (${resp.status})`, trimmedKey) });
      }
      const data: any = await resp.json().catch(() => ({}));
      if (Array.isArray(data.data)) {
        models = data.data.map((m: any) => m.id).filter(Boolean);
      }
    } else {
      let endpoint = baseUrl || providerDef?.defaultBaseUrl || 'https://api.openai.com/v1';
      endpoint = endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '') + '/models';

      const resp = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${trimmedKey}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return res.status(resp.status).json({ success: false, models: [], error: sanitizeErrorMessage(errText || `خطا در فراخوانی مدل‌ها (${resp.status})`, trimmedKey) });
      }
      const data: any = await resp.json().catch(() => ({}));
      if (Array.isArray(data.data)) {
        models = data.data.map((m: any) => m.id).filter(Boolean);
      } else if (Array.isArray(data.models)) {
        models = data.models.map((m: any) => typeof m === 'string' ? m : m.id || m.name).filter(Boolean);
      }
    }

    const uniqueModels = Array.from(new Set(models)).sort();
    return res.json({ success: true, models: uniqueModels });
  } catch (err: any) {
    clearTimeout(timer);
    const msg = err?.message || String(err);
    return res.status(500).json({ success: false, models: [], error: sanitizeErrorMessage(msg, trimmedKey) });
  }
});

// 5. Intelligent AI Weekly Analytics & Productivity Analysis (Gemini)
app.post("/api/gemini/analyze-planner", requireAuth, async (req: AuthRequest, res) => {
  const { plannerData } = req.body;

  if (!plannerData) {
    return res.status(400).json({ error: "داده‌های برنامه‌ریزی برای تحلیل ارسال نشده است" });
  }

  try {
    // We build a descriptive prompt summarizing the user's weekly planner data
    const prompt = `You are an elite academic productivity coach and cognitive psychologist specializing in student behavioral analysis. Your task is to analyze the user's weekly planner data and provide exactly 3 precise, deeply personalized, actionable insights in Persian (Farsi) that directly reference the user's real tasks, habits, thoughts, and progress.

User's Weekly Planner Data (JSON format):
${JSON.stringify(plannerData, null, 2)}

Please thoroughly read:
1. Daily Tasks (dailyTasks) for each day of the week. Look at what tasks they set, which ones are 'completed', 'failed', or 'pending'.
2. Core Weekly Tasks (coreTasks) - their importance and status.
3. Secondary Weekly Tasks (secondaryTasks) - their categories, statuses, and specific names.
4. Habits/Routines (reminders) - their specific titles and how many days they actually checked off (checkedDays).
5. Postponed or Canceled Events (postponedEvents).
6. Personal Thoughts or Notes (notes, dailyThoughts, weeklyEvents).

Guidelines for Insights:
- Avoid generic praise or general productivity cliches.
- Reference their specific tasks or habits BY NAME (in Persian) to show you did a genuine analysis of their data.
- Analyze correlations, e.g., "On days you had intense university classes, your language routine or coding task was failed/postponed," or "Your consistency in sports was high (5 days), which correlates with positive thoughts in your notes."
- Ground your advice in cognitive science and behavioral psychology models (e.g., Cognitive Load Theory, Spaced Repetition, Eisenhower Matrix, Atomic Habits, Zeigarnik effect, Pomodoro, Positive Reinforcement).

Format requirement:
You MUST return exactly 3 insights as a raw JSON array matching this typescript schema:
interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;          // Short, high-impact Persian title (max 6 words)
  message: string;        // Deeply personalized Persian analysis/coaching advice (2-3 complete sentences), referencing specific task names/habits.
  icon: 'AlertTriangle' | 'Sparkles' | 'Brain' | 'Award' | 'Clock' | 'Activity' | 'Zap'; // Appropriate Lucide icon name matching the type and content
  ctaText: string;        // Scientific action button text in Persian (e.g., 'بازتنظیم روتین‌های روزانه', 'شروع تکنیک پومودورو')
  scientificMethod: string; // The specific scientific model or technique in Persian (e.g., 'تئوری تقویت مثبت', 'مدیریت بار شناختی')
  footerText: string;     // Scientific rationale in Persian (e.g., 'طبق روش علمی: بازتنظیم ساختار شناختی')
}

Return ONLY the raw JSON array. Do NOT wrap it in markdown code blocks like \`\`\`json. Your output must be directly parseable with JSON.parse().`;

    const plannerConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "An array of exactly 3 personalized insights.",
        items: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: ["warning", "success", "info"],
              description: "The type of insight: warning, success, or info.",
            },
            title: {
              type: Type.STRING,
              description: "Short, high-impact Persian title (max 6 words).",
            },
            message: {
              type: Type.STRING,
              description: "Deeply personalized Persian analysis/coaching advice (2-3 complete sentences), referencing specific task names/habits.",
            },
            icon: {
              type: Type.STRING,
              enum: ["AlertTriangle", "Sparkles", "Brain", "Award", "Clock", "Activity", "Zap"],
              description: "Appropriate Lucide icon name matching the type and content.",
            },
            ctaText: {
              type: Type.STRING,
              description: "Scientific action button text in Persian.",
            },
            scientificMethod: {
              type: Type.STRING,
              description: "The specific scientific model or technique in Persian.",
            },
            footerText: {
              type: Type.STRING,
              description: "Scientific rationale in Persian.",
            },
          },
          required: ["type", "title", "message", "icon", "ctaText", "scientificMethod", "footerText"],
        },
      },
    };

    const userKeysHeader = req.headers['x-gemini-keys'] as string | undefined;
    const customKeys = parseCustomApiKeys(req);

    const result = await callGeminiWithFallback({
      prompt,
      preferredModels: GEMINI_FALLBACK_MODELS,
      getConfigForModel: () => plannerConfig,
      userKeysHeader,
      customKeys,
    });

    const { text } = result;

    res.setHeader("x-used-custom-key-id", result.usedCustomKeyId || "");
    res.setHeader("x-used-provider", result.usedProvider || "");
    res.setHeader("x-used-model", result.usedModel || result.modelName || "");
    res.setHeader("x-fallback-used", result.source || "server");
    res.setHeader("x-used-token-count", String(result.tokenCount ?? 0));
    res.setHeader("Access-Control-Expose-Headers", "x-used-custom-key-id, x-used-provider, x-used-model, x-fallback-used, x-used-token-count");

    if (!text) {
      throw new Error("پاسخی از مدل هوش مصنوعی دریافت نشد.");
    }

    // Clean and extract valid JSON array robustly
    let insights;
    const trimmed = text.trim();
    try {
      insights = JSON.parse(trimmed);
    } catch (parseErr) {
      console.warn("Direct JSON parsing failed, attempting substring extraction", parseErr);
      const startIdx = trimmed.indexOf('[');
      const endIdx = trimmed.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonStr = trimmed.substring(startIdx, endIdx + 1);
        insights = JSON.parse(jsonStr);
      } else {
        throw new Error("قالب داده‌های بازگشتی هوش مصنوعی نامعتبر است.");
      }
    }

    res.json({ success: true, insights });
  } catch (error: any) {
    console.error("Gemini Weekly Planner Analysis Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "خطا در برقراری ارتباط با هوش مصنوعی برای تحلیل",
      userMessage: error.userMessage || error.message || "خطا در برقراری ارتباط با هوش مصنوعی برای تحلیل",
      reason: error.reason || "unknown"
    });
  }
});

function extractRobustJson(rawText: string): any {
  if (!rawText || !rawText.trim()) {
    throw new Error("پاسخ هوش مصنوعی خالی است");
  }
  let str = rawText.trim();
  // Strip reasoning or think tags
  str = str.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown code fences if present
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    str = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(str);
  } catch {
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = str.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        const fixed = candidate.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(fixed);
      }
    }
    throw new Error("امکان استخراج JSON از پاسخ هوش مصنوعی وجود ندارد: " + str.slice(0, 150));
  }
}

function sanitizePhases(rawPhases: any): any[] {
  if (!Array.isArray(rawPhases)) {
    return [];
  }
  const cleanPhases: any[] = [];
  for (let i = 0; i < rawPhases.length; i++) {
    const ph = rawPhases[i];
    if (!ph || typeof ph !== "object") continue;

    const phaseNumber = Number(ph.phase_number) || (cleanPhases.length + 1);
    const title = typeof ph.title === "string" && ph.title.trim() ? ph.title.trim() : `فاز ${phaseNumber}`;
    const description = typeof ph.description === "string" ? ph.description : "";
    const estimated_weeks = typeof ph.estimated_weeks === "string" ? ph.estimated_weeks : "";

    // Guarantee weeks is always a valid array
    let rawWeeks: any[] = [];
    if (Array.isArray(ph.weeks)) {
      rawWeeks = ph.weeks;
    } else if (ph.weeks && typeof ph.weeks === "object" && Array.isArray((ph.weeks as any).weeks)) {
      rawWeeks = (ph.weeks as any).weeks;
    } else {
      rawWeeks = [];
    }

    const cleanWeeks: any[] = [];
    for (let wIdx = 0; wIdx < rawWeeks.length; wIdx++) {
      const w = rawWeeks[wIdx];
      if (!w || typeof w !== "object") continue;
      const weekNumber = Number(w.week_number) || (wIdx + 1);
      const weekTitle = typeof w.week_title === "string" && w.week_title.trim() ? w.week_title.trim() : `هفته ${weekNumber}`;
      const weeklyGoal = typeof w.weekly_goal === "string" ? w.weekly_goal : "";
      const practiceExercise = typeof w.practice_exercise === "string" ? w.practice_exercise : "";

      const rawTasks = Array.isArray(w.tasks) ? w.tasks : [];
      const cleanTasks = rawTasks
        .filter((t: any) => t && typeof t === "object")
        .map((t: any) => ({
          title: typeof t.title === "string" && t.title.trim() ? t.title.trim() : "تسک بدون عنوان",
          description: typeof t.description === "string" ? t.description : "",
          type: (t.type === "core" || t.type === "secondary" || t.type === "habit") ? t.type : "core",
          suggested_weekday: typeof t.suggested_weekday === "string" ? t.suggested_weekday : "saturday",
          deadline_note: typeof t.deadline_note === "string" ? t.deadline_note : undefined,
        }));

      cleanWeeks.push({
        week_number: weekNumber,
        week_title: weekTitle,
        weekly_goal: weeklyGoal,
        practice_exercise: practiceExercise,
        tasks: cleanTasks,
      });
    }

    const phaseTasks = (Array.isArray(ph.tasks) ? ph.tasks : [])
      .filter((t: any) => t && typeof t === "object")
      .map((t: any) => ({
        title: typeof t.title === "string" && t.title.trim() ? t.title.trim() : "تسک فاز",
        description: typeof t.description === "string" ? t.description : "",
        type: (t.type === "core" || t.type === "secondary" || t.type === "habit") ? t.type : "core",
        suggested_weekday: typeof t.suggested_weekday === "string" ? t.suggested_weekday : "saturday",
        deadline_note: typeof t.deadline_note === "string" ? t.deadline_note : undefined,
      }));

    cleanPhases.push({
      phase_number: phaseNumber,
      title,
      description,
      estimated_weeks,
      weeks: cleanWeeks,
      tasks: phaseTasks,
    });
  }
  return cleanPhases;
}

// 5.1. Target-Goal Management & Feasibility Prediction API (Gemini & Multi-Provider)
app.get("/api/gemini/analyze-goal", (_req, res) => {
  res.json({ error: "GET not supported" });
});

app.post("/api/gemini/analyze-goal", async (req: express.Request, res: express.Response) => {
  const { action, title, totalWeeks, averageTcr, universityHours, currentWeekIndex, milestones, completedWeeksHistory } = req.body;

  if (!title) {
    return res.status(400).json({ error: "عنوان هدف ارسال نشده است" });
  }

  try {
    if (action === "next-week") {
      const prompt = `You are an elite academic productivity coach and cognitive psychologist. The user is pursuing a long-term goal. 
Goal Title: ${title}
Total Weeks: ${totalWeeks}
Current Active Week Index (1-based, completed week): ${currentWeekIndex}
Milestones defined initially: ${JSON.stringify(milestones, null, 2)}
Completion history and feedback of previous weeks: ${JSON.stringify(completedWeeksHistory || [], null, 2)}

Your task is to generate the concrete plan (week tasks) for the NEXT week (Week ${Number(currentWeekIndex) + 1}) to ensure dynamic journey continuity and steady progress towards the goal. Provide highly specific, actionable, and scientifically-grounded tasks.

You must return a JSON object matching this schema:
{
  "justification": "Persian short coaching feedback and justification of changes/emphasis for this upcoming week.",
  "week_tasks": [
    { 
      "title": "Specific Persian task title", 
      "description": "Detailed Persian task execution instructions", 
      "type": "core" | "secondary" | "habit",
      "suggested_weekday": "saturday" | "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday"
    }
  ]
}
Return EXACTLY 3-6 tasks. Types can be 'core', 'secondary', or 'habit'.
Return ONLY valid JSON. Do not wrap in markdown code blocks.`;

      const getConfigForNextWeek = (modelName: string) => {
        const baseConfig: any = {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              justification: {
                type: Type.STRING,
                description: "تحلیل روند طی شده و توصیه برای هفته پیش رو به فارسی روان"
              },
              week_tasks: {
                type: Type.ARRAY,
                description: "لیست تسک‌های پیشنهادی برای هفته بعد",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "عنوان مشخص و دقیق تسک به فارسی" },
                    description: { type: Type.STRING, description: "توضیحات کامل و عملیاتی تسک" },
                    type: { type: Type.STRING, enum: ["core", "secondary", "habit"], description: "نوع تسک" },
                    suggested_weekday: { type: Type.STRING, description: "روز پیشنهادی هفته" }
                  },
                  required: ["title", "description", "type"]
                }
              }
            },
            required: ["justification", "week_tasks"]
          }
        };
        if (modelName === "gemini-3.1-pro-preview") {
          baseConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        }
        return baseConfig;
      };

      const userKeysHeader = req.headers['x-gemini-keys'] as string | undefined;
      const customKeys = parseCustomApiKeys(req);

      const result = await callGeminiWithFallback({
        prompt,
        preferredModels: GOAL_ANALYSIS_MODELS,
        getConfigForModel: getConfigForNextWeek,
        userKeysHeader,
        customKeys,
      });

      const { text } = result;

      res.setHeader("x-used-custom-key-id", result.usedCustomKeyId || "");
      res.setHeader("x-used-provider", result.usedProvider || "");
      res.setHeader("x-used-model", result.usedModel || result.modelName || "");
      res.setHeader("x-fallback-used", result.source || "server");
      res.setHeader("x-used-token-count", String(result.tokenCount ?? 0));
      res.setHeader("Access-Control-Expose-Headers", "x-used-custom-key-id, x-used-provider, x-used-model, x-fallback-used, x-used-token-count");

      const textVal = text || "{}";
      const parsed = JSON.parse(textVal.trim());
      return res.json({ success: true, ...parsed });

    } else {
      // Action: analyze (initial goal analysis - GENERATE FULL ROADMAP AT ONCE)
      const prompt = `شما یک مشاور ارشد بهره‌وری علمی، طراح تخصصی نقشه راه (Specialized Roadmap Architect) و استاد برنامه‌ریزی درسی و مهارتی هستید. کاربر در حال ثبت یک هدف جدید است:
عنوان هدف: ${title}
مدت زمان پیشنهادی کاربر برای اتمام هدف: ${totalWeeks} هفته
نرخ متوسط تکمیل کارهای قبلی کاربر (TCR): ${averageTcr || 70}%
ساعات درگیر کلاس‌های دانشگاهی/آموزشی: ${universityHours || 0} ساعت در هفته

قوانین و الزامات کلیدی پاسخ شما (بسیار مهم):

۱. تخمین زمان و سنجش امکان‌پذیری:
   - تخمین هوشمندانه خود از زمان واقعی مورد نیاز را در ai_estimated_weeks بدهید.
   - نمره احتمال موفقیت واقعی (Feasibility Score) بین 0 تا 100 بدهید.
   - تحلیل مشاوره‌ای و انگیزشی دقیق در justification ارائه دهید.

۲. تمرینات دقیق، مشخص و عملی (Practical Exercises & Drills):
   - اگر این هدف به تمرین عملی، حل مسئله، کدنویسی، پروژه، تمرین زبان، تمرین ورزشی، هنر، تحلیل، نوشتن یا مهارتی نیاز دارد، باید حداقل ۳ تا ۶ تمرین کاملا مشخص و دقیق در آرایه practical_exercises ارائه دهید.
   - هر تمرین باید دارای target_drill واضح و ملموس باشد (مثلاً: "حل ۱۵ مسئله مشتق از فصل ۳ کتاب مرجع"، "پیاده‌سازی یک اپلیکیشن مدیریت تسک با React"، "تمرین مکالمه ۱۰ دقیقه‌ای درباره موضوع سفر با ساخت ۲۰ جمله جدید"). کاربر باید دقیقا بداند چه تمرینی را چگونه انجام دهد.

۳. تفکیک دقیق و جداگانه تک‌تک هفته‌ها (Week-by-Week Granular Breakdown):
   - شما باید نقشه راه را برای تمام ${totalWeeks} هفته به صورت **کاملاً جداگانه و تک‌تک هفته‌ها** (Week 1, Week 2, Week 3, ..., Week ${totalWeeks}) خرد و تفکیک کنید.
تمام هفته‌ها از ۱ تا ${totalWeeks} را کامل تولید کن؛ بدون placeholder، بدون خلاصه‌سازی، بدون تجمیع هفته‌ها؛ کامل‌ترین و باجزئیات‌ترین پاسخ ممکن را بده.
   - به هیچ وجه نباید چند هفته را تجمیع یا کلی‌گویی کنید (مثلا تجمیع هفته ۱ تا ۳ ممنوع است!). باید هر هفته به عنوان یک واحد مستقل دارای عنوان هفته (week_title)، هدف هفته (weekly_goal)، تمرین عملی مشخص این هفته (practice_exercise) و حداقل ۳ تا ۵ تسک عملیاتی، جزئی و کامل (tasks) باشد.
   - برای هر تسک: title شفاف و دقیق، description کامل با جزئیات اجرایی، type ('core' یا 'secondary' یا 'habit')، suggested_weekday و deadline_note قرار دهید.

پاسخ را دقیقا در ساختار JSON زیر ارسال کنید:
{
  "feasibility_score": 85,
  "ai_estimated_weeks": ${totalWeeks},
  "justification": "تحلیل کاملاً علمی و مشاوره‌ای به زبان فارسی روان...",
  "practical_exercises": [
    {
      "title": "عنوان مشخص تمرین یا پروژه",
      "description": "توضیحات دقیق و نحوه اجرای گام به گام تمرین",
      "target_drill": "تمرین یا مسئله نمونه کاملا مشخص (مثلا: حل ۱۰ مسئله فصل ۳ یا ساخت وبسایت X)",
      "type": "exercise"
    }
  ],
  "phases": [
    {
      "phase_number": 1,
      "title": "عنوان فاز اول (مثلا: فاز مفاهیم پایه و زیربنایی)",
      "description": "توضیحات و اهداف کلیدی این فاز...",
      "estimated_weeks": "هفته ۱ تا ۳",
      "weeks": [
        {
          "week_number": 1,
          "week_title": "هفته ۱: راه‌اندازی محیط و یادگیری مفاهیم اولیه",
          "weekly_goal": "تسلط بر پایه‌ها و ساخت اولین نمونه کار",
          "practice_exercise": "حل ۵ تمرین نمونه و پیاده‌سازی پروژه اولیه",
          "tasks": [
            {
              "title": "عنوان دقیق تسک ۱",
              "description": "توضیحات کامل و گام‌به‌گام نحوه اجرای تسک...",
              "type": "core",
              "suggested_weekday": "saturday",
              "deadline_note": "تا انتهای روز شنبه"
            }
          ]
        }
      ],
      "tasks": [
        {
          "title": "عنوان تسک تجمیعی فاز",
          "description": "توضیحات تسک",
          "type": "core",
          "suggested_weekday": "saturday",
          "deadline_note": "تا انتهای هفته"
        }
      ]
    }
  ]
}`;

      const getConfigForGoalAnalysis = (modelName: string) => {
        const baseConfig: any = {
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feasibility_score: {
                type: Type.INTEGER,
                description: "نمره احتمال موفقیت واقعی بین 0 تا 100"
              },
              ai_estimated_weeks: {
                type: Type.INTEGER,
                description: "تخمین هوش مصنوعی از هفته‌های مورد نیاز"
              },
              justification: {
                type: Type.STRING,
                description: "توجیه کوتاه نمره و تحلیل اولیه به فارسی روان"
              },
              practical_exercises: {
                type: Type.ARRAY,
                description: "تمرینات عملی، پروژه‌ای و دریل‌های مشخص برای تثبیت مهارت",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "عنوان مشخص تمرین به فارسی" },
                    description: { type: Type.STRING, description: "توضیحات کامل نحوه اجرای تمرین" },
                    target_drill: { type: Type.STRING, description: "تمرین یا مسئله نمونه کاملا مشخص (مثلا: حل ۱۰ سوال فصل ۳)" },
                    type: { type: Type.STRING, enum: ["project", "drill", "exercise", "assignment"], description: "نوع تمرین" }
                  },
                  required: ["title", "description", "target_drill"]
                }
              },
              phases: {
                type: Type.ARRAY,
                description: "تمام فازهای نقشه راه کل مسیر یک‌جا",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phase_number: { type: Type.INTEGER, description: "شماره فاز" },
                    title: { type: Type.STRING, description: "عنوان فاز به فارسی" },
                    description: { type: Type.STRING, description: "توضیحات و اهداف فاز" },
                    estimated_weeks: { type: Type.STRING, description: "بازه‌های زمانی فاز" },
                    weeks: {
                      type: Type.ARRAY,
                      description: "تفکیک کامل و جداگانه تک‌تک هفته‌های این فاز",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          week_number: { type: Type.INTEGER, description: "شماره هفته (مثلا ۱، ۲، ۳...)" },
                          week_title: { type: Type.STRING, description: "عنوان مشخص و جذاب این هفته" },
                          weekly_goal: { type: Type.STRING, description: "هدف اصلی این هفته مشخص" },
                          practice_exercise: { type: Type.STRING, description: "تمرین عملی مشخص این هفته" },
                          tasks: {
                            type: Type.ARRAY,
                            description: "لیست تسک‌های ریز و دقیق این هفته",
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                title: { type: Type.STRING, description: "عنوان مشخص تسک به فارسی" },
                                description: { type: Type.STRING, description: "توضیحات کامل و عملیاتی تسک به فارسی" },
                                type: { type: Type.STRING, enum: ["core", "secondary", "habit"], description: "نوع تسک" },
                                suggested_weekday: { type: Type.STRING, description: "روز پیشنهادی هفته" },
                                deadline_note: { type: Type.STRING, description: "مهلت یا ددلاین پیشنهادی" }
                              },
                              required: ["title", "description", "type"]
                            }
                          }
                        },
                        required: ["week_number", "week_title", "tasks"]
                      }
                    },
                    tasks: {
                      type: Type.ARRAY,
                      description: "لیست تسک‌های ریز و دقیق فاز",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING, description: "عنوان مشخص تسک به فارسی" },
                          description: { type: Type.STRING, description: "توضیحات کامل و عملیاتی تسک به فارسی" },
                          type: { type: Type.STRING, enum: ["core", "secondary", "habit"], description: "نوع تسک" },
                          suggested_weekday: { type: Type.STRING, description: "روز پیشنهادی هفته" },
                          deadline_note: { type: Type.STRING, description: "مهلت یا ددلاین پیشنهادی" }
                        },
                        required: ["title", "description", "type"]
                      }
                    }
                  },
                  required: ["phase_number", "title", "description"]
                }
              }
            },
            required: ["feasibility_score", "ai_estimated_weeks", "justification", "phases"]
          }
        };
        if (modelName === "gemini-3.1-pro-preview") {
          baseConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        }
        return baseConfig;
      };

      const userKeysHeader = req.headers['x-gemini-keys'] as string | undefined;
      const customKeys = parseCustomApiKeys(req);

      const result = await callGeminiWithFallback({
        prompt,
        preferredModels: GOAL_ANALYSIS_MODELS,
        getConfigForModel: getConfigForGoalAnalysis,
        maxOutputTokens: 32768,
        userKeysHeader,
        customKeys,
      });

      const { text } = result;

      res.setHeader("x-used-custom-key-id", result.usedCustomKeyId || "");
      res.setHeader("x-used-provider", result.usedProvider || "");
      res.setHeader("x-used-model", result.usedModel || result.modelName || "");
      res.setHeader("x-fallback-used", result.source || "server");
      res.setHeader("x-used-token-count", String(result.tokenCount ?? 0));
      res.setHeader("Access-Control-Expose-Headers", "x-used-custom-key-id, x-used-provider, x-used-model, x-fallback-used, x-used-token-count");

      const textVal = text || "{}";
      const parsed = extractRobustJson(textVal);

      // Task 1: Sanitize initial phases immediately
      parsed.phases = sanitizePhases(parsed.phases);

      // Task 2: Target coverage is user requested totalWeeks (or ai_estimated_weeks if totalWeeks not given)
      const requestedTotalWeeks = Math.max(1, Number(totalWeeks) || Number(parsed.ai_estimated_weeks) || 1);
      const targetWeeks = requestedTotalWeeks;

      const getCoveredWeeksSet = (phasesList: any[]): Set<number> => {
        const set = new Set<number>();
        for (const ph of phasesList) {
          if (Array.isArray(ph.weeks)) {
            for (const w of ph.weeks) {
              const num = Number(w.week_number);
              if (num >= 1 && num <= targetWeeks) {
                set.add(num);
              }
            }
          }
        }
        return set;
      };

      const getMissingWeeks = (phasesList: any[]): number[] => {
        const covered = getCoveredWeeksSet(phasesList);
        const missing: number[] = [];
        for (let w = 1; w <= targetWeeks; w++) {
          if (!covered.has(w)) {
            missing.push(w);
          }
        }
        return missing;
      };

      let missingWeeks = getMissingWeeks(parsed.phases);
      let continuationRound = 0;
      const MAX_CONTINUATION_ROUNDS = 4;

      while (missingWeeks.length > 0 && continuationRound < MAX_CONTINUATION_ROUNDS) {
        continuationRound++;
        const chunkWeeks = missingWeeks.slice(0, 6);
        console.log(`[analyze-goal] Continuation round ${continuationRound}: requesting missing weeks [${chunkWeeks.join(", ")}] of ${targetWeeks}`);

        try {
          const contPrompt = `ادامهٔ نقشه راه برای هدف "${title}".
هفته‌های باقی‌مانده و مورد نیاز این بخش: [${chunkWeeks.join(", ")}].
دقیقاً برای تک‌تک این هفته‌ها (${chunkWeeks.join(", ")}) محتوای کامل شامل عنوان هفته (week_title)، هدف هفته (weekly_goal)، تمرین عملی مشخص (practice_exercise) و حداقل ۳ تسک عملیاتی (tasks با title و description و type) تولید کن.
پاسخ باید دقیقاً یک شیء JSON با ساختار زیر باشد:
{
  "phases": [
    {
      "phase_number": 1,
      "title": "عنوان فاز",
      "description": "توضیحات فاز",
      "weeks": [
        {
          "week_number": ${chunkWeeks[0]},
          "week_title": "هفته ${chunkWeeks[0]}: عنوان هفته",
          "weekly_goal": "هدف این هفته",
          "practice_exercise": "تمرین عملی",
          "tasks": [
            {
              "title": "عنوان تسک",
              "description": "توضیحات تسک",
              "type": "core",
              "suggested_weekday": "saturday"
            }
          ]
        }
      ],
      "tasks": []
    }
  ]
}
فقط JSON خالص بازگردان بدون هیچ متن اضافی.`;

          const contResult = await callGeminiWithFallback({
            prompt: contPrompt,
            preferredModels: GOAL_ANALYSIS_MODELS,
            getConfigForModel: getConfigForGoalAnalysis,
            maxOutputTokens: 32768,
            userKeysHeader,
            customKeys,
          });

          const contParsed = extractRobustJson(contResult.text || "{}");
          const contPhases = sanitizePhases(contParsed.phases);

          const existingByNumber = new Map<number, any>();
          parsed.phases.forEach((ph: any) => existingByNumber.set(Number(ph.phase_number), ph));

          for (const cph of contPhases) {
            const num = Number(cph.phase_number);
            const target = existingByNumber.get(num);
            if (target) {
              const seenWeeks = new Set((target.weeks || []).map((w: any) => Number(w.week_number)));
              for (const nw of cph.weeks) {
                if (!seenWeeks.has(Number(nw.week_number))) {
                  target.weeks.push(nw);
                  seenWeeks.add(Number(nw.week_number));
                }
              }
              target.weeks.sort((a: any, b: any) => (Number(a.week_number) || 0) - (Number(b.week_number) || 0));
              if (Array.isArray(cph.tasks) && cph.tasks.length > 0) {
                target.tasks = [...(target.tasks || []), ...cph.tasks];
              }
            } else {
              parsed.phases.push(cph);
              existingByNumber.set(num, cph);
            }
          }

          parsed.phases = sanitizePhases(parsed.phases);
          missingWeeks = getMissingWeeks(parsed.phases);
        } catch (contErr: any) {
          console.warn(`[analyze-goal] Continuation round ${continuationRound} failed:`, contErr?.message || contErr);
          break;
        }
      }

      // Final sanitize check to guarantee no invalid phase or non-array weeks
      parsed.phases = sanitizePhases(parsed.phases);
      const coveredWeeksSet = getCoveredWeeksSet(parsed.phases);
      const coveredWeeks = coveredWeeksSet.size;
      const coverageComplete = coveredWeeks >= targetWeeks;

      const activeProvider = result.usedProvider || (result.source === 'custom' ? result.accountLabel : 'gemini');
      const activeModel = result.usedModel || result.modelName || 'gemini';

      console.log(`[analyze-goal] Complete. Provider: "${activeProvider}", Model: "${activeModel}", Expected: ${targetWeeks}, Covered: ${coveredWeeks}, Complete: ${coverageComplete}`);

      return res.json({
        success: true,
        ...parsed,
        provider: activeProvider,
        model: activeModel,
        source: result.source || 'server',
        coverage: {
          complete: coverageComplete,
          expectedWeeks: targetWeeks,
          coveredWeeks,
          ...(coverageComplete ? {} : { warning: `نقشه راه تا هفته ${coveredWeeks} از ${targetWeeks} هفته مورد نیاز تکمیل شد.` })
        }
      });
    }

  } catch (error: any) {
    console.error("Gemini Goal Analysis Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "خطا در تحلیل هدف",
      userMessage: error.userMessage || error.message || "خطا در تحلیل هدف",
      reason: error.reason || "unknown"
    });
  }
});

// --- VITE DEV OR PROD MIDDLEWARE SETUP ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log("route registered: /api/gemini/analyze-goal");
  });
}

startServer();
