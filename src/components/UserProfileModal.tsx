import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, Camera, Check, X, Sparkles, Upload, Trash2, Mail, Lock } from 'lucide-react';
import { User } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUpdateProfile: (updatedUser: User) => void;
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
  showToast,
  lang,
}: UserProfileModalProps) {
  const isRtl = lang === 'fa';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(currentUser?.username || (isRtl ? 'کاربر برنامه‌ریز' : 'Planner User'));
  const [avatar, setAvatar] = useState<string | undefined>(currentUser?.avatar);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = () => {
    if (!username.trim()) {
      showToast(isRtl ? 'لطفاً نام کاربری را وارد کنید.' : 'Please enter a username.');
      return;
    }

    setIsSaving(true);

    const baseUser: User = currentUser || {
      id: `user_${Date.now()}`,
      email: 'user@local.app',
      username: username.trim(),
    };

    const updatedUser: User = {
      ...baseUser,
      username: username.trim(),
      avatar: avatar,
    };

    onUpdateProfile(updatedUser);
    setIsSaving(false);
    showToast(isRtl ? 'اطلاعات حساب کاربری با موفقیت بروزرسانی شد.' : 'Profile updated successfully.');
    onClose();
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
