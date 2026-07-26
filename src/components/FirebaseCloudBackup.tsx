import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cloud, 
  CloudUpload, 
  CloudDownload, 
  Trash2, 
  RefreshCw, 
  Clock, 
  FileCheck, 
  AlertCircle, 
  CheckCircle2,
  Sparkles,
  Database
} from 'lucide-react';
import { PlannerData, User } from '../types';
import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';

interface CloudBackupItem {
  id: string;
  note: string;
  createdAt: string;
  data: PlannerData;
}

interface FirebaseCloudBackupProps {
  data: PlannerData;
  setData: React.Dispatch<React.SetStateAction<PlannerData>>;
  currentUser: User | null;
  lang: 'fa' | 'en';
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function FirebaseCloudBackup({
  data,
  setData,
  currentUser,
  lang,
  showToast
}: FirebaseCloudBackupProps) {
  const isRtl = lang === 'fa';
  const [backups, setBackups] = useState<CloudBackupItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [backupNote, setBackupNote] = useState<string>('');
  const [showNoteInput, setShowNoteInput] = useState<boolean>(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const userId = currentUser?.id;

  const fetchBackups = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const backupsRef = collection(db, 'planners', userId, 'backups');
      const q = query(backupsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const loaded: CloudBackupItem[] = [];
      snapshot.forEach(docSnap => {
        const item = docSnap.data();
        loaded.push({
          id: docSnap.id,
          note: item.note || (isRtl ? 'نسخه پشتیبان ابری' : 'Cloud Backup'),
          createdAt: item.createdAt || new Date().toISOString(),
          data: item.data
        });
      });
      setBackups(loaded);
    } catch (err: any) {
      console.warn('Error fetching cloud backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchBackups();
    }
  }, [userId]);

  const handleCreateBackup = async () => {
    if (!userId) {
      showToast(isRtl ? 'جهت ایجاد بکاپ ابری باید وارد حساب کاربری شوید.' : 'Please sign in to create a cloud backup.', 'error');
      return;
    }

    setCreating(true);
    try {
      const backupId = `backup_${Date.now()}`;
      const backupRef = doc(db, 'planners', userId, 'backups', backupId);
      const noteToSave = backupNote.trim() || (isRtl ? `بکاپ دستی - ${new Date().toLocaleDateString('fa-IR')}` : `Manual Backup - ${new Date().toLocaleDateString()}`);

      await setDoc(backupRef, {
        id: backupId,
        userId: userId,
        note: noteToSave,
        createdAt: new Date().toISOString(),
        data: data
      });

      showToast(isRtl ? 'نسخه پشتیبان جدید با موفقیت در فایربیس ذخیره شد.' : 'New cloud backup created successfully in Firebase.', 'success');
      setBackupNote('');
      setShowNoteInput(false);
      await fetchBackups();
    } catch (err: any) {
      console.error('Error creating cloud backup:', err);
      showToast(isRtl ? 'خطا در ایجاد نسخه پشتیبان ابری: ' + err.message : 'Failed to create cloud backup: ' + err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async (backup: CloudBackupItem) => {
    if (!backup.data) {
      showToast(isRtl ? 'اطلاعات این نسخه پشتیبان ناقص است.' : 'Backup data is invalid.', 'error');
      return;
    }

    if (!window.confirm(isRtl ? 'آیا از بازیابی این نسخه پشتیبان اطمینان دارید؟ داده‌های فعلی شما جایگزین خواهند شد.' : 'Are you sure you want to restore this backup? Current data will be replaced.')) {
      return;
    }

    setRestoringId(backup.id);
    try {
      setData(backup.data);
      showToast(isRtl ? 'اطلاعات با موفقیت از فایربیس بازیابی شد.' : 'Data successfully restored from Firebase.', 'success');
    } catch (err: any) {
      showToast(isRtl ? 'خطا در بازیابی بکاپ' : 'Error restoring backup', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!userId) return;
    if (!window.confirm(isRtl ? 'آیا از حذف این نسخه پشتیبان ابری اطمینان دارید؟' : 'Are you sure you want to delete this cloud backup?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'planners', userId, 'backups', backupId));
      showToast(isRtl ? 'نسخه پشتیبان ابری حذف شد.' : 'Cloud backup deleted.', 'success');
      setBackups(prev => prev.filter(b => b.id !== backupId));
    } catch (err: any) {
      showToast(isRtl ? 'خطا در حذف نسخه پشتیبان' : 'Failed to delete backup', 'error');
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isRtl) {
        return new Intl.DateTimeFormat('fa-IR', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(d);
      }
      return d.toLocaleString();
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-900/5 via-blue-900/5 to-slate-900/5 dark:from-indigo-950/30 dark:to-slate-900/40 rounded-3xl border border-indigo-200/60 dark:border-indigo-800/40 p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900/50 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>{isRtl ? 'پشتیبان‌گیری ابری در فایربیس' : 'Firebase Online Cloud Backup'}</span>
              <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-black rounded-full">
                {isRtl ? 'زنده' : 'Live'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              {isRtl ? 'ذخیره ایمن و بازیابی فوری نسخه‌های پشتیبان در ابر' : 'Securely save and instantly restore backups from cloud'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchBackups}
          disabled={loading}
          className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          title={isRtl ? 'بروزرسانی لیست' : 'Refresh list'}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>
      </div>

      {/* Action Buttons */}
      {!showNoteInput ? (
        <button
          type="button"
          onClick={() => setShowNoteInput(true)}
          disabled={!userId}
          className="w-full flex items-center justify-center gap-2 p-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl font-black text-xs transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CloudUpload className="w-4.5 h-4.5" />
          <span>{isRtl ? 'ایجاد نسخه پشتیبان ابری جدید' : 'Create New Cloud Backup'}</span>
        </button>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 p-4 rounded-2xl space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {isRtl ? 'عنوان یا توضیحات بکاپ (اختیاری):' : 'Backup note (optional):'}
          </label>
          <input
            type="text"
            value={backupNote}
            onChange={(e) => setBackupNote(e.target.value)}
            placeholder={isRtl ? 'مثال: بکاپ قبل از امتحانات...' : 'e.g., Backup before exams...'}
            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowNoteInput(false)}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            >
              {isRtl ? 'انصراف' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={creating}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {creating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isRtl ? 'در حال ذخیره...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'ذخیره در فایربیس' : 'Save to Firebase'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {!userId && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-2xl flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{isRtl ? 'برای استفاده از بکاپ ابری فایربیس، ابتدا وارد حساب کاربری خود شوید.' : 'Please sign in to use Firebase cloud backups.'}</span>
        </div>
      )}

      {/* Backups List */}
      <div className="space-y-2.5 pt-1">
        <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-indigo-600" />
          <span>{isRtl ? 'نسخه‌های پشتیبان ذخیره‌شده:' : 'Saved Cloud Backups:'}</span>
          <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-bold">
            {backups.length}
          </span>
        </h4>

        {loading && backups.length === 0 ? (
          <div className="p-6 text-center text-xs font-bold text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
            <span>{isRtl ? 'در حال دریافت اطلاعات از فایربیس...' : 'Loading backups from Firebase...'}</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-5 text-center bg-white/50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold text-slate-400">
            {isRtl ? 'هنوز هیچ نسخه پشتیبان ابری ایجاد نشده است.' : 'No cloud backups created yet.'}
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {backups.map((b) => (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all shadow-2xs"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                      {b.note}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(b.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(b)}
                    disabled={restoringId === b.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CloudDownload className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'بازیابی' : 'Restore'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteBackup(b.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all cursor-pointer"
                    title={isRtl ? 'حذف بکاپ' : 'Delete backup'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
