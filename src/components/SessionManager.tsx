import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onIdTokenChanged, getIdToken } from 'firebase/auth';
import { auth } from '../lib/firebase.ts';
import { clientLogin, getAuthErrorMessage, clientRegister, safeParseJson } from '../lib/auth.ts';
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
      repaired[key] = [];
      repairedCount++;
    }
  });
  
  if (!repaired.dailyTasks || typeof repaired.dailyTasks !== 'object') {
    repaired.dailyTasks = {};
    repairedCount++;
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
          const res = await fetch('/api/auth/validate', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          const resData = await safeParseJson(res);
          if (res.ok) {
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
        const confirmMsg = isRtl 
          ? 'کدام داده‌ها را ترجیح می‌دهید؟\n\nتایید (OK): آپلود داده‌های فعلی این مرورگر روی ابری\nلغو (Cancel): دانلود داده‌های ذخیره شده قبلی از ابری'
          : 'Which data do you prefer?\n\nOK: Upload current local data to the cloud\nCancel: Download previous data from the cloud';

        if (window.confirm(confirmMsg)) {
          await onSyncData(verifiedUser, data);
          showToast(
            isRtl 
              ? 'اطلاعات محلی شما روی سرور همگام‌سازی شد!' 
              : 'Your local data has been synced to the cloud!', 
            'success'
          );
        } else {
          const cloudData = await onLoadData(verifiedUser);
          if (cloudData) {
            setData(cloudData);
            localStorage.setItem('planner_data', JSON.stringify(cloudData));
            showToast(
              isRtl 
                ? 'اطلاعات ابری شما با موفقیت بارگیری و جایگزین شد!' 
                : 'Cloud data loaded and replaced successfully!', 
              'success'
            );
          } else {
            showToast(
              isRtl 
                ? 'داده‌ای روی سرور یافت نشد. از داده‌های محلی استفاده می‌شود.' 
                : 'No data found on server. Keeping local data.', 
              'success'
            );
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(getAuthErrorMessage(err, isRtl));
    } finally {
      setLoadingAction(false);
    }
  };

  // Switch/Sign out of this account safely (preserves local planner state)
  const handleSignOutSafely = () => {
    const confirmMsg = isRtl 
      ? 'آیا مطمئن هستید؟ اطلاعات شما همچنان به صورت آفلاین در این مرورگر باقی می‌مانند.'
      : 'Are you sure? Your data will remain offline in this browser.';

    if (window.confirm(confirmMsg)) {
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
    }
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
