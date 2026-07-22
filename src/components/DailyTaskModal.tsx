import React from 'react';
import { DailyTask, Category, Language } from '../types';
import { TRANSLATIONS } from '../translations';
import { X, Save, Trash2 } from 'lucide-react';

interface DailyTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayKey: string;
  task: DailyTask | null;
  categories: Category[];
  lang: Language;
  onChange: (updated: DailyTask) => void;
  onSave: () => void;
  onDelete?: () => void;
}

export default function DailyTaskModal({
  isOpen,
  onClose,
  dayKey,
  task,
  categories,
  lang,
  onChange,
  onSave,
  onDelete,
}: DailyTaskModalProps) {
  if (!isOpen || !task) return null;

  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'fa';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200"
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800 text-lg">
            {task.textFa || task.textEn ? (isRtl ? 'ویرایش کار روزانه' : 'Edit Daily Task') : (isRtl ? 'افزودن کار روزانه جدید' : 'Add New Daily Task')}
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Text (Fa) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.titleFa}</label>
            <input
              type="text"
              value={task.textFa}
              onChange={(e) => onChange({ ...task, textFa: e.target.value })}
              placeholder="مثال: ورزش صبحگاهی"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Text (En) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.titleEn}</label>
            <input
              type="text"
              value={task.textEn}
              onChange={(e) => onChange({ ...task, textEn: e.target.value })}
              placeholder="Example: Morning Workout"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Category selection */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.category}</label>
            <select
              value={task.categoryId}
              onChange={(e) => onChange({ ...task, categoryId: e.target.value })}
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {isRtl ? cat.nameFa : cat.nameEn}
                </option>
              ))}
            </select>
          </div>

          {/* Status selection */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.status}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...task, status: 'pending' })}
                className={`flex-1 text-xs py-2 px-1 font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                  task.status === 'pending'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                🕒 {t.pending}
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...task, status: 'completed' })}
                className={`flex-1 text-xs py-2 px-1 font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                  task.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ✅ {t.completed}
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...task, status: 'failed' })}
                className={`flex-1 text-xs py-2 px-1 font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                  task.status === 'failed'
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ❌ انجام نشده
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          {onDelete ? (
            <button
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-bold px-3 py-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t.delete}</span>
            </button>
          ) : (
            <div></div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              onClick={onSave}
              className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm shadow-blue-100 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{t.save}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
