import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
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

const GEMINI_MODEL = "gemini-2.5-flash";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "nimadarai05@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email?: string | null) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

app.use(express.json({ limit: "50mb" }));

// --- API ROUTES ---

app.post("/api/auth/firebase-sync", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userToken = req.user!;
    const { username } = req.body;

    if (username && typeof username === 'string' && username.trim()) {
      const existingUserWithUsername = await db
        .select()
        .from(users)
        .where(and(eq(users.username, username.trim()), ne(users.uid, userToken.uid)));

      if (existingUserWithUsername.length > 0) {
        return res.status(400).json({ error: "این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است" });
      }
    }

    const user = await getOrCreateUser(userToken.uid, userToken.email!, username);
    
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

app.get("/api/auth/get-email", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: "نام کاربری مشخص نیست" });
    }
    
    const result = await db.select().from(users).where(eq(users.username, username as string));
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

// 5. Intelligent AI Weekly Analytics & Productivity Analysis (Gemini)
app.post("/api/gemini/analyze-planner", async (req, res) => {
  const { plannerData } = req.body;

  if (!plannerData) {
    return res.status(400).json({ error: "داده‌های برنامه‌ریزی برای تحلیل ارسال نشده است" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "کلید API هوش مصنوعی در سرور یافت نشد. لطفا در تنظیمات آن را وارد کنید." });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

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

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
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
      }
    });

    const text = response.text;
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
    res.status(500).json({ error: error.message || "خطا در برقراری ارتباط با هوش مصنوعی برای تحلیل" });
  }
});

// 5.1. Target-Goal Management & Feasibility Prediction API (Gemini)
app.post("/api/gemini/analyze-goal", async (req, res) => {
  const { action, title, totalWeeks, averageTcr, universityHours, currentWeekIndex, milestones, completedWeeksHistory } = req.body;

  if (!title) {
    return res.status(400).json({ error: "عنوان هدف ارسال نشده است" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "کلید API هوش مصنوعی در سرور یافت نشد. لطفا در تنظیمات آن را وارد کنید." });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

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
    { "title": "Specific Persian task title", "type": "core" | "secondary" | "habit" }
  ]
}
Return EXACTLY 3-6 tasks. Types can be:
- 'core' (the most critical priority for this week)
- 'secondary' (supporting tasks)
- 'habit' (routines that should be repeated)

Return ONLY valid JSON. Do not wrap in markdown code blocks.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
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
                    title: { type: Type.STRING, description: "عنوان تسک به فارسی" },
                    type: { type: Type.STRING, enum: ["core", "secondary", "habit"], description: "نوع تسک" }
                  },
                  required: ["title", "type"]
                }
              }
            },
            required: ["justification", "week_tasks"]
          }
        }
      });

      const textVal = response.text || "{}";
      const parsed = JSON.parse(textVal.trim());
      return res.json({ success: true, ...parsed });

    } else {
      // Action: analyze (initial goal analysis)
      const prompt = `You are an elite academic productivity coach and cognitive psychologist. A user is registering a new long-term goal.
Goal Title: ${title}
Target Duration: ${totalWeeks} weeks
User's Average Task Completion Rate (TCR) in previous weeks: ${averageTcr || 70}%
User's University/Class load hours per week: ${universityHours || 0} hours

Your task is to provide an EXTREMELY DETAILED, HIGHLY ACTIONABLE, COMPREHENSIVE ROADMAP for achieving this goal:
1. Calculate a realistic Feasibility Success Score (0-100) based on their TCR, university hours, and the complexity of the goal.
2. Provide a thorough, rich, multi-paragraph Persian justification explaining the score, psychological/academic strategy, potential bottleneck risks, and concrete actionable guidelines for success.
3. Formulate 4 to 7 precise, key milestones spaced evenly across the ${totalWeeks} weeks to track step-by-step progress. Each milestone must have a clear title in Persian.
4. Provide a rich set of first week's actionable tasks (4 to 7 detailed, specific tasks categorized as 'core', 'secondary', or 'habit') to get them started with immediate momentum.

You must return a JSON object matching this schema:
{
  "feasibility_score": number (0-100),
  "justification": "Detailed, thorough Persian explanation and roadmap guide",
  "milestones": [
    { "week_number": number, "title": "Detailed milestone title in Persian", "completed": false }
  ],
  "week_tasks": [
    { "title": "Specific detailed Persian task title", "type": "core" | "secondary" | "habit" }
  ]
}

Return ONLY valid JSON. Do not wrap in markdown code blocks.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feasibility_score: {
                type: Type.INTEGER,
                description: "نمره احتمال موفقیت واقعی بین 0 تا 100"
              },
              justification: {
                type: Type.STRING,
                description: "توجیه کوتاه نمره و تحلیل اولیه به فارسی روان"
              },
              milestones: {
                type: Type.ARRAY,
                description: "فازهای اصلی یا نقاط عطف مسیر",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    week_number: { type: Type.INTEGER, description: "شماره هفته مربوطه" },
                    title: { type: Type.STRING, description: "عنوان نقطه عطف به فارسی" },
                    completed: { type: Type.BOOLEAN, description: "وضعیت تکمیل (پیش‌فرض false)" }
                  },
                  required: ["week_number", "title", "completed"]
                }
              },
              week_tasks: {
                type: Type.ARRAY,
                description: "لیست تسک‌های پیشنهادی برای شروع در هفته اول",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "عنوان تسک به فارسی" },
                    type: { type: Type.STRING, enum: ["core", "secondary", "habit"], description: "نوع تسک" }
                  },
                  required: ["title", "type"]
                }
              }
            },
            required: ["feasibility_score", "justification", "milestones", "week_tasks"]
          }
        }
      });

      const textVal = response.text || "{}";
      const parsed = JSON.parse(textVal.trim());
      return res.json({ success: true, ...parsed });
    }

  } catch (error: any) {
    console.error("Gemini Goal Analysis Error:", error);
    res.status(500).json({ error: error.message || "خطا در تحلیل هدف" });
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
