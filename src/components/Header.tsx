import React from 'react';
import { Sparkles, Edit3, CheckCircle, Menu, Calendar, User as UserIcon } from 'lucide-react';
import { TRANSLATIONS } from '../translations';
import { User } from '../types';

interface HeaderProps {
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (val: boolean) => void;
  lang: 'fa' | 'en';
  onOpenDayInspector: () => void;
  activeTab: number;
  currentUser: User | null;
  onOpenProfileModal: () => void;
}

export default function Header({
  isEditMode,
  setIsEditMode,
  isSidebarOpen,
  setIsSidebarOpen,
  lang,
  onOpenDayInspector,
  activeTab,
  currentUser,
  onOpenProfileModal,
}: HeaderProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'fa';

  const tabNames: Record<number, { fa: string; en: string }> = {
    1: { fa: 'کلاس ها و کار های روزانه', en: 'Classes & Daily Tasks' },
    6: { fa: 'کار های اصلی', en: 'Core Tasks' },
    3: { fa: 'کار های فرعی', en: 'Secondary Tasks' },
    10: { fa: 'سیستم هوشمند مدیریت اهداف', en: 'Goal Management System' },
    2: { fa: 'ددلاین ها', en: 'Deadlines' },
    4: { fa: 'یادآوری ها', en: 'Reminders' },
    7: { fa: 'کار های انجام شده / نشده', en: 'Completed / Expired' },
    11: { fa: 'امتحانات و ارائه‌ها', en: 'Exams & Presentations' },
    8: { fa: 'لغو/تعویق ها', en: 'Cancelled / Postponed' },
    5: { fa: 'یادداشت ها', en: 'Notes' },
    9: { fa: 'تحلیل (Analytics)', en: 'Analytics Dashboard' },
  };

  const activeTabInfo = tabNames[activeTab] || { fa: 'برنامه‌ریزی', en: 'Planner' };
  const currentTabName = isRtl ? activeTabInfo.fa : activeTabInfo.en;

  return (
    <header className="bg-white border-b border-slate-200/80 shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Logo & Header Info */}
          <div className="flex items-center gap-3">
            {/* Hamburger Menu Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-2.5 hover:bg-slate-100 border rounded-xl text-slate-600 hover:text-slate-800 transition-all cursor-pointer shadow-sm relative ${
                isSidebarOpen ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200'
              }`}
              title={isRtl ? "منوی مدیریت" : "Management Menu"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="w-11 h-11 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-100 flex-shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight font-sans">
                  {isRtl ? "برنامه ریزی هفتگی" : "Weekly Planner"}
                </h1>
                
                {/* Active Tab Name Badge */}
                <span className="text-xs bg-indigo-50 border border-indigo-200/90 text-indigo-700 px-2.5 py-0.5 rounded-xl font-bold flex items-center gap-1 shadow-3xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                  <span>{currentTabName}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls: Day Inspector, User Profile & Edit/View Switcher */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            
            {/* User Profile Button */}
            <button
              onClick={onOpenProfileModal}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all shadow-3xs cursor-pointer group"
              title={isRtl ? "ویرایش پروفایل کاربری" : "Edit Profile"}
            >
              <div className="w-6 h-6 rounded-lg overflow-hidden bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                {currentUser?.avatar ? (
                  <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-3.5 h-3.5 text-indigo-600" />
                )}
              </div>
              <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 transition-colors max-w-[120px] truncate">
                {currentUser?.username || (isRtl ? 'پروفایل کاربری' : 'User Profile')}
              </span>
            </button>

            {/* Day Inspector Trigger Button */}
            <button
              onClick={onOpenDayInspector}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-sm cursor-pointer"
              title={isRtl ? "بررسی و جستجوی اطلاعات روز خاص" : "Inspect and Search Specific Date"}
            >
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span>{isRtl ? "روزبین" : "Day Inspector"}</span>
            </button>

            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer ${
                isEditMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'
              }`}
            >
              {isEditMode ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>{t.viewMode}</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" />
                  <span>{t.editMode}</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}

