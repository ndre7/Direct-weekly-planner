import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Trash2, 
  UserX, 
  UserCheck, 
  Search, 
  RefreshCw, 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle,
  Loader2,
  Calendar,
  ShieldAlert
} from 'lucide-react';
import { User } from '../types';
import { getIdToken } from 'firebase/auth';
import { auth } from '../lib/firebase.ts';
import { safeParseJson } from '../lib/auth.ts';

interface ManagedUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  suspended: boolean;
}

interface UserManagementViewProps {
  currentUser: User;
  onClose: () => void;
}

export default function UserManagementView({ currentUser, onClose }: UserManagementViewProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null); // holds user id of active operation

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      let activeToken = currentUser.token;
      if (auth.currentUser) {
        try {
          activeToken = await getIdToken(auth.currentUser);
        } catch (tokenErr) {
          console.warn("Could not dynamically refresh token:", tokenErr);
        }
      }
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }
      const response = await fetch(`/api/admin/users`, {
        headers
      });
      const result = await safeParseJson(response);
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'خطا در بارگیری لیست کاربران');
      }
      setUsers(result.users || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'ارتباط با سرور برقرار نشد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser.id]);

  const showNotification = (msg: string, isSuccess: boolean) => {
    if (isSuccess) {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleToggleSuspend = async (targetUser: ManagedUser) => {
    const actionText = targetUser.suspended ? 'رفع تعلیق' : 'تعلیق موقت';
    if (!window.confirm(`آیا از ${actionText} حساب کاربری "${targetUser.username}" مطمئن هستید؟`)) {
      return;
    }

    setActionInProgress(targetUser.id);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let activeToken = currentUser.token;
      if (auth.currentUser) {
        try {
          activeToken = await getIdToken(auth.currentUser);
        } catch (tokenErr) {
          console.warn("Could not dynamically refresh token:", tokenErr);
        }
      }
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }
      const response = await fetch('/api/admin/users/suspend', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetUserId: targetUser.id,
          suspend: !targetUser.suspended
        })
      });
      const result = await safeParseJson(response);
      if (!response.ok || !result.success) {
        throw new Error(result.error || `خطا در ${actionText} کاربر`);
      }
      
      showNotification(result.message || `حساب کاربر با موفقیت تغییر وضعیت یافت`, true);
      // Update local state
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, suspended: !u.suspended } : u));
    } catch (err: any) {
      showNotification(err.message || 'خطا در انجام عملیات تعلیق', false);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteUser = async (targetUser: ManagedUser) => {
    if (!window.confirm(`⚠️ توجه: حذف حساب کاربری "${targetUser.username}" دائمی بوده و تمامی اطلاعات تحصیلی و برنامه‌ریزی او حذف خواهد شد.\n\nآیا از حذف کامل این کاربر مطمئن هستید؟`)) {
      return;
    }

    setActionInProgress(targetUser.id);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let activeToken = currentUser.token;
      if (auth.currentUser) {
        try {
          activeToken = await getIdToken(auth.currentUser);
        } catch (tokenErr) {
          console.warn("Could not dynamically refresh token:", tokenErr);
        }
      }
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetUserId: targetUser.id
        })
      });
      const result = await safeParseJson(response);
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'خطا در حذف کاربر');
      }

      showNotification(result.message || 'حساب کاربری با موفقیت حذف گردید', true);
      // Remove from list
      setUsers(prev => prev.filter(u => u.id !== targetUser.id));
    } catch (err: any) {
      showNotification(err.message || 'خطا در حذف کاربر', false);
    } finally {
      setActionInProgress(null);
    }
  };

  // Filter users by search query
  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to format date cleanly
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200" dir="rtl">
      
      {/* Top Banner with Title and Back button */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white rounded-2xl flex items-center justify-center shadow-md">
            <Users className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">پنل مدیریت کاربران (Admin Panel)</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">مشاهده لیست اعضا، کنترل دسترسی‌ها، تعلیق و حذف حساب‌های کاربری</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-black transition-all cursor-pointer border border-slate-200/50 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>بازگشت به تنظیمات اصلی</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2 text-right">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 text-right">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search and Action Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="جستجوی کاربر با نام کاربری یا ایمیل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-right"
          />
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-black border border-slate-200 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          <span>بروزرسانی لیست</span>
        </button>

        <div className="text-left text-xs font-bold text-slate-400 shrink-0 select-none">
          تعداد کاربران: <span className="text-indigo-600 font-black text-sm">{filteredUsers.length}</span> از <span className="font-black">{users.length}</span>
        </div>
      </div>

      {/* Users List Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-xs text-slate-400 font-bold">در حال دریافت و تحلیل لیست کاربران...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-400">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="font-black text-sm text-slate-700">کاربری یافت نشد</h3>
            <p className="text-xs text-slate-400 font-bold mt-1 max-w-xs leading-relaxed">
              هیچ کاربری با عبارت جستجو شده در پایگاه داده پیدا نشد یا کاربری ثبت نام نکرده است.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/60 text-[10px] font-black text-slate-400 select-none">
                  <th className="p-4 pr-6">اطلاعات کاربری</th>
                  <th className="p-4">شناسه یکتا</th>
                  <th className="p-4">تاریخ و زمان ثبت‌نام</th>
                  <th className="p-4">وضعیت حساب</th>
                  <th className="p-4 pl-6 text-left">عملیات مدیریتی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user, index) => {
                  const isCurrentAdmin = user.id === currentUser.id;
                  const firstChar = user.username ? user.username.charAt(0).toUpperCase() : '?';
                  
                  // Generate an elegant pastel-like background class based on username code
                  const colors = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700'];
                  const colorIdx = (user.username.charCodeAt(0) || 0) % colors.length;
                  const avatarColor = colors[colorIdx];

                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50/40 transition-colors text-xs font-bold text-slate-700 ${
                        user.suspended ? 'bg-amber-50/10' : ''
                      }`}
                    >
                      {/* Column: User profile info */}
                      <td className="p-4 pr-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${avatarColor} shrink-0 shadow-2xs`}>
                            {firstChar}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                              {user.username}
                              {isCurrentAdmin && (
                                <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md">
                                  شما (ادمین)
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold leading-none">{user.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Column: Unique ID */}
                      <td className="p-4 text-slate-500 font-mono text-[10px]">{user.id}</td>

                      {/* Column: Registration Date */}
                      <td className="p-4 text-slate-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(user.createdAt)}</span>
                        </div>
                      </td>

                      {/* Column: Status Badge */}
                      <td className="p-4">
                        {user.suspended ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[9px] font-black">
                            <ShieldAlert className="w-3 h-3 text-amber-600" />
                            <span>تعلیق شده</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>فعال</span>
                          </span>
                        )}
                      </td>

                      {/* Column: Actions */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center justify-end gap-2">
                          
                          {/* Suspend Toggle Button */}
                          <button
                            type="button"
                            disabled={isCurrentAdmin || actionInProgress === user.id}
                            onClick={() => handleToggleSuspend(user)}
                            title={user.suspended ? 'رفع تعلیق حساب' : 'تعلیق موقت حساب'}
                            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              user.suspended 
                                ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70 text-emerald-700' 
                                : 'bg-amber-50 border-amber-200 hover:bg-amber-100/70 text-amber-700'
                            } ${isCurrentAdmin ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
                          >
                            {user.suspended ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black px-0.5">رفع تعلیق</span>
                              </>
                            ) : (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black px-0.5">تعلیق</span>
                              </>
                            )}
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            disabled={isCurrentAdmin || actionInProgress === user.id}
                            onClick={() => handleDeleteUser(user)}
                            title="حذف دائمی حساب کاربری"
                            className={`p-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                              isCurrentAdmin ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-black px-0.5">حذف کاربر</span>
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
