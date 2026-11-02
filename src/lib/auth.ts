import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  getIdToken,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleAuthProvider } from './firebase.ts';

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCustomToken, signOut, onAuthStateChanged };

export function getAuthErrorMessage(error: any, isRtl: boolean = true): string {
  const code = error?.code || error?.message || '';
  
  if (isRtl) {
    if (code.includes('auth/operation-not-allowed')) {
      return 'روش ورود با ایمیل و رمز عبور در پنل فایربیس این پروژه فعال نشده است. لطفاً در کنسول فایربیس پروژه خود به بخش Authentication > Sign-in method رفته و گزینه Email/Password را فعال کنید. همچنین می‌توانید در حال حاضر دکمه «ادامه به صورت آفلاین» را بزنید تا کارهای خود را بدون مشکل مدیریت کنید.';
    }
    if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) {
      return 'ایمیل یا رمز عبور اشتباه است. اگر حساب خود را با گوگل ساخته‌اید، رمز عبور برنامه ندارید — از دکمه ورود با گوگل استفاده کنید.';
    }
    if (code.includes('auth/invalid-email')) {
      return 'فرمت ایمیل وارد شده معتبر نیست.';
    }
    if (code.includes('auth/email-already-in-use')) {
      return 'این ایمیل قبلاً توسط کاربر دیگری ثبت شده است.';
    }
    if (code.includes('auth/weak-password')) {
      return 'کلمه عبور باید حداقل ۶ کاراکتر باشد.';
    }
    if (code.includes('auth/too-many-requests')) {
      return 'به دلیل تلاش‌های ناموفق مکرر، این حساب موقتاً مسدود شده است. لطفاً بعداً دوباره تلاش کنید.';
    }
    if (code.includes('auth/popup-closed-by-user')) {
      return 'پنجره ورود توسط کاربر بسته شد.';
    }
    if (code.includes('auth/popup-blocked')) {
      return 'پنجره ورود توسط مرورگر مسدود شد. لطفاً پاپ‌آپ را در مرورگر مجاز کنید.';
    }
    if (code.includes('network') || code.includes('request-timeout') || code.includes('timeout') || code.includes('auth/network-request-failed')) {
      return 'خطای شبکه؛ اتصال اینترنت/فیلترشکن را بررسی کنید.';
    }
    if (code.includes('auth/unauthorized-domain')) {
      return 'دامنه برنامه در لیست دامنه‌های مجاز کنسول فایربیس ثبت نشده است.';
    }
    return error?.message || 'خطای غیرمنتظره در احراز هویت رخ داد';
  } else {
    if (code.includes('auth/operation-not-allowed')) {
      return 'Email/Password sign-in provider is not enabled in Firebase. Please go to Firebase Console > Authentication > Sign-in method and enable Email/Password provider. In the meantime, you can click "Continue Offline" to save your data locally.';
    }
    if (code.includes('auth/popup-closed-by-user')) {
      return 'The sign-in popup was closed before completion.';
    }
    if (code.includes('auth/popup-blocked')) {
      return 'The sign-in popup was blocked by browser. Please allow popups.';
    }
    if (code.includes('auth/network-request-failed')) {
      return 'Network request failed. Please check your VPN or internet connection.';
    }
    if (code.includes('auth/unauthorized-domain')) {
      return 'This domain is not authorized in Firebase Console.';
    }
    return error?.message || 'An unexpected authentication error occurred';
  }
}

export async function safeParseJson(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  }
  try {
    const text = await res.text();
    return { error: text || `HTTP ${res.status}: ${res.statusText}` };
  } catch (e) {
    return { error: `HTTP ${res.status}: ${res.statusText}` };
  }
}

