import React from 'react';
import { Category, Language } from '../types';
import { TRANSLATIONS } from '../translations';
import { Plus, Trash2, Edit, Check, X } from 'lucide-react';

interface CategoriesManagerProps {
  categories: Category[];
  lang: Language;
  onUpdateCategories: (categories: Category[]) => void;
  isEditMode: boolean;
}

export default function CategoriesManager({
  categories,
  lang,
  onUpdateCategories,
  isEditMode,
}: CategoriesManagerProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'fa';

  const [newCatFa, setNewCatFa] = React.useState('');
  const [newCatEn, setNewCatEn] = React.useState('');
  const [newColor, setNewColor] = React.useState('bg-indigo-100 border-indigo-300 text-indigo-900');

  // Editing state
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editNameFa, setEditNameFa] = React.useState('');
  const [editNameEn, setEditNameEn] = React.useState('');
  const [editColor, setEditColor] = React.useState('');

  const addCategory = () => {
    if (!newCatFa.trim()) return;
    const finalEn = newCatEn.trim() || newCatFa.trim();
    const newCat: Category = {
      id: 'cat_' + Date.now(),
      nameFa: newCatFa,
      nameEn: finalEn,
      color: `${newColor} hover:opacity-90`,
    };
    onUpdateCategories([...categories, newCat]);
    setNewCatFa('');
    setNewCatEn('');
  };

  const deleteCategory = (id: string) => {
    if (window.confirm('آیا مایل به حذف این دسته‌بندی هستید؟')) {
      onUpdateCategories(categories.filter((c) => c.id !== id));
    }
  };

  const startEditing = (cat: Category) => {
    setEditingId(cat.id);
    setEditNameFa(cat.nameFa);
    setEditNameEn(cat.nameEn || cat.nameFa);
    // strip hover:opacity-90 if present to keep it clean
    setEditColor(cat.color.replace(' hover:opacity-90', '').replace(' hover:opacity-80', ''));
  };

  const saveCategoryEdit = () => {
    if (!editNameFa.trim()) return;
    const updated = categories.map((c) => {
      if (c.id === editingId) {
        return {
          ...c,
          nameFa: editNameFa.trim(),
          nameEn: editNameEn.trim() || editNameFa.trim(),
          color: `${editColor} hover:opacity-90`,
        };
      }
      return c;
    });
    onUpdateCategories(updated);
    setEditingId(null);
  };

  const COLORS = [
    { label: 'Blue', value: 'bg-blue-100 border-blue-300 text-blue-900' },
    { label: 'Green', value: 'bg-green-100 border-green-300 text-green-900' },
    { label: 'Teal', value: 'bg-teal-100 border-teal-300 text-teal-900' },
    { label: 'Cyan', value: 'bg-cyan-100 border-cyan-300 text-cyan-900' },
    { label: 'Sky', value: 'bg-sky-100 border-sky-300 text-sky-900' },
    { label: 'Indigo', value: 'bg-indigo-100 border-indigo-300 text-indigo-900' },
    { label: 'Purple', value: 'bg-purple-100 border-purple-300 text-purple-900' },
    { label: 'Fuchsia', value: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900' },
    { label: 'Pink', value: 'bg-pink-100 border-pink-300 text-pink-900' },
    { label: 'Rose', value: 'bg-rose-100 border-rose-300 text-rose-900' },
    { label: 'Red', value: 'bg-red-100 border-red-300 text-red-900' },
    { label: 'Orange', value: 'bg-orange-100 border-orange-300 text-orange-900' },
    { label: 'Amber', value: 'bg-amber-100 border-amber-300 text-amber-900' },
    { label: 'Yellow', value: 'bg-yellow-100 border-yellow-300 text-yellow-900' },
    { label: 'Lime', value: 'bg-lime-100 border-lime-300 text-lime-900' },
    { label: 'Emerald', value: 'bg-emerald-100 border-emerald-300 text-emerald-900' },
    { label: 'Violet', value: 'bg-violet-100 border-violet-300 text-violet-900' },
    { label: 'Slate', value: 'bg-slate-100 border-slate-300 text-slate-900' },
    { label: 'Zinc', value: 'bg-zinc-100 border-zinc-300 text-zinc-900' },
    { label: 'Stone', value: 'bg-stone-100 border-stone-300 text-stone-900' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm">
          {isRtl ? 'مدیریت دسته‌بندی‌ها و برچسب‌ها' : 'Labels & Categories'}
        </h3>
        <span className="text-xs text-slate-400 font-bold">
          {categories.length} {isRtl ? 'مورد' : 'items'}
        </span>
      </div>

      {/* Render Current Categories */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${cat.color}`}
          >
            <span>{isRtl ? cat.nameFa : cat.nameEn}</span>
            {isEditMode && (
              <div className="flex items-center gap-1 mr-1 border-r border-current/20 pr-1 mr-1">
                <button
                  type="button"
                  onClick={() => startEditing(cat)}
                  className="hover:bg-slate-950/10 p-0.5 rounded text-current transition-all cursor-pointer"
                  title="ویرایش نام و رنگ"
                >
                  <Edit className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteCategory(cat.id)}
                  className="hover:bg-rose-950/10 p-0.5 rounded text-current transition-all cursor-pointer"
                  title="حذف"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Category Editor Panel */}
      {isEditMode && editingId && (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-right">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
            <span className="text-[10px] font-black text-slate-600">ویرایش دسته‌بندی</span>
            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[9px] text-slate-400 font-bold block">نام فارسی:</label>
              <input
                type="text"
                value={editNameFa}
                onChange={(e) => setEditNameFa(e.target.value)}
                className="w-full text-xs p-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] text-slate-400 font-bold block">نام انگلیسی:</label>
              <input
                type="text"
                value={editNameEn}
                onChange={(e) => setEditNameEn(e.target.value)}
                className="w-full text-xs p-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-slate-400 font-bold block">رنگ جدید را انتخاب کنید:</label>
            <div className="flex flex-wrap gap-1">
              {COLORS.map((col) => (
                <button
                  key={`edit-${col.value}`}
                  type="button"
                  onClick={() => setEditColor(col.value)}
                  className={`w-4.5 h-4.5 rounded-full border transition-all cursor-pointer ${col.value} ${
                    editColor === col.value ? 'ring-2 ring-offset-1 ring-indigo-500' : 'opacity-80 hover:opacity-100'
                  }`}
                  title={col.label}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-1.5 pt-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-[10px] font-bold px-3 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={saveCategoryEdit}
              className="text-[10px] font-black px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>ذخیره تغییرات</span>
            </button>
          </div>
        </div>
      )}

      {/* Add New Category (Only in edit mode) */}
      {isEditMode && !editingId && (
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <p className="text-xs font-bold text-slate-500">
            {isRtl ? 'افزودن دسته‌بندی جدید' : 'Create New Category'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={newCatFa}
              onChange={(e) => setNewCatFa(e.target.value)}
              placeholder="نام فارسی (مثال: مطالعه)"
              className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none"
            />
            <input
              type="text"
              value={newCatEn}
              onChange={(e) => setNewCatEn(e.target.value)}
              placeholder="نام انگلیسی (اختیاری)"
              className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none text-right"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">
              {isRtl ? 'رنگ:' : 'Color:'}
            </span>
            <div className="flex flex-wrap gap-1">
              {COLORS.map((col) => (
                <button
                  key={col.value}
                  type="button"
                  onClick={() => setNewColor(col.value)}
                  className={`w-5 h-5 rounded-full border transition-all cursor-pointer ${col.value} ${
                    newColor === col.value ? 'ring-2 ring-offset-1 ring-blue-500' : 'opacity-80 hover:opacity-100'
                  }`}
                  title={col.label}
                />
              ))}
            </div>

            <button
              onClick={addCategory}
              className="ms-auto flex items-center gap-1 bg-slate-800 hover:bg-slate-950 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.add}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
