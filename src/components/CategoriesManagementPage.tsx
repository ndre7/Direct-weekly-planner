import React, { useState } from 'react';
import { Category, SecondaryTaskColumn } from '../types';
import { 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  FolderHeart, 
  Layers
} from 'lucide-react';

interface CategoriesManagementPageProps {
  categories: Category[];
  onUpdateCategories: (categories: Category[]) => void;
  secondaryTaskColumns?: SecondaryTaskColumn[];
  onUpdateSecondaryColumns?: (cols: SecondaryTaskColumn[]) => void;
  onClose: () => void;
  lang?: 'fa' | 'en';
}

export default function CategoriesManagementPage({
  categories,
  onUpdateCategories,
  secondaryTaskColumns = [],
  onUpdateSecondaryColumns,
  onClose,
  lang = 'fa'
}: CategoriesManagementPageProps) {
  const isRtl = lang === 'fa';
  const [activeSubTab, setActiveSubTab] = useState<'core' | 'secondary'>('core');

  // Add state
  const [newCatFa, setNewCatFa] = useState('');
  const [newCatType, setNewCatType] = useState<'core' | 'secondary'>('core');
  const [newColor, setNewColor] = useState('bg-blue-100 border-blue-300 text-blue-900');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameFa, setEditNameFa] = useState('');
  const [editType, setEditType] = useState<'core' | 'secondary'>('core');
  const [editColor, setEditColor] = useState('');

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

  const labels = {
    title: isRtl ? "مدیریت دسته‌بندی‌ها و برچسب‌های رنگی" : "Manage Categories & Color Labels",
    subtitle: isRtl ? "شخصی‌سازی نام، رنگ، برچسب نوع کار و چیدمان ترتیب نمایش" : "Customize names, colors, tags, and display order",
    backBtn: isRtl ? "بازگشت به تنظیمات اصلی" : "Back to Main Settings",
    tabCore: isRtl ? "دسته‌بندی‌های کارهای اصلی" : "Core Task Categories",
    tabSecondary: isRtl ? "دسته‌بندی‌های کارهای فرعی" : "Secondary Task Categories",
    addTitle: isRtl ? "افزودن دسته‌بندی جدید" : "Add New Category",
    editTitle: isRtl ? "ویرایش دسته‌بندی فعلی" : "Edit Current Category",
    nameLabel: isRtl ? "نام دسته‌بندی:" : "Category Name:",
    namePlaceholder: isRtl ? "مثال: آموزش زبان" : "e.g., Language Learning",
    typeLabel: isRtl ? "نوع کارها در این دسته:" : "Task Type in this Category:",
    typeCore: isRtl ? "کارهای اصلی" : "Core Tasks",
    typeSecondary: isRtl ? "کارهای فرعی (برگه کارهای فکری بدون زمان مشخص)" : "Secondary Tasks (Flexible brain tasks)",
    colorLabel: isRtl ? "انتخاب رنگ پس‌زمینه دسته:" : "Select Background Color:",
    cancelBtn: isRtl ? "انصراف" : "Cancel",
    saveBtn: isRtl ? "ثبت تغییرات" : "Save Changes",
    addBtn: isRtl ? "افزودن دسته جدید به لیست" : "Add New Category to List",
    orderLabel: isRtl ? "لیست اولویت و اولویت‌بندی دسته‌ها (ترتیب نمایش)" : "Categories Display Priority & Order",
    countLabel: isRtl ? "تعداد:" : "Count:",
    systemLabel: isRtl ? "سیستمی / اتمام کار" : "System / Completion",
    tooltipUp: isRtl ? "انتقال به بالا" : "Move Up",
    tooltipDown: isRtl ? "انتقال به پایین" : "Move Down",
    tooltipEdit: isRtl ? "ویرایش جزئیات دسته" : "Edit Details",
    tooltipDelete: isRtl ? "حذف دسته‌بندی" : "Delete Category",
    systemWarning: isRtl ? "دسته‌های سیستمی قابل حذف نیستند" : "System categories cannot be deleted",
    deleteConfirm: isRtl ? "آیا مایل به حذف این دسته‌بندی هستید؟" : "Are you sure you want to delete this category?",
    footerNote: isRtl 
      ? "📌 دو دسته کار انجام شده و کار انجام نشده همواره در انتهای جدول نمایش ترتیب کارها قرار می‌گیرند تا ساختار برنامه‌ریزی کارهای بازده هفتگی به‌صورت منظم و دسته‌بندی‌شده حفظ گردد."
      : "📌 The Completed and Incomplete categories always stay at the bottom of the display order to maintain a neat weekly structure."
  };

  const handleAddCategory = () => {
    if (!newCatFa.trim()) return;

    if (activeSubTab === 'secondary' && onUpdateSecondaryColumns) {
      const newCol: SecondaryTaskColumn = {
        id: 'sc_' + Date.now(),
        titleFa: newCatFa.trim(),
        titleEn: newCatFa.trim(),
        color: `${newColor} hover:opacity-90`
      };
      onUpdateSecondaryColumns([...secondaryTaskColumns, newCol]);
      setNewCatFa('');
      return;
    }

    const newCat: Category = {
      id: 'cat_' + Date.now(),
      nameFa: newCatFa.trim(),
      nameEn: newCatFa.trim(),
      color: `${newColor} hover:opacity-90`,
      type: newCatType
    };

    const listCopy = [...categories];
    const doneIndex = listCopy.findIndex(c => c.id === 'done');
    const notDoneIndex = listCopy.findIndex(c => c.id === 'not_done');

    let insertIndex = listCopy.length;
    if (doneIndex !== -1 && notDoneIndex !== -1) {
      insertIndex = Math.min(doneIndex, notDoneIndex);
    } else if (doneIndex !== -1) {
      insertIndex = doneIndex;
    } else if (notDoneIndex !== -1) {
      insertIndex = notDoneIndex;
    }

    listCopy.splice(insertIndex, 0, newCat);
    onUpdateCategories(listCopy);

    // Reset fields
    setNewCatFa('');
    setNewColor('bg-blue-100 border-blue-300 text-blue-900');
  };

  const handleDeleteCategory = (id: string) => {
    if (activeSubTab === 'secondary' && onUpdateSecondaryColumns) {
      if (window.confirm(labels.deleteConfirm)) {
        onUpdateSecondaryColumns(secondaryTaskColumns.filter(c => c.id !== id));
      }
      return;
    }

    if (id === 'done' || id === 'not_done') {
      alert(isRtl ? 'دسته‌بندی‌های سیستمی قابل حذف نیستند.' : 'System categories cannot be deleted.');
      return;
    }
    if (window.confirm(labels.deleteConfirm)) {
      onUpdateCategories(categories.filter(c => c.id !== id));
    }
  };

  const handleStartEdit = (cat: any) => {
    setEditingId(cat.id);
    if (activeSubTab === 'secondary') {
      setEditNameFa(cat.titleFa || cat.titleEn || '');
      setEditType('secondary');
      setEditColor(cat.color ? cat.color.replace(' hover:opacity-90', '').replace(' hover:opacity-80', '') : 'bg-blue-100 border-blue-300 text-blue-900');
    } else {
      setEditNameFa(cat.nameFa);
      setEditType(cat.type || 'core');
      setEditColor(cat.color.replace(' hover:opacity-90', '').replace(' hover:opacity-80', ''));
    }
  };

  const handleSaveEdit = () => {
    if (!editNameFa.trim()) return;

    if (activeSubTab === 'secondary' && onUpdateSecondaryColumns) {
      const updated = secondaryTaskColumns.map(c => {
        if (c.id === editingId) {
          return {
            ...c,
            titleFa: editNameFa.trim(),
            titleEn: editNameFa.trim(),
            color: `${editColor} hover:opacity-90`
          };
        }
        return c;
      });
      onUpdateSecondaryColumns(updated);
      setEditingId(null);
      return;
    }

    const updated = categories.map(c => {
      if (c.id === editingId) {
        return {
          ...c,
          nameFa: editNameFa.trim(),
          nameEn: editNameFa.trim(),
          type: editType,
          color: `${editColor} hover:opacity-90`
        };
      }
      return c;
    });

    onUpdateCategories(updated);
    setEditingId(null);
  };

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (activeSubTab === 'secondary' && onUpdateSecondaryColumns) {
      if (targetIndex < 0 || targetIndex >= secondaryTaskColumns.length) return;
      const listCopy = [...secondaryTaskColumns];
      const temp = listCopy[index];
      listCopy[index] = listCopy[targetIndex];
      listCopy[targetIndex] = temp;
      onUpdateSecondaryColumns(listCopy);
      return;
    }

    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const listCopy = [...categories];
    const temp = listCopy[index];
    listCopy[index] = listCopy[targetIndex];
    listCopy[targetIndex] = temp;
    onUpdateCategories(listCopy);
  };

  const activeList = activeSubTab === 'secondary' ? secondaryTaskColumns : categories;

  return (
    <div 
      className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-150 text-right" 
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      
      {/* Header Banner */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4 ${isRtl ? 'text-right' : 'text-left'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <FolderHeart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm text-slate-800">{labels.title}</h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{labels.subtitle}</p>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer self-start sm:self-auto"
        >
          {labels.backBtn}
        </button>
      </div>

      {/* Sub-tab selection */}
      {onUpdateSecondaryColumns && (
        <div className={`flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start`}>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('core');
              setEditingId(null);
            }}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'core'
                ? 'bg-white text-slate-800 shadow-3xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {labels.tabCore}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('secondary');
              setEditingId(null);
            }}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'secondary'
                ? 'bg-white text-slate-800 shadow-3xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {labels.tabSecondary}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Create / Edit Category */}
        <div className="lg:col-span-5 space-y-4">
          
          {editingId ? (
            /* Editing form block */
            <div className={`p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 ${isRtl ? 'text-right' : 'text-left'}`}>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <Edit2 className="w-4 h-4 text-indigo-600" />
                  {labels.editTitle}
                </span>
                <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-black block">{labels.nameLabel}</label>
                <input
                  type="text"
                  value={editNameFa}
                  onChange={(e) => setEditNameFa(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder={labels.namePlaceholder}
                />
              </div>

              {activeSubTab === 'core' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-black block">{labels.typeLabel}</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as 'core' | 'secondary')}
                    className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="core">{labels.typeCore}</option>
                    <option value="secondary">{labels.typeSecondary}</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-black block">{labels.colorLabel}</label>
                <div className="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-150 rounded-xl max-h-32 overflow-y-auto">
                  {COLORS.map((col) => (
                    <button
                      key={`edit-${col.value}`}
                      type="button"
                      onClick={() => setEditColor(col.value)}
                      className={`w-5.5 h-5.5 rounded-full border transition-all cursor-pointer ${col.value} ${
                        editColor === col.value ? 'ring-2 ring-offset-2 ring-indigo-600 scale-105 shadow-3xs' : 'opacity-80 hover:opacity-100 hover:scale-105'
                      }`}
                      title={col.label}
                    />
                  ))}
                </div>
                {/* Custom Color Picker input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-500">یا انتخاب رنگ دلخواه (Hex/RGB):</span>
                  <input
                    type="color"
                    value={editColor.startsWith('#') ? editColor : '#3b82f6'}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    placeholder="#3b82f6 یا کد دلخواه"
                    className="text-xs p-1.5 border border-slate-200 rounded-lg w-36 font-mono text-slate-700 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-xs font-bold px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl cursor-pointer"
                >
                  {labels.cancelBtn}
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="text-xs font-black px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{labels.saveBtn}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Create new form block */
            <div className={`p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 ${isRtl ? 'text-right' : 'text-left'}`}>
              <span className="text-xs font-black text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                {labels.addTitle}
              </span>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-black block">{labels.nameLabel}</label>
                <input
                  type="text"
                  value={newCatFa}
                  onChange={(e) => setNewCatFa(e.target.value)}
                  placeholder={labels.namePlaceholder}
                  className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {activeSubTab === 'core' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-black block">{labels.typeLabel}</label>
                  <select
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as 'core' | 'secondary')}
                    className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-white font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="core">{labels.typeCore}</option>
                    <option value="secondary">{labels.typeSecondary}</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-black block">{labels.colorLabel}</label>
                <div className="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-150 rounded-xl max-h-32 overflow-y-auto">
                  {COLORS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setNewColor(col.value)}
                      className={`w-5.5 h-5.5 rounded-full border transition-all cursor-pointer ${col.value} ${
                        newColor === col.value ? 'ring-2 ring-offset-2 ring-emerald-600 scale-105 shadow-3xs' : 'opacity-80 hover:opacity-100 hover:scale-105'
                      }`}
                      title={col.label}
                    />
                  ))}
                </div>
                {/* Custom Color Picker input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-500">یا انتخاب رنگ دلخواه (Hex/RGB):</span>
                  <input
                    type="color"
                    value={newColor.startsWith('#') ? newColor : '#3b82f6'}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    placeholder="#3b82f6 یا کد دلخواه"
                    className="text-xs p-1.5 border border-slate-200 rounded-lg w-36 font-mono text-slate-700 bg-white"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCategory}
                disabled={!newCatFa.trim()}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs"
              >
                <Plus className="w-4 h-4" />
                <span>{labels.addBtn}</span>
              </button>
            </div>
          )}

        </div>

        {/* Right Side: Ordered Categories list with Reordering and management */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black text-slate-400">{labels.orderLabel}</span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-lg px-2 py-0.5">{labels.countLabel} {activeList.length}</span>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {activeList.map((cat: any, idx) => {
              const isSystem = cat.id === 'done' || cat.id === 'not_done';
              const nameDisplay = activeSubTab === 'secondary' ? (cat.titleFa || cat.titleEn) : cat.nameFa;
              const catTypeLabel = activeSubTab === 'secondary'
                ? labels.tabSecondary
                : cat.type === 'secondary' 
                  ? labels.typeSecondary
                  : cat.type === 'core' 
                    ? labels.typeCore 
                    : isSystem 
                      ? labels.systemLabel 
                      : labels.typeCore;

              const displayColor = cat.color || 'bg-blue-100 border-blue-300 text-blue-900';

              return (
                <div 
                  key={cat.id} 
                  className={`flex items-center justify-between p-3 rounded-2xl border bg-white transition-all ${
                    editingId === cat.id ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  
                  {/* Category info layout with color preview */}
                  <div className={`flex items-center gap-3 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
                    <span className={`w-3.5 h-3.5 rounded-full border border-black/10 shrink-0 ${displayColor.split(' ')[0]}`} />
                    <div className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                      <span className="font-bold text-xs text-slate-800">{nameDisplay}</span>
                      <span className="text-[9px] font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-slate-300" />
                        {catTypeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Reordering and editing */}
                  <div className={`flex items-center gap-1.5 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
                    
                    {/* Up / Down Reordering Buttons */}
                    <div className={`flex items-center gap-1 border-l border-slate-100 pl-2 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
                      <button
                        type="button"
                        onClick={() => handleMoveCategory(idx, 'up')}
                        disabled={idx === 0}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all disabled:opacity-25 disabled:hover:bg-transparent cursor-pointer"
                        title={labels.tooltipUp}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveCategory(idx, 'down')}
                        disabled={idx === activeList.length - 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all disabled:opacity-25 disabled:hover:bg-transparent cursor-pointer"
                        title={labels.tooltipDown}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Edit & Delete Action Buttons */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(cat)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-150 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-all cursor-pointer"
                      title={labels.tooltipEdit}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      disabled={isSystem}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-150 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all disabled:opacity-25 cursor-pointer"
                      title={isSystem ? labels.systemWarning : labels.tooltipDelete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                  </div>

                </div>
              );
            })}
          </div>

          <div className={`text-[10px] text-slate-400 leading-relaxed font-bold bg-slate-50 p-3 rounded-2xl border border-slate-150 ${isRtl ? 'text-right' : 'text-left'}`}>
            {labels.footerNote}
          </div>

        </div>

      </div>

    </div>
  );
}