export async function clientRegister(email: string, username: string, password: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    const token = await getIdToken(user);
    
    const res = await fetch('/api/auth/firebase-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username })
    });
    
    if (!res.ok) {
      const errorData = await safeParseJson(res);
      throw new Error(errorData.error || 'Backend sync failed');
    }
    
    const data = await safeParseJson(res);
    return {
      id: user.uid,
      email: user.email!,
      username: data.user.username || username,
      token,
    };
  } catch (err: any) {
    // If Email/Password provider is disabled in Firebase Console or returns operation-not-allowed, fallback to server registration
    if (err?.code?.includes('operation-not-allowed') || err?.message?.includes('operation-not-allowed') || err?.code === 'auth/operation-not-allowed') {
      const res = await fetch('/api/auth/server-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password })
      });

      if (!res.ok) {
        const errorData = await safeParseJson(res);
        throw new Error(errorData.error || 'خطا در ثبت‌نام کاربری');
      }

      const data = await safeParseJson(res);
      const userCredential = await signInWithCustomToken(auth, data.customToken);
      const user = userCredential.user;
      const token = await getIdToken(user);

      return {
        id: user.uid,
        email: user.email!,
        username: data.user.username || username,
        token
      };
    }
    throw err;
  }
}

export async function clientLogin(emailOrUsername: string, password: string) {
  let email = emailOrUsername;
  if (!emailOrUsername.includes('@')) {
    const res = await fetch(`/api/auth/get-email?username=${encodeURIComponent(emailOrUsername)}`);
    if (res.ok) {
      const data = await safeParseJson(res);
      email = data.email;
    } else {
      throw new Error('نام کاربری معتبر نیست یا یافت نشد');
    }
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const token = await getIdToken(user);
    
    const res = await fetch('/api/auth/firebase-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      const errorData = await safeParseJson(res);
      throw new Error(errorData.error || 'Backend verification failed');
    }
    
    const data = await safeParseJson(res);
    return {
      id: user.uid,
      email: user.email!,
      username: data.user.username,
      token,
    };
  } catch (err: any) {
    if (err?.code?.includes('operation-not-allowed') || err?.message?.includes('operation-not-allowed') || err?.code === 'auth/operation-not-allowed') {
      const res = await fetch('/api/auth/server-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername, password })
      });

      if (!res.ok) {
        const errorData = await safeParseJson(res);
        throw new Error(errorData.error || 'خطا در ورود به حساب کاربری');
      }

      const data = await safeParseJson(res);
      const userCredential = await signInWithCustomToken(auth, data.customToken);
      const user = userCredential.user;
      const token = await getIdToken(user);

      return {
        id: user.uid,
        email: user.email!,
        username: data.user.username,
        token
      };
    }
    throw err;
  }
}

export async function clientGoogleLogin() {
  const userCredential = await signInWithPopup(auth, googleAuthProvider);
  const user = userCredential.user;
  const token = await getIdToken(user);
  
  const credential = GoogleAuthProvider.credentialFromResult(userCredential);
  if (credential?.accessToken) {
    googleGmailToken = credential.accessToken;
    googleCalendarToken = credential.accessToken;
  }
  
  try {
    const res = await fetch('/api/auth/firebase-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      const errorData = await safeParseJson(res);
      throw new Error(errorData.error || 'Backend verification failed');
    }
    
    const data = await safeParseJson(res);
    return {
      id: user.uid,
      email: user.email || '',
      username: data.user?.username || user.displayName || user.email?.split('@')[0] || 'کاربر',
      avatar: user.photoURL || undefined,
      token,
    };
  } catch (backendErr: any) {
    console.warn('[clientGoogleLogin] Backend sync failed, continuing in direct Firestore mode:', backendErr);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-toast', {
        detail: {
          message: 'اتصال به سرور برقرار نشد؛ برنامه در حالت مستقیم ادامه می‌دهد',
          type: 'error'
        }
      }));
    }
    return {
      id: user.uid,
      email: user.email || '',
      username: user.displayName || user.email?.split('@')[0] || 'کاربر',
      avatar: user.photoURL || undefined,
      token,
      isDirectMode: true,
    };
  }
}

export async function clientSignOut() {
  await signOut(auth);
  setCachedGoogleCalendarToken(null);
  setCachedGmailToken(null);
}

