import React, { useState } from 'react';
import { PlannerData, User } from '../types';
import { 
  RotateCcw, 
  Upload, 
  Download, 
  Languages, 
  Settings, 
  X, 
  BookOpen, 
  Sliders,
  Plus,
  Minus,
  FolderHeart,
  Sun,
  Moon,
  Users,
  ShieldAlert,
  ShieldCheck,
  FileDown,
  Wrench,
  AlertTriangle,
  HeartPulse
} from 'lucide-react';
import CategoriesManagementPage from './CategoriesManagementPage';
import UserManagementView from './UserManagementView';
import { verifyAndRepairPlannerData } from './SessionManager';
import GoogleCalendarSync from './GoogleCalendarSync';

interface SettingsPageProps {
  data: PlannerData;
  setData: React.Dispatch<React.SetStateAction<PlannerData>>;
  editMode: boolean;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onExportPDF: () => void;
  onReset: () => void;
  onClose: () => void;
  currentUser?: User | null;
  lang: 'fa' | 'en';
  setLang: (lang: 'fa' | 'en') => void;
  isCriticalAuthFailure: boolean;
  weekDates: string[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function SettingsPage({
  data,
  setData,
  editMode,
  onImport,
  onExport,
  onExportPDF,
  onReset,
  onClose,
  currentUser,
  lang,
  setLang,
  isCriticalAuthFailure,
  weekDates,
  showToast
}: SettingsPageProps) {
  // Tabs inside Settings: 'general' | 'integrity'
  const [activeTab, setActiveTab] = useState<'general' | 'integrity'>('general');

  // Persistence settings
  const [autoLoad, setAutoLoad] = useState<boolean>(() => {
    return localStorage.getItem('auto_load_data') !== 'false';
  });
  const [autoUpdateCal, setAutoUpdateCal] = useState<boolean>(() => {
    return localStorage.getItem('auto_update_calendar') !== 'false';
  });
  
  const [showDownloadOptions, setShowDownloadOptions] = useState<boolean>(false);
  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
  const [showUserManagement, setShowUserManagement] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark') || localStorage.getItem('theme') === 'dark';
  });

  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  const isRtl = lang === 'fa';

  const handleToggleAutoLoad = () => {
    const nextVal = !autoLoad;
    setAutoLoad(nextVal);
    localStorage.setItem('auto_load_data', nextVal.toString());
  };

  const handleToggleAutoUpdateCalendar = () => {
    const nextVal = !autoUpdateCal;
    setAutoUpdateCal(nextVal);
    localStorage.setItem('auto_update_calendar', nextVal.toString());
  };

  const handleTermValueChange = (val: string) => {
    setData(prev => ({
      ...prev,
      term: val
    }));
  };

  const handleManualRepair = () => {
    const { repairedData, repairedCount } = verifyAndRepairPlannerData(data);
    if (repairedCount > 0 && repairedData) {
      setData(repairedData);
      localStorage.setItem('planner_data', JSON.stringify(repairedData));
      setRepairMessage(
        isRtl 
          ? `ساختار داده‌ها با موفقیت تایید شد! تعداد ${repairedCount} فیلد برطرف و ترمیم شد.` 
          : `Structure verified! Repaired ${repairedCount} missing or outdated schema properties.`
      );
    } else {
      setRepairMessage(
        isRtl 
          ? 'ساختار داده‌های شما کاملاً سالم و بدون هیچ نقصی است.' 
          : 'Your data schema is fully consistent and healthy. No repairs needed.'
      );
    }
    setTimeout(() => {
      setRepairMessage(null);
    }, 4000);
  };

