import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  getIdToken,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, googleAuthProvider } from './firebase.ts';

export function getAuthErrorMessage(error: any, isRtl: boolean = true): string {
  const code = error?.code || error?.message || '';
  
  if (isRtl) {
    if (code.includes('auth/operation-not-allowed')) {
      return 'روش ورود با ایمیل و رمز عبور در پنل فایربیس این پروژه فعال نشده است. لطفاً در کنسول فایربیس پروژه خود به بخش Authentication > Sign-in method رفته و گزینه Email/Password را فعال کنید. همچنین می‌توانید در حال حاضر دکمه «ادامه به صورت آفلاین» را بزنید تا کارهای خود را بدون مشکل مدیریت کنید.';
    }
    if (code.includes('auth/user-not-found')) {
      return 'کاربر با این مشخصات یافت نشد.';
    }
    if (code.includes('auth/wrong-password')) {
      return 'کلمه عبور وارد شده نادرست است.';
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
    return error?.message || 'خطای غیرمنتظره در احراز هویت رخ داد';
  } else {
    if (code.includes('auth/operation-not-allowed')) {
      return 'Email/Password sign-in provider is not enabled in Firebase. Please go to Firebase Console > Authentication > Sign-in method and enable Email/Password provider. In the meantime, you can click "Continue Offline" to save your data locally.';
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
}

export async function clientSignOut() {
  await signOut(auth);
  setCachedGoogleCalendarToken(null);
  setCachedGmailToken(null);
}

// In-memory cache for Google OAuth access tokens
let googleCalendarToken: string | null = null;
let googleGmailToken: string | null = null;

export function getCachedGoogleCalendarToken(): string | null {
  return googleCalendarToken;
}

export function setCachedGoogleCalendarToken(token: string | null): void {
  googleCalendarToken = token;
}

export function getCachedGmailToken(): string | null {
  return googleGmailToken;
}

export function setCachedGmailToken(token: string | null): void {
  googleGmailToken = token;
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
  
  googleCalendarToken = credential.accessToken;
  return googleCalendarToken;
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
  
  googleGmailToken = credential.accessToken;
  return googleGmailToken;
}

