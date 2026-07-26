import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, Camera, Check, X, Sparkles, Upload, Trash2, Mail, Lock } from 'lucide-react';
import { User } from '../types';
import { safeParseJson } from '../lib/auth';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUpdateProfile: (updatedUser: User) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  showToast: (msg: string) => void;
  lang: 'fa' | 'en';
}

const DEFAULT_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
];

export default function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile,
  onLogout,
  onDeleteAccount,
  showToast,
  lang,
}: UserProfileModalProps) {
  const isRtl = lang === 'fa';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(currentUser?.username || (isRtl ? 'کاربر برنامه‌ریز' : 'Planner User'));
  const [avatar, setAvatar] = useState<string | undefined>(currentUser?.avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showToast(isRtl ? 'حجم تصویر نباید بیشتر از ۳ مگابایت باشد.' : 'Image size must be less than 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatar(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      showToast(isRtl ? 'لطفاً نام کاربری را وارد کنید.' : 'Please enter a username.');
      return;
    }

    const trimmed = username.trim();
    setIsSaving(true);

    try {
      // Validate and update username on backend if token exists
      if (currentUser?.token) {
        const response = await fetch('/api/auth/update-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentUser.token}`
          },
          body: JSON.stringify({ username: trimmed })
        });

        if (!response.ok) {
          const errData = await safeParseJson(response);
          throw new Error(errData.error || (isRtl ? 'خطا در ثبت نام کاربری' : 'Failed to update username'));
        }
      }

      // Update in Firestore users collection & usernames collection
      if (currentUser?.id) {
        try {
          const { doc, setDoc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase.ts');
          
          await setDoc(doc(db, 'users', currentUser.id), {
            username: trimmed,
            email: currentUser.email,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          await setDoc(doc(db, 'usernames', trimmed.toLowerCase()), {
            username: trimmed,
            uid: currentUser.id,
            email: currentUser.email,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore profile save warning:", fsErr);
        }
      }

      const baseUser: User = currentUser || {
        id: `user_${Date.now()}`,
        email: 'user@local.app',
        username: trimmed,
      };

      const updatedUser: User = {
        ...baseUser,
        username: trimmed,
        avatar: avatar,
      };

      onUpdateProfile(updatedUser);
      showToast(isRtl ? 'اطلاعات حساب کاربری و نام کاربری با موفقیت بروزرسانی شد.' : 'Profile and username updated successfully.');
      onClose();
    } catch (err: any) {
      showToast(err.message || (isRtl ? 'خطا در بروزرسانی پروفایل' : 'Failed to update profile'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                <UserIcon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-black text-base">
                {isRtl ? 'ویرایش پروفایل کاربری' : 'Edit User Profile'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full border-4 border-indigo-100 shadow-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                  {avatar ? (
                    <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-12 h-12 text-slate-400" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md transition-transform transform hover:scale-105 cursor-pointer"
                  title={isRtl ? 'تغییر تصویر پروفایل' : 'Change profile picture'}
                >
                  <Camera className="w-4 h-4" />
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-indigo-600 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'آپلود تصویر جدید' : 'Upload photo'}</span>
                </button>
                {avatar && (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setAvatar(undefined)}
                      className="text-red-500 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'حذف تصویر' : 'Remove photo'}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Avatar Presets */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] font-bold text-slate-400">{isRtl ? 'پیش‌فرض‌ها:' : 'Presets:'}</span>
                {DEFAULT_AVATAR_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatar(preset)}
                    className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer"
                  >
                    <img src={preset} alt="preset" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isRtl ? 'نام کاربری (نام نمایش داده شده)' : 'Username (Display Name)'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={isRtl ? 'نام کاربری شما...' : 'Your username...'}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isRtl ? 'ایمیل حساب کاربری' : 'Account Email'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    disabled
                    value={currentUser?.email || 'guest@local.app'}
                    className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 cursor-not-allowed dir-ltr"
                  />
                  <Mail className={`w-4 h-4 text-slate-400 absolute ${isRtl ? 'left-3' : 'right-3'}`} />
                </div>
              </div>
            </div>

            {/* Danger Zone & Account Management */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <label className="block text-xs font-bold text-slate-700">
                {isRtl ? 'مدیریت حساب کاربری' : 'Account Management'}
              </label>
              
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'خروج از حساب' : 'Log Out'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>{isRtl ? 'حذف کامل حساب' : 'Delete Account'}</span>
                </button>
              </div>

              {/* Account deletion confirmation box */}
              {showDeleteConfirm && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl space-y-2.5 text-right">
                  <p className="text-xs font-bold text-red-800 leading-relaxed">
                    {isRtl 
                      ? 'آیا از حذف کامل حساب کاربری و تمامی داده‌های ابری خود اطمینان دارید؟ این عمل غیرقابل بازگشت است!' 
                      : 'Are you sure you want to delete your account and all cloud data? This cannot be undone!'}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 cursor-pointer"
                    >
                      {isRtl ? 'انصراف' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        onClose();
                        onDeleteAccount();
                      }}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-lg shadow-sm cursor-pointer"
                    >
                      {isRtl ? 'بله، حذف کن' : 'Yes, Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                {isRtl ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-100 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isRtl ? 'ذخیره تغییرات' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
