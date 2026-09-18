import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import "dotenv/config";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
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
  if (!storedHash) return true;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return true;
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
}

function discoverGeminiApiKeys(): GeminiAccount[] {
  const accounts: GeminiAccount[] = [];

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
    accounts.push({
      client: new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      }),
      label: "primary"
    });
  }

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
    accounts.push({
      client: new GoogleGenAI({
        apiKey: acc.key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      }),
      label: `account-${acc.num}`
    });
  }

  return accounts;
}

const unavailablePairs = new Set<string>();

const GEMINI_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
const GOAL_ANALYSIS_MODELS = ["gemini-3.1-pro-preview", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];

interface GeminiFallbackOptions {
  prompt: string;
  preferredModels: string[];
  getConfigForModel: (modelName: string) => any;
}

interface GeminiFallbackResult {
  text: string;
  accountLabel: string;
  modelName: string;
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
  const accounts = discoverGeminiApiKeys();
  if (accounts.length === 0) {
    throw new GeminiFallbackError(
      "unknown",
      "کلید API هوش مصنوعی در سرور یافت نشد. لطفاً در تنظیمات آن را وارد کنید.",
      "No Gemini API keys found in environment."
    );
  }

  let lastReason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown" = "unknown";
  let lastErrorMessage = "";

  for (const account of accounts) {
    let skipAccount = false;

    for (const modelName of options.preferredModels) {
      if (skipAccount) break;

      const cacheKey = `${account.label}:${modelName}`;
      if (unavailablePairs.has(cacheKey)) {
        console.log(`[Gemini Fallback] Skipping ${cacheKey} (cached as unavailable)`);
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
          console.log(`[Gemini Fallback] Success on ${account.label} with model ${modelName}`);
          return { text, accountLabel: account.label, modelName };

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

// 5. Intelligent AI Weekly Analytics & Productivity Analysis (Gemini)
app.post("/api/gemini/analyze-planner", async (req, res) => {
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

    const { text } = await callGeminiWithFallback({
      prompt,
      preferredModels: GEMINI_FALLBACK_MODELS,
      getConfigForModel: () => plannerConfig,
    });

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

// 5.1. Target-Goal Management & Feasibility Prediction API (Gemini)
app.post("/api/gemini/analyze-goal", async (req, res) => {
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

      const { text } = await callGeminiWithFallback({
        prompt,
        preferredModels: GOAL_ANALYSIS_MODELS,
        getConfigForModel: getConfigForNextWeek,
      });

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

      const { text } = await callGeminiWithFallback({
        prompt,
        preferredModels: GOAL_ANALYSIS_MODELS,
        getConfigForModel: getConfigForGoalAnalysis,
      });

      const textVal = text || "{}";
      const parsed = JSON.parse(textVal.trim());
      return res.json({ success: true, ...parsed });
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
  });
}

startServer();
