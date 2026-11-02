import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onIdTokenChanged, getIdToken } from 'firebase/auth';
import { auth } from '../lib/firebase.ts';
import { clientLogin, clientGoogleLogin, getAuthErrorMessage, clientRegister, safeParseJson } from '../lib/auth.ts';
import { 
  ShieldCheck, 
  AlertTriangle, 
  RefreshCw, 
  UserCheck, 
  LogOut, 
  Wifi, 
  WifiOff, 
  Key, 
  Lock, 
  Eye,
  EyeOff,
  Check, 
  Loader2,
  X,
  Database
} from 'lucide-react';
import { User, PlannerData } from '../types';
import { INITIAL_PLANNER_DATA } from '../initialData';
import { isValidDateValue } from '../lib/plannerSyncEngine.ts';
import { updateNetworkTimeFromResponse, timeSyncFetch } from '../utils/networkTime';

interface SessionManagerProps {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  data: PlannerData;
  setData: (data: PlannerData | ((prev: PlannerData) => PlannerData)) => void;
  onSyncData: (user: User, data: PlannerData) => Promise<void>;
  onLoadData: (user: User) => Promise<PlannerData | null>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  authFailureStatus: '401' | '403' | null;
  setAuthFailureStatus: (status: '401' | '403' | null) => void;
  pendingSyncData: PlannerData | null;
  setPendingSyncData: (data: PlannerData | null) => void;
  setIsCriticalAuthFailure: (val: boolean) => void;
  lang: 'fa' | 'en';
}

// 1. Data Integrity Checker & Repairer
export function verifyAndRepairPlannerData(rawData: any): { repairedData: any; repairedCount: number } {
  if (!rawData || typeof rawData !== 'object') {
    return { repairedData: null, repairedCount: 1 };
  }
  
  let repairedCount = 0;
  const repaired = { ...rawData };
  
  const expectedArrays = [
    'coreTasks',
    'secondaryTasks',
    'categories',
    'postponedEvents',
    'detailsColumns',
    'secondaryTaskColumns',
    'classesSchedule',
    'reminders',
    'todoList',
    'weeklyEvents',
    'dailyThoughts',
    'examColumns',
    'goals'
  ];
  
  expectedArrays.forEach(key => {
    if (!repaired[key] || !Array.isArray(repaired[key])) {
      repaired[key] = INITIAL_PLANNER_DATA[key as keyof typeof INITIAL_PLANNER_DATA] ?? [];
      repairedCount++;
    }
  });
  
  if (!repaired.dailyTasks || typeof repaired.dailyTasks !== 'object') {
    repaired.dailyTasks = {};
    repairedCount++;
  }

  // Normalize live tasks undefined fields to null to avoid Firestore setDoc errors
  if (Array.isArray(repaired.coreTasks)) {
    repaired.coreTasks.forEach((ct: any) => {
      if (ct && typeof ct === 'object') {
        if (ct.categoryId === undefined) { ct.categoryId = null; repairedCount++; }
        if (ct.completionDate === undefined) { ct.completionDate = null; repairedCount++; }
      }
    });
  }
  if (Array.isArray(repaired.secondaryTasks)) {
    repaired.secondaryTasks.forEach((st: any) => {
      if (st && typeof st === 'object') {
        if (st.categoryId === undefined) { st.categoryId = null; repairedCount++; }
        if (st.completionDate === undefined) { st.completionDate = null; repairedCount++; }
      }
    });
  }
  if (repaired.dailyTasks && typeof repaired.dailyTasks === 'object') {
    Object.values(repaired.dailyTasks).forEach((dayTasks: any) => {
      if (Array.isArray(dayTasks)) {
        dayTasks.forEach((dt: any) => {
          if (dt && typeof dt === 'object') {
            if (dt.categoryId === undefined) { dt.categoryId = null; repairedCount++; }
            if (dt.completionDate === undefined) { dt.completionDate = null; repairedCount++; }
          }
        });
      }
    });
  }

  // Validate and repair Pomodoro history (filter out dateless entries)
  if (repaired.pomodoro && typeof repaired.pomodoro === 'object' && Array.isArray(repaired.pomodoro.history)) {
    const originalLen = repaired.pomodoro.history.length;
    const validHistory = repaired.pomodoro.history.filter((entry: any) => {
      const rawDate = entry?.date || entry?.timestamp || entry?.dateKey;
      return Boolean(rawDate && isValidDateValue(rawDate));
    });
    if (validHistory.length !== originalLen) {
      repairedCount += (originalLen - validHistory.length);
      repaired.pomodoro = { ...repaired.pomodoro, history: validHistory };
    }
  }

  // Validate and repair WaterTracker history (filter out dateless entries)
  if (repaired.waterTracker && typeof repaired.waterTracker === 'object' && Array.isArray(repaired.waterTracker.history)) {
    const originalLen = repaired.waterTracker.history.length;
    const validHistory = repaired.waterTracker.history.filter((entry: any) => {
      const rawDate = entry?.date || entry?.timestamp || entry?.dateKey;
      return Boolean(rawDate && isValidDateValue(rawDate));
    });
    if (validHistory.length !== originalLen) {
      repairedCount += (originalLen - validHistory.length);
      repaired.waterTracker = { ...repaired.waterTracker, history: validHistory };
    }
  }
  
  return { repairedData: repaired, repairedCount };
}

