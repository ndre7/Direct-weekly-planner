import { useEffect, useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp, Save, Calendar, Clock } from 'lucide-react';
import { Goal, GoalPhase, GoalWeek, GoalPhaseTask, Category } from '../types';
import { DateTimeSelect } from './DateTimeSelect';
import { parseAndFormatJalaliDeadline } from '../utils/jalali';

// T161-F: full-field goal editor (manual + AI goals) — merge-save via onSave
interface GoalEditorModalProps {
  goal: Goal | null;
  open: boolean;
  categories: Category[];
  lang?: 'fa' | 'en';
  onClose: () => void;
  onSave: (edited: Goal) => void;
}

const COLOR_CHOICES = [
  { name: 'نیلی', value: 'bg-indigo-100 border-indigo-300 text-indigo-900' },
  { name: 'زمردی', value: 'bg-emerald-100 border-emerald-300 text-emerald-900' },
  { name: 'آبی', value: 'bg-sky-100 border-sky-300 text-sky-900' },
  { name: 'بنفش', value: 'bg-purple-100 border-purple-300 text-purple-900' },
  { name: 'کهربایی', value: 'bg-amber-100 border-amber-300 text-amber-900' },
  { name: 'رز', value: 'bg-rose-100 border-rose-300 text-rose-900' },
];

const emptyTask = (pid: string, wid: string, idx: number): GoalPhaseTask => ({
  id: `gedit_${pid}_${wid}_${idx}_${Date.now()}`,
  title: '',
  completed: false,
  type: 'core',
  description: '',
  link: '',
  linkTitle: '',
  deadline: ''
});

const emptyWeek = (num: number): GoalWeek => ({
  week_number: num,
  week_title: `هفته ${num}`,
  tasks: []
});

const emptyPhase = (num: number): GoalPhase => ({
  phase_number: num,
  title: `فاز ${num}`,
  description: '',
  estimated_weeks: `هفته ${num}`,
  weeks: [emptyWeek(num)],
  tasks: []
});

