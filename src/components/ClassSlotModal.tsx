import React from 'react';
import { ClassSlot, Category, Language } from '../types';
import { TRANSLATIONS } from '../translations';
import { X, Save, Trash2, Clock } from 'lucide-react';

interface ClassSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  slot: ClassSlot | null;
  categories: Category[];
  lang: Language;
  onChange: (updated: ClassSlot) => void;
  onSave: () => void;
  onDelete?: () => void;
}

const parseTime = (timeStr: string) => {
  const regex = /(\d{1,2})(?::(\d{2}))?/g;
  const matches = [...timeStr.matchAll(regex)];
  
  let startH = '08';
  let startM = '00';
  let endH = '10';
  let endM = '00';

  if (matches.length >= 1) {
    startH = matches[0][1].padStart(2, '0');
    startM = (matches[0][2] || '00').padStart(2, '0');
  }
  if (matches.length >= 2) {
    endH = matches[1][1].padStart(2, '0');
    endM = (matches[1][2] || '00').padStart(2, '0');
  } else if (matches.length === 1) {
    const h = parseInt(startH) + 2;
    endH = (h > 23 ? 23 : h).toString().padStart(2, '0');
    endM = startM;
  }
  return { startH, startM, endH, endM };
};

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

export default function ClassSlotModal({
  isOpen,
  onClose,
  slot,
  categories,
  lang,
  onChange,
  onSave,
  onDelete,
}: ClassSlotModalProps) {
  if (!isOpen || !slot) return null;

  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'fa';

  const parsed = React.useMemo(() => parseTime(slot.timeFa || slot.timeEn || ''), [slot.timeFa, slot.timeEn]);

  const handleTimeChange = (type: 'startH' | 'startM' | 'endH' | 'endM', val: string) => {
    const current = { ...parsed, [type]: val };
    const formattedFa = `${parseInt(current.startH)}:${current.startM} تا ${parseInt(current.endH)}:${current.endM}`;
    const formattedEn = `${parseInt(current.startH)}:${current.startM} to ${parseInt(current.endH)}:${current.endM}`;
    onChange({
      ...slot,
      timeFa: formattedFa,
      timeEn: formattedEn
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200"
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800 text-lg">
            {slot.textFa || slot.textEn ? (isRtl ? 'ویرایش کلاس' : 'Edit Class') : (isRtl ? 'افزودن کلاس جدید' : 'Add New Class')}
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
          {/* Title input (Fa) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.titleFa}</label>
            <input
              type="text"
              value={slot.textFa}
              onChange={(e) => onChange({ ...slot, textFa: e.target.value })}
              placeholder="مثال: پیاده سازی پایگاه داده"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Title input (En) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.titleEn}</label>
            <input
              type="text"
              value={slot.textEn}
              onChange={(e) => onChange({ ...slot, textEn: e.target.value })}
              placeholder="Example: Database Implementation"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Time Picker Controls */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-3">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>{isRtl ? 'سیستم انتخاب ساعت شروع و پایان' : 'Start & End Time Selector'}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Start Time */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500">{isRtl ? 'ساعت شروع' : 'Start Time'}</label>
                <div className="flex gap-1.5" dir="ltr">
                  <select
                    value={parsed.startH}
                    onChange={(e) => handleTimeChange('startH', e.target.value)}
                    className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {hours.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="self-center text-slate-400 font-bold">:</span>
                  <select
                    value={parsed.startM}
                    onChange={(e) => handleTimeChange('startM', e.target.value)}
                    className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {minutes.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* End Time */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500">{isRtl ? 'ساعت پایان' : 'End Time'}</label>
                <div className="flex gap-1.5" dir="ltr">
                  <select
                    value={parsed.endH}
                    onChange={(e) => handleTimeChange('endH', e.target.value)}
                    className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {hours.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="self-center text-slate-400 font-bold">:</span>
                  <select
                    value={parsed.endM}
                    onChange={(e) => handleTimeChange('endM', e.target.value)}
                    className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {minutes.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Time input (Fa) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.timeFa}</label>
            <input
              type="text"
              value={slot.timeFa}
              onChange={(e) => onChange({ ...slot, timeFa: e.target.value })}
              placeholder="مثال: 10:30 تا 12 و 13 تا 14"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Time input (En) */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.timeEn}</label>
            <input
              type="text"
              value={slot.timeEn}
              onChange={(e) => onChange({ ...slot, timeEn: e.target.value })}
              placeholder="Example: 10:30 to 12 & 13 to 14"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Category selection */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500">{t.category}</label>
            <select
              value={slot.categoryId || ''}
              onChange={(e) => onChange({ ...slot, categoryId: e.target.value || undefined })}
              className="w-full text-sm p-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            >
              <option value="">{t.noCategory}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {isRtl ? cat.nameFa : cat.nameEn}
                </option>
              ))}
            </select>
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