export async function clientDeleteAccount() {
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    try {
      const token = await getIdToken(firebaseUser);
      await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (e) {
      console.warn('Backend delete error:', e);
    }

    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('./firebase.ts');
      await deleteDoc(doc(db, 'users', firebaseUser.uid)).catch(() => {});
      await deleteDoc(doc(db, 'planners', firebaseUser.uid)).catch(() => {});
    } catch (e) {
      console.warn('Firestore delete error:', e);
    }

    try {
      const { deleteUser } = await import('firebase/auth');
      await deleteUser(firebaseUser);
    } catch (e) {
      console.warn('Firebase Auth user delete error:', e);
    }
  }

  await clientSignOut();
}

// Persistent & in-memory cache for Google OAuth access tokens
let googleCalendarToken: string | null = null;
let googleGmailToken: string | null = null;

const GCAL_TOKEN_KEY = 'planner_gcal_token';
const GCAL_TS_KEY = 'planner_gcal_token_ts';
const GMAIL_TOKEN_KEY = 'planner_gmail_token';
const GMAIL_TS_KEY = 'planner_gmail_token_ts';
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes max validity

export function getCachedGoogleCalendarToken(): string | null {
  if (googleCalendarToken) {
    try {
      const ts = Number(localStorage.getItem(GCAL_TS_KEY) || '0');
      if (ts && Date.now() - ts < TOKEN_TTL_MS) return googleCalendarToken;
    } catch (_) {}
  }
  try {
    const stored = localStorage.getItem(GCAL_TOKEN_KEY);
    const ts = Number(localStorage.getItem(GCAL_TS_KEY) || '0');
    if (stored && ts && Date.now() - ts < TOKEN_TTL_MS) {
      googleCalendarToken = stored;
      return stored;
    }
  } catch (_) {}
  return null;
}

export function setCachedGoogleCalendarToken(token: string | null): void {
  googleCalendarToken = token;
  try {
    if (token) {
      localStorage.setItem(GCAL_TOKEN_KEY, token);
      localStorage.setItem(GCAL_TS_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(GCAL_TOKEN_KEY);
      localStorage.removeItem(GCAL_TS_KEY);
    }
  } catch (_) {}
}

export function isCalendarTokenExpired(): boolean {
  try {
    const stored = localStorage.getItem(GCAL_TOKEN_KEY);
    const ts = Number(localStorage.getItem(GCAL_TS_KEY) || '0');
    if (!stored || !ts) return true;
    return (Date.now() - ts) >= TOKEN_TTL_MS;
  } catch (_) {
    return true;
  }
}

export function getCachedGmailToken(): string | null {
  if (googleGmailToken) {
    try {
      const ts = Number(localStorage.getItem(GMAIL_TS_KEY) || '0');
      if (ts && Date.now() - ts < TOKEN_TTL_MS) return googleGmailToken;
    } catch (_) {}
  }
  try {
    const stored = localStorage.getItem(GMAIL_TOKEN_KEY);
    const ts = Number(localStorage.getItem(GMAIL_TS_KEY) || '0');
    if (stored && ts && Date.now() - ts < TOKEN_TTL_MS) {
      googleGmailToken = stored;
      return stored;
    }
  } catch (_) {}
  return null;
}

export function setCachedGmailToken(token: string | null): void {
  googleGmailToken = token;
  try {
    if (token) {
      localStorage.setItem(GMAIL_TOKEN_KEY, token);
      localStorage.setItem(GMAIL_TS_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(GMAIL_TOKEN_KEY);
      localStorage.removeItem(GMAIL_TS_KEY);
    }
  } catch (_) {}
}

export function isGmailTokenExpired(): boolean {
  try {
    const stored = localStorage.getItem(GMAIL_TOKEN_KEY);
    const ts = Number(localStorage.getItem(GMAIL_TS_KEY) || '0');
    if (!stored || !ts) return true;
    return (Date.now() - ts) >= TOKEN_TTL_MS;
  } catch (_) {
    return true;
  }
}

export async function connectGoogleCalendar(): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar');
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to get Google Calendar access token');
  }
  
  setCachedGoogleCalendarToken(credential.accessToken);
  return credential.accessToken;
}

export async function connectGmail(): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/gmail.send');
  provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  provider.addScope('https://mail.google.com/');
  
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('دریافت توکن دسترسی جیمیل ناموفق بود');
  }
  
  setCachedGmailToken(credential.accessToken);
  return credential.accessToken;
}