  // English translation map for settings
  const t = {
    title: isRtl ? 'تنظیمات پیشرفته سیستم' : 'Advanced System Settings',
    subtitle: isRtl 
      ? 'پیکربندی هویت برنامه، دسته‌بندی‌ها، دیتابیس محلی و پشتیبان‌گیری' 
      : 'Configure academic term, categories, local database and backups',
    close: isRtl ? 'بستن تنظیمات و بازگشت' : 'Close and Return',
    tabGeneral: isRtl ? 'تنظیمات عمومی و سیستم' : 'General & System',
    tabIntegrity: isRtl ? 'سلامت داده‌ها (Data Integrity)' : 'Data Integrity',
    termTitle: isRtl ? 'ترم تحصیلی و عنوان سیستم' : 'Academic Semester & Title',
    termLabel: isRtl ? 'ترم جاری دانشگاهی' : 'Current Academic Term',
    behaviorTitle: isRtl ? 'رفتار برنامه و ذخیره‌سازی محلی' : 'App Behavior & Storage',
    autoLoadTitle: isRtl ? 'بارگیری خودکار اطلاعات در استارت‌آپ' : 'Auto-Load Data on Startup',
    autoLoadSub: isRtl 
      ? 'بارگیری و ذخیره خودکار فایل JSON هر هفته پس از پایان هفته' 
      : 'Auto-download and save JSON file after week ends',
    autoCalTitle: isRtl ? 'بروزرسانی خودکار تقویم' : 'Auto-Update Calendar',
    autoCalSub: isRtl 
      ? 'همگام سازی خودکار بازه زمانی هفته پس از پایان هر هفته' 
      : 'Auto-sync week date range after week ends',
    defaultLangTitle: isRtl ? 'زبان پیش‌فرض رابط کاربری' : 'Default UI Language',
    defaultLangSub: isRtl ? 'تغییر زبان محیط کاربری برنامه' : 'Switch the primary language of the application',
    themeTitle: isRtl ? 'حالت نمایشی (تم)' : 'Theme Mode',
    themeSub: isRtl ? 'تغییر ظاهر برنامه بین تم روشن و تاریک' : 'Toggle application visual appearance between light and dark',
    themeLight: isRtl ? 'روشن' : 'Light',
    themeDark: isRtl ? 'تاریک' : 'Dark',
    categoryTitle: isRtl ? 'دسته‌بندی‌ها و برچسب‌های رنگی' : 'Categories & Colored Labels',
    categorySub: isRtl 
      ? 'شما می‌توانید نام، رنگ، نوع فعالیت و اولویت نمایش دسته‌بندی‌ها را مدیریت کنید.' 
      : 'Manage category names, colors, activity classification, and priority.',
    categoryBtn: isRtl ? 'مدیریت دسته‌بندی‌ها و برچسب‌ها' : 'Manage Categories & Labels',
    adminTitle: isRtl ? 'مدیریت کاربران (مخصوص مدیریت)' : 'User Management Panel (Admin)',
    adminSub: isRtl 
      ? 'مشاهده لیست تمام اعضا، وضعیت اکانت‌ها و حذف یا تعلیق حساب کاربران.' 
      : 'View all registered members, check cloud statuses, suspend or delete users.',
    adminBtn: isRtl ? 'ورود به پنل مدیریت اعضا' : 'Enter User Management Panel',
    backupTitle: isRtl ? 'پشتیبان‌گیری و همگام‌سازی' : 'Backup & Recovery',
    backupSub: isRtl 
      ? 'شما می‌توانید اطلاعات را در قالب فایل JSON بارگیری کنید یا پرینت بگیرید.' 
      : 'Export all weekly planner schedules to a JSON raw file or high-quality PDF.',
    backupBtn: isRtl ? 'بارگیری اطلاعات' : 'Download Options',
    backupJson: isRtl ? '📥 بارگیری نسخه JSON' : '📥 Download JSON Raw',
    backupPdf: isRtl ? '📄 بارگیری نسخه PDF' : '📄 Export to PDF',
    backupRawLabel: isRtl ? 'فایل خام داده‌ها' : 'Raw data file',
    backupPdfLabel: isRtl ? 'پرینت با کیفیت بالا' : 'High quality print',
    uploadBtn: isRtl ? 'بارگذاری فایل JSON' : 'Upload JSON Backup',
    dangerTitle: isRtl ? 'منطقه حساس (بازنشانی اولیه)' : 'Danger Zone (Hard Reset)',
    dangerSub: isRtl 
      ? 'پاک کردن تمام تغییرات و بازنشانی دیتابیس به قالب خام کارخانه. این عملیات غیرقابل بازگشت است.' 
      : 'Wipe all custom planner entries and restore default settings. Irreversible.',
    dangerBtn: isRtl ? 'حذف اطلاعات و بازنشانی قالب اولیه' : 'Wipe and Hard Reset Planner',
    integrityTitle: isRtl ? 'سلامت داده‌ها و امنیت همگام‌سازی' : 'Data Integrity & Session Health',
    integrityIntro: isRtl 
      ? 'ابزارهای محافظت از داده‌ها در برابر قطعی‌های ناگهانی، اشکالات مرورگر یا اختلال احراز هویت ابری' 
      : 'Maintain structural state stability, repair corrupted schemas, and safeguard offline work',
    statusTitle: isRtl ? 'وضعیت فعلی اتصال ابری' : 'Cloud Sync Status',
    statusFailureWarning: isRtl 
      ? '⚠️ خطای همگام‌سازی ابری شناسایی شد! حساب شما موقتاً مسدود شده یا نشست منقضی شده است. لطفاً نسخه پشتیبان JSON زیر را فوراً دانلود کنید تا کارهای محلی جدیدتان از بین نرود.' 
      : '⚠️ Cloud sync is blocked due to an authentication failure! Please immediately download your local state JSON backup below to prevent losing your recent offline edits.',
    statusSafe: isRtl 
      ? 'اتصال ابری ایمن و بدون نقص است.' 
      : 'Cloud syncing is safe, verified, and functioning perfectly.',
    repairTitle: isRtl ? 'اعتبار سنجی و عیب‌یابی ساختار دیتابیس' : 'Database Schema Verification',
    repairSub: isRtl 
      ? 'بررسی داده‌های محلی و اضافه کردن ویژگی‌های از قلم افتاده یا ویران‌شده جهت جلوگیری از کرش برنامه.' 
      : 'Verify structural data and inject missing fields or schemas to avoid application crashes.',
    repairBtn: isRtl ? 'ترمیم خودکار ساختار داده‌های محلی' : 'Verify & Self-Repair Local Data',
    emergencyExportTitle: isRtl ? 'پشتیبان‌گیری اضطراری (JSON)' : 'Emergency JSON State Export',
    emergencyExportSub: isRtl 
      ? 'در صورت بروز اختلال در سرور ابری، بلافاصله کارهای خود را به صورت محلی در یک فایل دانلود کنید.' 
      : 'If cloud syncing gets blocked, download your progress directly to a local JSON file.',
    emergencyBtn: isRtl ? 'دانلود فوری فایل پشتیبان JSON' : 'Download Emergency JSON Backup',
  };