export const SessionManager: React.FC<SessionManagerProps> = ({
  currentUser,
  setCurrentUser,
  data,
  setData,
  onSyncData,
  onLoadData,
  showToast,
  authFailureStatus,
  setAuthFailureStatus,
  pendingSyncData,
  setPendingSyncData,
  setIsCriticalAuthFailure,
  lang,
}) => {
  const [checking, setChecking] = useState<boolean>(false);
  const [status, setStatus] = useState<'IDLE' | 'VALID' | 'SERVER_RESET' | 'INVALID' | 'SUSPENDED' | 'OFFLINE_MODE'>('IDLE');
  const [showModal, setShowModal] = useState<boolean>(false);
  
  // Form fields for re-auth
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isRtl = lang === 'fa';

  // Run integrity verification and server session validation on mount
  useEffect(() => {
    // A. Verify Local Data Integrity
    const localRaw = localStorage.getItem('planner_data');
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw);
        const { repairedData, repairedCount } = verifyAndRepairPlannerData(parsed);
        if (repairedCount > 0 && repairedData) {
          localStorage.setItem('planner_data', JSON.stringify(repairedData));
          setData(repairedData);
          console.log(`[Integrity Utility] Repaired ${repairedCount} missing or broken structural fields.`);
        }
      } catch (err) {
        console.error('[Integrity Utility] Local data corrupted, resetting to safe defaults', err);
      }
    }

    // B. Setup Firebase IdToken Listener for automatic validation and state recovery
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setChecking(true);
        try {
          const token = await getIdToken(firebaseUser, true);
          const savedUser = localStorage.getItem('planner_user');
          let username = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
          
          if (savedUser) {
            try {
              const parsed = JSON.parse(savedUser);
              if (parsed.username) username = parsed.username;
            } catch (e) {
              console.error(e);
            }
          }

          // Validate with server
          const res = await timeSyncFetch('/api/auth/validate', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          const resData = await safeParseJson(res);
          if (res.ok) {
            updateNetworkTimeFromResponse(res);
            setStatus('VALID');
            setIsCriticalAuthFailure(false);
            const verifiedUser: User = {
              id: firebaseUser.uid,
              email: firebaseUser.email!,
              username,
              token
            };
            setCurrentUser(verifiedUser);
            localStorage.setItem('planner_user', JSON.stringify(verifiedUser));
          } else {
            console.warn('Session verification failed on server:', resData);
            if (res.status === 503) {
              setStatus('OFFLINE_MODE');
              setIsCriticalAuthFailure(false);
            } else {
              setIsCriticalAuthFailure(true);
              if (res.status === 403) {
                setStatus('SUSPENDED');
                setShowModal(true);
                showToast(
                  isRtl 
                    ? 'حساب کاربری شما تعلیق شده است' 
                    : 'Your account has been suspended', 
                  'error'
                );
              } else {
                setStatus('INVALID');
                setShowModal(true);
                showToast(
                  isRtl 
                    ? 'نشست کاربری شما منقضی شده است' 
                    : 'Your session has expired', 
                  'error'
                );
              }
            }
          }
        } catch (err) {
          console.error('Failed to validate session:', err);
          setStatus('OFFLINE_MODE');
        } finally {
          setChecking(false);
        }
      } else {
        // No firebase user, clear state if we had a user
        if (localStorage.getItem('planner_user')) {
          localStorage.removeItem('planner_user');
          setCurrentUser(null);
        }
      }
    });

    return () => unsubscribe();
  }, [isRtl]);

  // Scheduled retry every 60s when in OFFLINE_MODE (e.g. temporary 503 auth infra failure)
  useEffect(() => {
    if (status !== 'OFFLINE_MODE' || !auth.currentUser) return;

    const timer = setInterval(async () => {
      try {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;
        const token = await getIdToken(firebaseUser, true);
        const res = await timeSyncFetch('/api/auth/validate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          updateNetworkTimeFromResponse(res);
          setStatus('VALID');
          setIsCriticalAuthFailure(false);
          const savedUser = localStorage.getItem('planner_user');
          let username = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
          if (savedUser) {
            try {
              const parsed = JSON.parse(savedUser);
              if (parsed.username) username = parsed.username;
            } catch (e) {
              console.error(e);
            }
          }
          const verifiedUser: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email!,
            username,
            token
          };
          setCurrentUser(verifiedUser);
          localStorage.setItem('planner_user', JSON.stringify(verifiedUser));
        }
      } catch (err) {
        // Silent retry without toast spam
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [status, setCurrentUser, setIsCriticalAuthFailure]);

  // Listen to external auth failure triggers (e.g. 401 or 403 from App sync operations)
  useEffect(() => {
    if (authFailureStatus) {
      setIsCriticalAuthFailure(true);
      if (authFailureStatus === '403') {
        setStatus('SUSPENDED');
        setShowModal(true);
        showToast(
          isRtl 
            ? 'حساب کاربری شما تعلیق شده است (۴۰۳)' 
            : 'Your account has been suspended (403)', 
          'error'
        );
      } else {
        setStatus('INVALID');
        setShowModal(true);
        showToast(
          isRtl 
            ? 'نشست کاربری منقضی شده است (۴۰۱). لطفاً مجدداً وارد شوید' 
            : 'Session expired (401). Please re-authenticate', 
          'error'
        );
      }
    }
  }, [authFailureStatus, isRtl]);

  // Action: Re-create account and sync local data (Server reset recovery)
  const handleRecreateAndSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg(isRtl ? 'لطفاً رمز عبور حساب خود را وارد کنید' : 'Please enter your password');
      return;
    }
    if (!currentUser) return;

    setLoadingAction(true);
    setErrorMsg(null);

    try {
      // 1. Re-create or login via Firebase auth client to sync
      let newUser: User;
      try {
        newUser = await clientRegister(currentUser.email, currentUser.username, password);
      } catch (regErr: any) {
        const code = regErr?.code || regErr?.message || '';
        if (code.includes('email-already-in-use')) {
          newUser = await clientLogin(currentUser.email, password);
        } else {
          throw regErr;
        }
      }

      // 2. Register/Login success! Update React state & localStorage
      setCurrentUser(newUser);
      localStorage.setItem('planner_user', JSON.stringify(newUser));

      // 3. Immediately Sync current local data up to the newly created server account
      await onSyncData(newUser, data);

      showToast(
        isRtl 
          ? 'حساب کاربری شما مجدداً ساخته شد و ۱۰۰٪ اطلاعات شما همگام‌سازی شدند!' 
          : 'Your account has been re-created and 100% of your data has been synced!', 
        'success'
      );
      setStatus('VALID');
      setIsCriticalAuthFailure(false);
      setShowModal(false);
      setPassword('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(getAuthErrorMessage(err, isRtl));
    } finally {
      setLoadingAction(false);
    }
  };

  // Action: Normal Re-login (Credentials mismatch/expired/401/403)
  const handleNormalReLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg(isRtl ? 'لطفاً رمز عبور را وارد کنید' : 'Please enter your password');
      return;
    }
    if (!currentUser) return;

    setLoadingAction(true);
    setErrorMsg(null);

    try {
      const verifiedUser = await clientLogin(currentUser.email || currentUser.username, password);
      setCurrentUser(verifiedUser);
      localStorage.setItem('planner_user', JSON.stringify(verifiedUser));
      setStatus('VALID');
      setIsCriticalAuthFailure(false);
      setAuthFailureStatus(null);
      setShowModal(false);
      setPassword('');

      // Check if there was an active pending sync operation when 401/403 occurred. If so, resume!
      if (pendingSyncData) {
        showToast(
          isRtl 
            ? 'احراز هویت موفقیت‌آمیز بود. در حال همگام‌سازی کارهای معلق...' 
            : 'Re-authenticated successfully. Syncing pending changes...', 
          'success'
        );
        await onSyncData(verifiedUser, pendingSyncData);
        setPendingSyncData(null);
        showToast(
          isRtl 
            ? 'همگام‌سازی کارهای معلق با موفقیت به پایان رسید!' 
            : 'Pending changes synced successfully!', 
          'success'
        );
      } else {
        // Offer normal data choice
        const cloudData = await onLoadData(verifiedUser);
        const localTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        const cloudTime = cloudData?.updatedAt ? new Date(cloudData.updatedAt).getTime() : 0;

        if (cloudData && cloudTime > localTime) {
          setData(cloudData);
          localStorage.setItem('planner_data', JSON.stringify(cloudData));
          showToast(
            isRtl 
              ? 'اطلاعات ابری شما با موفقیت بارگیری و جایگزین شد!' 
              : 'Cloud data loaded and replaced successfully!', 
            'success'
          );
        } else {
          await onSyncData(verifiedUser, data);
          showToast(
            isRtl 
              ? 'اطلاعات محلی شما روی سرور همگام‌سازی شد!' 
              : 'Your local data has been synced to the cloud!', 
            'success'
          );
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(getAuthErrorMessage(err, isRtl));
    } finally {
      setLoadingAction(false);
    }
  };

  // Action: Google Re-login (INVALID / SERVER_RESET modal)
  const handleGoogleReLogin = async () => {
    setLoadingAction(true);
    setErrorMsg(null);

    try {
      const loggedInUser = await clientGoogleLogin();
      setCurrentUser(loggedInUser);
      localStorage.setItem('planner_user', JSON.stringify(loggedInUser));
      setStatus('VALID');
      setIsCriticalAuthFailure(false);
      setAuthFailureStatus(null);
      setShowModal(false);
      setPassword('');

      if (pendingSyncData) {
        showToast(
          isRtl 
            ? 'احراز هویت با موفقیت انجام شد. در حال همگام‌سازی کارهای معلق...' 
            : 'Re-authenticated successfully. Syncing pending changes...', 
          'success'
        );
        await onSyncData(loggedInUser, pendingSyncData);
        setPendingSyncData(null);
        showToast(
          isRtl 
            ? 'همگام‌سازی کارهای معلق با موفقیت به پایان رسید!' 
            : 'Pending changes synced successfully!', 
          'success'
        );
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(getAuthErrorMessage(err, isRtl));
    } finally {
      setLoadingAction(false);
    }
  };

  const isGoogleUser = Boolean(
    auth.currentUser?.providerData?.some((p) => p.providerId === 'google.com')
  );

  // Switch/Sign out of this account safely (preserves local planner state)
  const handleSignOutSafely = () => {
    localStorage.removeItem('planner_user');
      setCurrentUser(null);
      setStatus('IDLE');
      setIsCriticalAuthFailure(false);
      setAuthFailureStatus(null);
      setPendingSyncData(null);
      setShowModal(false);
      showToast(
        isRtl 
          ? 'با موفقیت از حساب خارج شدید. کار آفلاین ادامه دارد.' 
          : 'Signed out successfully. Offline usage continued.', 
        'success'
      );
  };

  const handleContinueOffline = () => {
    setStatus('OFFLINE_MODE');
    setAuthFailureStatus(null);
    setShowModal(false);
    showToast(
      isRtl 
        ? 'شما در حال استفاده از حالت آفلاین (بدون همگام‌سازی) هستید.' 
        : 'You are now using secure offline mode (no sync).', 
      'success'
    );
  };

  // Render Status Badge
  const renderStatusBadge = () => {
    return null;
  };

  return (
    <>
      {/* 1. Status indicator rendered in the corner */}
      <div className={`fixed bottom-4 z-40 flex flex-col gap-2 ${isRtl ? 'left-4' : 'right-4'}`}>
        {renderStatusBadge()}
      </div>

      {/* 2. Modal Overlay for Re-auth and session recovery */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={status === 'SUSPENDED' ? undefined : handleContinueOffline}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className={`relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col gap-5 overflow-hidden z-10 ${isRtl ? 'rtl text-right' : 'ltr text-left'}`}
              style={{ direction: isRtl ? 'rtl' : 'ltr' }}
            >
              {/* Decorative top pattern */}
              <div className="absolute top-0 inset-x-0 h-2.5 bg-amber-500" />

              {/* Close Button */}
              {status !== 'SUSPENDED' && (
                <button 
                  onClick={handleContinueOffline}
                  className={`absolute top-4 text-slate-400 hover:text-slate-600 transition-colors ${isRtl ? 'left-4' : 'right-4'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              {/* Header Icon */}
              <div className="flex items-center gap-3.5 mt-2">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-2xl text-amber-600 dark:text-amber-400">
                  {status === 'SERVER_RESET' ? (
                    <Database className="w-7 h-7 animate-pulse" />
                  ) : (
                    <Lock className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {status === 'SERVER_RESET' 
                      ? (isRtl ? 'بازیابی حساب کاربری ابری' : 'Restore Cloud Account') 
                      : (isRtl ? 'بررسی مجدد هویت کاربر' : 'User Re-authentication')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isRtl ? 'مدیریت امنیت نشست و همگام‌سازی ابری' : 'Session Security & Cloud Sync Manager'}
                  </p>
                </div>
              </div>

              {/* Warnings and Info Details */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-2.5 text-sm">
                {status === 'SERVER_RESET' ? (
                  <>
                    <p className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {isRtl ? 'سرور دمو مجدداً راه‌اندازی شده است!' : 'Demo Server has been Reset!'}
                    </p>
                    <p className="text-slate-600 leading-relaxed text-xs">
                      {isRtl 
                        ? 'به علت ریست دوره‌ای دیتابیس دمو، حساب کاربری ابری شما روی سرور یافت نشد.' 
                        : 'Due to periodic reset of our demo database, your user account was not found on the server.'}
                      <strong className="text-slate-900 font-black block mt-1.5">
                        {isRtl 
                          ? '💡 نگران نباشید! اطلاعات شما به صورت کاملاً امن و بدون تغییر در همین مرورگر محفوظ است.' 
                          : '💡 Do not worry! Your weekly planner data is safely kept unchanged locally in this browser.'}
                      </strong>
                    </p>
                  </>
                ) : status === 'SUSPENDED' ? (
                  <>
                    <p className="font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {isRtl ? 'حساب کاربری تعلیق شده است!' : 'User account is suspended!'}
                    </p>
                    <p className="text-slate-600 leading-relaxed text-xs">
                      {isRtl 
                        ? 'متاسفانه دسترسی حساب کاربری شما توسط ادمین تعلیق گردیده است. شما تا بررسی مجدد می‌توانید فقط به صورت آفلاین از برنامه استفاده کنید.' 
                        : 'Unfortunately, your account has been suspended by the administrator. You can only use the planner offline.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 shrink-0" />
                      {isRtl ? 'نشست کاربری شما منقضی شده است' : 'Your session has expired'}
                    </p>
                    <p className="text-slate-600 leading-relaxed text-xs">
                      {isRtl 
                        ? 'جهت امنیت بیشتر و به منظور ادامه‌ همگام‌سازی خودکار و زنده کارهای خود با فضای ابری، لطفاً رمز عبور خود را مجدداً وارد نمایید.' 
                        : 'For enhanced security and to resume automatic cloud syncing, please re-enter your password.'}
                    </p>
                  </>
                )}
              </div>

              {/* User Identity Preview */}
              {currentUser && (
                <div className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/40 dark:border-indigo-950/50 rounded-2xl text-xs">
                  <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-bold">
                    <UserCheck className="w-4 h-4 text-indigo-500" />
                    <span>{isRtl ? 'حساب کاربری:' : 'Account:'} {currentUser.username}</span>
                  </div>
                  <span className="text-slate-400">{currentUser.email}</span>
                </div>
              )}

              {/* Google Re-login Button & Note (Always visible if not suspended) */}
              {status !== 'SUSPENDED' && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleGoogleReLogin}
                    disabled={loadingAction}
                    className="w-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 py-2.5 rounded-2xl text-sm font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>{isRtl ? 'ورود مجدد با حساب گوگل' : 'Re-authenticate with Google'}</span>
                  </button>

                  <div className="relative flex items-center justify-center my-0.5">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                    <span className="relative px-2 bg-white text-[11px] text-slate-400 font-bold">{isRtl ? 'یا ورود با رمز عبور' : 'Or with password'}</span>
                  </div>

                  {isGoogleUser && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 font-medium leading-relaxed">
                      {isRtl 
                        ? 'حساب شما با گوگل ساخته شده و رمز عبور برنامه ندارد؛ از دکمه ورود با گوگل استفاده کنید' 
                        : 'Your account was created with Google and does not have a password; please use the Google sign-in button.'}
                    </div>
                  )}
                </div>
              )}

              {/* Form Input for Password (Only if not suspended) */}
              {status !== 'SUSPENDED' && (
                <form 
                  onSubmit={status === 'SERVER_RESET' ? handleRecreateAndSync : handleNormalReLogin}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      {status === 'SERVER_RESET' 
                        ? (isRtl ? 'تعیین کلمه عبور جدید برای ثبت نام مجدد حساب:' : 'Choose new password for account re-creation:') 
                        : (isRtl ? 'کلمه عبور حساب کاربری:' : 'Account password:')}
                    </label>
                    <div className="relative">
                      <Key className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRtl ? 'right-3' : 'left-3'}`} />
                      <input 
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono ${ isRtl ? 'pr-10 pl-10 text-right' : 'pl-10 pr-10 text-left'}`}
                        disabled={loadingAction}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} text-slate-400 hover:text-slate-600 focus:outline-none`}
                        title={showPassword ? (isRtl ? "مخفی کردن رمز" : "Hide password") : (isRtl ? "نمایش رمز" : "Show password")}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {errorMsg && (
                    <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                      ⚠️ {errorMsg}
                    </p>
                  )}

                  {/* Actions buttons */}
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={loadingAction}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-2xl text-sm font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {loadingAction ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{isRtl ? 'درحال ثبت و همگام‌سازی...' : 'Saving & Syncing...'}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>
                            {status === 'SERVER_RESET' 
                              ? (isRtl ? 'ثبت حساب و همگام‌سازی کامل داده‌ها' : 'Re-register & Sync Data') 
                              : (isRtl ? 'ورود و فعال‌سازی همگام‌سازی' : 'Login & Resume Sync')}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Bottom secondary utilities */}
              <div className="flex items-center gap-2 justify-between mt-1 text-xs border-t border-slate-100 pt-4">
                {status !== 'SUSPENDED' ? (
                  <button 
                    onClick={handleContinueOffline}
                    className="text-slate-500 hover:text-indigo-600 transition-colors font-medium cursor-pointer"
                  >
                    {isRtl ? 'ادامه به صورت آفلاین' : 'Continue Offline'}
                  </button>
                ) : (
                  <span className="text-slate-400 font-medium">{isRtl ? 'فقط حالت آفلاین در دسترس است' : 'Only offline mode available'}</span>
                )}

                <button 
                  onClick={handleSignOutSafely}
                  className="flex items-center gap-1 text-red-500 hover:text-red-600 transition-colors font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'خروج از این حساب' : 'Sign Out'}</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