export default function GoalEditorModal({ goal, open, categories, lang = 'fa', onClose, onSave }: GoalEditorModalProps) {
  const isRtl = lang === 'fa';
  const [draft, setDraft] = useState<Goal | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  useEffect(() => {
    if (open && goal) {
      setDraft(JSON.parse(JSON.stringify(goal)));
      setExpandedPhase(null);
    }
  }, [open, goal]);

  if (!open || !draft) return null;

  const t = (fa: string, en: string) => (isRtl ? fa : en);
  const update = (patch: Partial<Goal>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);

  const updatePhase = (pNum: number, patch: Partial<GoalPhase>) =>
    setDraft(prev => prev ? ({
      ...prev,
      phases: (Array.isArray(prev.phases) ? prev.phases : []).map(p => p.phase_number === pNum ? { ...p, ...patch } : p)
    }) : prev);

  const updateWeek = (pNum: number, wNum: number, patch: Partial<GoalWeek>) =>
    setDraft(prev => prev ? ({
      ...prev,
      phases: (Array.isArray(prev.phases) ? prev.phases : []).map(p => p.phase_number !== pNum ? p : ({
        ...p,
        weeks: (Array.isArray(p.weeks) ? p.weeks : []).map(w => w.week_number === wNum ? { ...w, ...patch } : w)
      }))
    }) : prev);

  const updateTask = (pNum: number, wNum: number | null, taskId: string, patch: Partial<GoalPhaseTask>) =>
    setDraft(prev => prev ? ({
      ...prev,
      phases: (Array.isArray(prev.phases) ? prev.phases : []).map(p => {
        if (p.phase_number !== pNum) return p;
        if (wNum === null) {
          return { ...p, tasks: (Array.isArray(p.tasks) ? p.tasks : []).map(tk => tk.id === taskId ? { ...tk, ...patch } : tk) };
        }
        return {
          ...p,
          weeks: (Array.isArray(p.weeks) ? p.weeks : []).map(w => w.week_number !== wNum ? w : ({
            ...w,
            tasks: (Array.isArray(w.tasks) ? w.tasks : []).map(tk => tk.id === taskId ? { ...tk, ...patch } : tk)
          }))
        };
      })
    }) : prev);

  const addPhase = () => {
    const nextNum = (Array.isArray(draft.phases) ? draft.phases : []).length + 1;
    setDraft(prev => prev ? ({ ...prev, phases: [...(Array.isArray(prev.phases) ? prev.phases : []), emptyPhase(nextNum)] }) : prev);
    setExpandedPhase(nextNum);
  };

  const addWeek = (p: GoalPhase) => {
    const wNum = ((Array.isArray(p.weeks) ? p.weeks : []).reduce((m, w) => Math.max(m, w.week_number), 0)) + 1;
    updatePhase(p.phase_number, { weeks: [...(Array.isArray(p.weeks) ? p.weeks : []), emptyWeek(wNum)] });
  };

  const addTask = (p: GoalPhase, w: GoalWeek | null) => {
    const wk = w ? w.week_number : null;
    const taskCount = wk !== null
      ? (Array.isArray(w?.tasks) ? w!.tasks.length : 0)
      : (Array.isArray(p.tasks) ? p.tasks.length : 0);
    const fresh = emptyTask(`${p.phase_number}`, `${wk ?? 'flat'}`, taskCount + 1);
    if (wk === null) {
      updatePhase(p.phase_number, { tasks: [...(Array.isArray(p.tasks) ? p.tasks : []), fresh] });
    } else {
      updateWeek(p.phase_number, wk, { tasks: [...(Array.isArray(w?.tasks) ? w!.tasks : []), fresh] });
    }
  };

  const handleSave = () => {
    if (!draft.title.trim()) return;
    onSave(draft);
    onClose();
  };

  const taskCard = (p: GoalPhase, tk: GoalPhaseTask, wNum: number | null, remove: () => void) => (
    <div key={tk.id} className="rounded-lg bg-slate-50 p-2 space-y-1">
      <div className="flex items-center gap-2">
        <input value={tk.title} placeholder={t('عنوان کار', 'Task title')}
          onChange={e => updateTask(p.phase_number, wNum, tk.id, { title: e.target.value })}
          className="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-sm" />
        <button onClick={remove} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100"><Trash2 size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={tk.link || ''} placeholder={t('لینک (اختیاری)', 'Link (optional)')}
          onChange={e => updateTask(p.phase_number, wNum, tk.id, { link: e.target.value })}
          className="px-2 py-1 rounded-lg border border-slate-200 text-xs" dir="ltr" />
        <input value={tk.linkTitle || ''} placeholder={t('عنوان لینک (اختیاری)', 'Link title (optional)')}
          onChange={e => updateTask(p.phase_number, wNum, tk.id, { linkTitle: e.target.value })}
          className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
        <select value={tk.type || 'core'}
          onChange={e => updateTask(p.phase_number, wNum, tk.id, { type: e.target.value as 'core' | 'secondary' | 'habit' })}
          className="px-2 py-1 rounded-lg border border-slate-200 text-xs">
          <option value="core">{t('اصلی', 'Core')}</option>
          <option value="secondary">{t('فرعی', 'Secondary')}</option>
          <option value="habit">{t('عادت', 'Habit')}</option>
        </select>
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <label className="text-[10px] font-bold text-slate-500">{t('ددلاین (تاریخ شمسی)', 'Deadline (Jalali)')}</label>
            {(() => {
              const dInfo = parseAndFormatJalaliDeadline(tk.deadline);
              if (dInfo) {
                return (
                  <span className="text-[9px] text-amber-800 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1" title={dInfo.shortDate}>
                    <Calendar size={10} className="text-amber-600 shrink-0" />
                    <span>{dInfo.fullDate}</span>
                  </span>
                );
              }
              if (tk.deadline_note) {
                return (
                  <span className="text-[9px] text-slate-500 font-bold bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Clock size={10} className="text-slate-400 shrink-0" />
                    <span>{tk.deadline_note}</span>
                  </span>
                );
              }
              return null;
            })()}
          </div>
          <DateTimeSelect
            value={tk.deadline || ''}
            onChange={val => updateTask(p.phase_number, wNum, tk.id, { deadline: val })}
            showTime={false}
          />
        </div>
      </div>
      <textarea value={tk.description || ''} placeholder={t('توضیح', 'Description')}
        onChange={e => updateTask(p.phase_number, wNum, tk.id, { description: e.target.value })}
        className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs" rows={2} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 p-4 flex items-center justify-between gap-2">
          <h3 className="font-black text-slate-800">{t('ویرایش هدف', 'Edit Goal')}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600">{t('عنوان هدف', 'Goal title')}</label>
            <input value={draft.title} onChange={e => update({ title: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600">{t('تعداد کل هفته‌ها', 'Total weeks')}</label>
              <input type="number" min={1} value={draft.total_weeks}
                onChange={e => update({ total_weeks: Math.max(1, Number(e.target.value) || 1) })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">{t('رنگ دسته', 'Category color')}</label>
              <select value={draft.categoryColor || COLOR_CHOICES[0].value}
                onChange={e => update({ categoryColor: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm">
                {COLOR_CHOICES.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Calendar size={14} className="text-indigo-600" />
                <span>{t('ددلاین هدف (انتخاب تاریخ شمسی)', 'Goal Deadline (Jalali Date)')}</span>
              </label>
              {(() => {
                const dInfo = parseAndFormatJalaliDeadline(draft.deadline);
                return dInfo ? (
                  <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <Calendar size={12} className="text-indigo-600 shrink-0" />
                    <span>{dInfo.fullDate}</span>
                  </span>
                ) : null;
              })()}
            </div>
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
              <DateTimeSelect
                value={draft.deadline || ''}
                onChange={val => update({ deadline: val })}
                showTime={false}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600">{t('دسته', 'Category')}</label>
            <select value={draft.categoryId || ''}
              onChange={e => update({ categoryId: e.target.value || undefined })}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="">{t('بدون دسته', 'No category')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nameFa}</option>)}
            </select>
          </div>

          {(Array.isArray(draft.phases) ? draft.phases : []).map(p => (
            <div key={p.phase_number} className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 bg-slate-50">
                <input value={p.title} onChange={e => updatePhase(p.phase_number, { title: e.target.value })}
                  className="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-sm font-bold" />
                <input value={p.estimated_weeks} onChange={e => updatePhase(p.phase_number, { estimated_weeks: e.target.value })}
                  className="w-28 px-2 py-1 rounded-lg border border-slate-200 text-xs" />
                <button onClick={() => setExpandedPhase(expandedPhase === p.phase_number ? null : p.phase_number)}
                  className="p-2 rounded-lg hover:bg-slate-200">
                  {expandedPhase === p.phase_number ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {expandedPhase === p.phase_number && (
                <div className="p-3 space-y-3">
                  {(Array.isArray(p.weeks) ? p.weeks : []).map(w => (
                    <div key={w.week_number} className="rounded-xl border border-slate-200 p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-500 w-8">#{w.week_number}</span>
                        <input value={w.week_title} onChange={e => updateWeek(p.phase_number, w.week_number, { week_title: e.target.value })}
                          className="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-sm" />
                        <button onClick={() => updatePhase(p.phase_number, { weeks: (Array.isArray(p.weeks) ? p.weeks : []).filter(x => x.week_number !== w.week_number) })}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
                      </div>
                      {(Array.isArray(w.tasks) ? w.tasks : []).map(tk => taskCard(p, tk, w.week_number,
                        () => updateWeek(p.phase_number, w.week_number, { tasks: (Array.isArray(w.tasks) ? w.tasks : []).filter(x => x.id !== tk.id) })))}
                      <button onClick={() => addTask(p, w)}
                        className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                        <Plus size={12} /> {t('افزودن کار', 'Add task')}
                      </button>
                    </div>
                  ))}
                  {(!Array.isArray(p.weeks) || p.weeks.length === 0) && (
                    <div className="space-y-2">
                      {(Array.isArray(p.tasks) ? p.tasks : []).map(tk => taskCard(p, tk, null,
                        () => updatePhase(p.phase_number, { tasks: (Array.isArray(p.tasks) ? p.tasks : []).filter(x => x.id !== tk.id) })))}
                      <button onClick={() => addTask(p, null)}
                        className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                        <Plus size={12} /> {t('افزودن کار', 'Add task')}
                      </button>
                    </div>
                  )}
                  <button onClick={() => addWeek(p)} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                    <Plus size={12} /> {t('افزودن هفته', 'Add week')}
                  </button>
                </div>
              )}
            </div>
          ))}

          <button onClick={addPhase} className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1">
            <Plus size={14} /> {t('افزودن فاز', 'Add phase')}
          </button>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">{t('انصراف', 'Cancel')}</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-xl text-sm font-black bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
            <Save size={14} /> {t('ذخیره (ادغام کامل)', 'Save (merge)')}
          </button>
        </div>
      </div>
    </div>
  );
}