  // Card classes matching the application's clean styling
  const cardClass = "bg-white rounded-3xl border border-slate-200 shadow-xs p-6 flex flex-col gap-4";

  // If the user chooses to manage categories, we display the dedicated CategoriesManagementPage
  if (showCategoryManager) {
    return (
      <CategoriesManagementPage
        categories={data.categories || []}
        onUpdateCategories={(updated) => setData(prev => ({ ...prev, categories: updated }))}
        secondaryTaskColumns={data.secondaryTaskColumns || []}
        onUpdateSecondaryColumns={(updated) => setData(prev => ({ ...prev, secondaryTaskColumns: updated }))}
        onClose={() => setShowCategoryManager(false)}
      />
    );
  }

  // If the admin chooses to manage users, we display the UserManagementView
  const isAdmin = currentUser?.email?.toLowerCase().trim() === 'nimadarai05@gmail.com';
  if (showUserManagement && currentUser && isAdmin) {
    return (
      <UserManagementView
        currentUser={currentUser}
        onClose={() => setShowUserManagement(false)}
      />
    );
  }

  return (
    <div 
      className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-200" 
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      
      {/* Top Banner with Title and Back/Close button */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-tr from-slate-700 to-slate-900 text-white rounded-2xl flex items-center justify-center shadow-md">
            <Settings className="w-6 h-6 animate-spin-slow" />
          </div>
          <div className={isRtl ? 'text-right' : 'text-left'}>
            <h2 className="text-lg font-black text-slate-800">{t.title}</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">{t.subtitle}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-black transition-all cursor-pointer border border-slate-200/50 shadow-2xs"
        >
          <X className="w-4 h-4" />
          <span>{t.close}</span>
        </button>
      </div>

      {/* Tabs Selector Navigation */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-5 py-3 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 ${ activeTab === 'general' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 '}`}
        >
          <Sliders className="w-4 h-4" />
          <span>{t.tabGeneral}</span>
        </button>
        <button
          onClick={() => setActiveTab('integrity')}
          className={`px-5 py-3 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 ${ activeTab === 'integrity' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 '}`}
        >
          <HeartPulse className="w-4 h-4" />
          <span>{t.tabIntegrity}</span>
          {isCriticalAuthFailure && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          )}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'general' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1 & 2: General settings */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Card: Identity & Semester */}
            <div className={cardClass}>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-sm text-slate-800">{t.termTitle}</h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1.5 text-right">
                  <label className="text-[10px] font-black text-slate-400">{t.termLabel}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={data.term || ''}
                      onChange={(e) => handleTermValueChange(e.target.value)}
                      placeholder={isRtl ? "مثال: ترم دانشگاه : 6" : "Example: Semester : 6"}
                      className="flex-1 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
                    />
                    
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const currentNum = parseInt(data.term?.replace(/\D/g, '') || '1') || 1;
                          handleTermValueChange(isRtl ? `ترم دانشگاه : ${currentNum + 1}` : `Semester : ${currentNum + 1}`);
                        }}
                        className="w-10 h-10 flex items-center justify-center border border-slate-200 hover:bg-slate-100 bg-white rounded-xl text-slate-800 font-bold cursor-pointer transition-all active:scale-95 shadow-2xs"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const currentNum = parseInt(data.term?.replace(/\D/g, '') || '2') || 2;
                          if (currentNum > 1) {
                            handleTermValueChange(isRtl ? `ترم دانشگاه : ${currentNum - 1}` : `Semester : ${currentNum - 1}`);
                          }
                        }}
                        className="w-10 h-10 flex items-center justify-center border border-slate-200 hover:bg-slate-100 bg-white rounded-xl text-slate-800 font-bold cursor-pointer transition-all active:scale-95 shadow-2xs"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card: Syncing & Behavior Settings */}
            <div className={cardClass}>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Sliders className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-sm text-slate-800">{t.behaviorTitle}</h3>
              </div>

              <div className="space-y-4">
                
                {/* Toggle 1: Auto-Load */}
                <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50/50 transition-colors">
                  <div className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                    <span className="font-black text-xs text-slate-800">{t.autoLoadTitle}</span>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t.autoLoadSub}</p>
                  </div>
                  <button
                    type="button"
                    dir="ltr"
                    onClick={handleToggleAutoLoad}
                    className={`w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer shrink-0 relative flex items-center p-1 ${ autoLoad ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-md pointer-events-none" />
                  </button>
                </div>

                {/* Toggle 2: Auto-Update Calendar */}
                <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50/50 transition-colors">
                  <div className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                    <span className="font-black text-xs text-slate-800">{t.autoCalTitle}</span>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t.autoCalSub}</p>
                  </div>
                  <button
                    type="button"
                    dir="ltr"
                    onClick={handleToggleAutoUpdateCalendar}
                    className={`w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer shrink-0 relative flex items-center p-1 ${ autoUpdateCal ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-md pointer-events-none" />
                  </button>
                </div>

                {/* Setting 3: Language */}
                <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50/50 transition-colors">
                  <div className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                    <span className="font-black text-xs text-slate-800">{t.defaultLangTitle}</span>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t.defaultLangSub}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Languages className="w-4 h-4 text-slate-400" />
                    <select
                      value={lang}
                      onChange={(e) => {
                        const newLang = e.target.value as 'fa' | 'en';
                        setLang(newLang);
                        localStorage.setItem('planner_lang', newLang);
                      }}
                      className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      <option value="fa">فارسی (Persian)</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>

                {/* Setting 4: Theme Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50/50 transition-colors">
                  <div className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                    <span className="font-black text-xs text-slate-800">{t.themeTitle}</span>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t.themeSub}</p>
                  </div>
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDark(false);
                        document.documentElement.classList.remove('dark');
                        localStorage.setItem('theme', 'light');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${ !isDark ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t.themeLight}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDark(true);
                        document.documentElement.classList.add('dark');
                        localStorage.setItem('theme', 'dark');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${ isDark ? 'bg-slate-800 dark:bg-indigo-950 text-white shadow-3xs' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Moon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t.themeDark}</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Card: Dedicated Categories Management Access Block */}
            <div className={cardClass}>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <FolderHeart className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-sm text-slate-800">{t.categoryTitle}</h3>
              </div>
              
              <p className={`text-xs text-slate-400 font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                {t.categorySub}
              </p>

              <button
                type="button"
                onClick={() => setShowCategoryManager(true)}
                className="w-full flex items-center justify-center gap-2 p-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-2xl font-black text-xs transition-all border border-slate-200 active:scale-98 cursor-pointer shadow-3xs"
              >
                <FolderHeart className="w-4 h-4 text-indigo-500" />
                <span>{t.categoryBtn}</span>
              </button>
            </div>

            {/* Google Calendar Sync Card */}
            <GoogleCalendarSync
              data={data}
              weekDates={weekDates}
              currentUser={currentUser || null}
              lang={lang}
              showToast={showToast}
            />

            {/* Card: Admin User Management Access Block */}
            {isAdmin && (
              <div className="bg-indigo-50/25 border border-indigo-200/50 rounded-3xl p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
                  <Users className="w-5 h-5 text-indigo-600 animate-pulse" />
                  <h3 className="font-black text-sm text-slate-800">{t.adminTitle}</h3>
                </div>
                
                <p className="text-xs text-slate-500 font-bold leading-relaxed">
                  {t.adminSub}
                </p>

                <button
                  type="button"
                  onClick={() => setShowUserManagement(true)}
                  className="w-full flex items-center justify-center gap-2 p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs transition-all border border-indigo-700 active:scale-98 cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.01]"
                >
                  <Users className="w-4.5 h-4.5 text-white" />
                  <span>{t.adminBtn}</span>
                </button>
              </div>
            )}

          </div>

          {/* Column 3: Backup & Danger Zone */}
          <div className="space-y-6">
            
            {/* Card: Backup, Import, Export */}
            <div className={cardClass}>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Download className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-sm text-slate-800">{t.backupTitle}</h3>
              </div>
              
              <p className={`text-xs text-slate-400 font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                {t.backupSub}
              </p>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDownloadOptions(!showDownloadOptions)}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 border border-indigo-200 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 rounded-2xl font-black text-xs transition-all shadow-2xs active:scale-98 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{t.backupBtn}</span>
                </button>

                {showDownloadOptions && (
                  <div className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-150 rounded-2xl animate-in fade-in duration-100 text-right">
                    <button
                      type="button"
                      onClick={onExport}
                      className="w-full text-right p-2.5 hover:bg-white rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-between"
                    >
                      <span>{t.backupJson}</span>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{t.backupRawLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose(); // Close settings page
                        setTimeout(() => {
                          onExportPDF(); // Trigger PDF Export
                        }, 150);
                      }}
                      className="w-full text-right p-2.5 hover:bg-white rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-between"
                    >
                      <span>{t.backupPdf}</span>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{t.backupPdfLabel}</span>
                    </button>
                  </div>
                )}

                <label className="w-full flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl font-black text-xs transition-all shadow-2xs cursor-pointer active:scale-98">
                  <Upload className="w-4 h-4 text-indigo-500" />
                  <span>{t.uploadBtn}</span>
                  <input type="file" accept=".json" onChange={onImport} className="hidden" />
                </label>
              </div>
            </div>

            {/* Card: Danger Zone */}
            <div className="bg-red-50/30 dark:bg-red-950/10 rounded-3xl border border-red-200/60 dark:border-red-900/40 p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-red-100 dark:border-red-900 pb-3">
                <RotateCcw className="w-5 h-5 text-red-600" />
                <h3 className="font-black text-sm text-red-800 dark:text-red-400">{t.dangerTitle}</h3>
              </div>

              <p className={`text-xs text-red-700/70 dark:text-red-400/80 font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                {t.dangerSub}
              </p>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm(isRtl ? 'آیا مطمئن هستید که می‌خواهید تمام تغییرات را بازنشانی کرده و به قالب اولیه برگردید؟' : 'Are you sure you want to restore default template? All current customizations will be lost.')) {
                    onReset();
                  }
                }}
                className="w-full flex items-center justify-center gap-2 p-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs transition-all shadow-sm active:scale-98 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t.dangerBtn}</span>
              </button>
            </div>

          </div>

        </div>
      ) : (
        /* --- TAB 2: DATA INTEGRITY (Requested by the user) --- */
        <div className="space-y-6 max-w-4xl mx-auto">
          
          <div className={cardClass}>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <HeartPulse className="w-6 h-6 text-indigo-600 animate-pulse" />
              <div>
                <h3 className="font-black text-base text-slate-800">{t.integrityTitle}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{t.integrityIntro}</p>
              </div>
            </div>

            {/* System Cloud Status Alert Section */}
            <div className="space-y-3.5">
              <h4 className="font-black text-xs text-slate-500 uppercase tracking-wider">{t.statusTitle}</h4>
              
              {isCriticalAuthFailure ? (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 p-5 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-start gap-3 text-red-700 dark:text-red-400">
                    <ShieldAlert className="w-6 h-6 shrink-0 animate-bounce" />
                    <div>
                      <p className="font-black text-sm">{isRtl ? 'خطای حیاتی احراز هویت شناسایی شد' : 'Critical Authentication Failure Detected'}</p>
                      <p className="text-xs font-bold leading-relaxed mt-1.5">{t.statusFailureWarning}</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-red-150 dark:border-red-900/40">
                    <button
                      onClick={onExport}
                      className="flex items-center gap-1.5 px-4.5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>{t.emergencyBtn}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 p-4 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-xs font-bold">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-500 shrink-0" />
                  <span>{t.statusSafe}</span>
                </div>
              )}
            </div>

            {/* Verify & Structural Self-Repair Tool */}
            <div className="space-y-3.5 pt-4 border-t border-slate-100">
              <h4 className="font-black text-xs text-slate-500 uppercase tracking-wider">{t.repairTitle}</h4>
              <p className={`text-xs text-slate-400 font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                {t.repairSub}
              </p>

              {repairMessage && (
                <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 p-3 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-400 leading-relaxed text-right">
                  🎉 {repairMessage}
                </div>
              )}

              <button
                type="button"
                onClick={handleManualRepair}
                className="w-full flex items-center justify-center gap-2 p-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-2xl font-black text-xs transition-all border border-slate-200 active:scale-98 cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-indigo-500" />
                <span>{t.repairBtn}</span>
              </button>
            </div>

            {/* Raw JSON Export Feature (Independent of sync error) */}
            <div className="space-y-3.5 pt-4 border-t border-slate-100">
              <h4 className="font-black text-xs text-slate-500 uppercase tracking-wider">{t.emergencyExportTitle}</h4>
              <p className={`text-xs text-slate-400 font-bold leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                {t.emergencyExportSub}
              </p>

              <button
                type="button"
                onClick={onExport}
                className="w-full flex items-center justify-center gap-2 p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs transition-all active:scale-98 cursor-pointer shadow-sm"
              >
                <FileDown className="w-4 h-4" />
                <span>{t.emergencyBtn}</span>
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
