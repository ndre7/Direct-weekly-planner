import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Trash2, 
  Plus, 
  ExternalLink, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Sparkles, 
  Copy, 
  Check, 
  Power,
  Download,
  Upload
} from 'lucide-react';
import { 
  CustomApiKey, 
  getKeys, 
  addKey, 
  updateKey, 
  removeKey, 
  toggleEnabled, 
  resetUsage, 
  resetAllUsage, 
  testKey, 
  checkAllKeys, 
  maskKey,
  listProviderModels 
} from '../services/apiKeyService';
import { PROVIDERS, ProviderId, ProviderDefinition, detectProvider, ALLOWED_BASE_URL_HOSTS } from '../shared/providers';

interface ApiKeySettingsProps {
  lang?: 'fa' | 'en';
  showToast?: (msg: string, type?: 'success' | 'error') => void;
  onClose?: () => void;
}

export default function ApiKeySettings({ lang = 'fa', showToast, onClose }: ApiKeySettingsProps) {
  const isRtl = lang === 'fa';
  const [keys, setKeys] = useState<CustomApiKey[]>(() => getKeys());
  const [isAdding, setIsAdding] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);

  // Form State
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('gemini');
  const [keyInput, setKeyInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [modelMode, setModelMode] = useState<'cascade' | 'exact'>('cascade');
  const [modelInput, setModelInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [customProviderName, setCustomProviderName] = useState('');
  const [showKeySecret, setShowKeySecret] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Live models state
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [isLoadingLiveModels, setIsLoadingLiveModels] = useState(false);
  const [liveModelsError, setLiveModelsError] = useState<string | null>(null);

  // Bulk actions state
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [unmaskedKeys, setUnmaskedKeys] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state with custom events
  useEffect(() => {
    const handleUpdate = () => {
      setKeys(getKeys());
    };
    window.addEventListener('planner-custom-api-keys-updated', handleUpdate);
    window.addEventListener('planner-custom-api-keys-storage-error', () => {
      if (showToast) {
        showToast(isRtl ? 'حافظه مرورگر پر شده است.' : 'Local storage quota exceeded.', 'error');
      }
    });
    return () => {
      window.removeEventListener('planner-custom-api-keys-updated', handleUpdate);
    };
  }, [isRtl, showToast]);

  const activeProviderDef: ProviderDefinition = useMemo(() => {
    return PROVIDERS.find(p => p.id === selectedProvider) || PROVIDERS[0];
  }, [selectedProvider]);

  // Auto-detect provider when user types/pastes a key
  const handleKeyInputChange = (val: string) => {
    setKeyInput(val);
    setFormError(null);
    setLiveModelsError(null);
    const trimmed = val.trim();
    if (trimmed.length >= 4 && !editingKeyId) {
      const detected = detectProvider(trimmed);
      if (detected !== 'custom' && detected !== selectedProvider) {
        setSelectedProvider(detected as ProviderId);
      }
    }
  };

  const handleStartAdd = () => {
    setEditingKeyId(null);
    setSelectedProvider('gemini');
    setKeyInput('');
    setNameInput('');
    setModelMode('cascade');
    setModelInput('');
    setBaseUrlInput('');
    setCustomProviderName('');
    setShowKeySecret(false);
    setFormError(null);
    setLiveModels([]);
    setLiveModelsError(null);
    setIsAdding(true);
  };

  const handleStartEdit = (item: CustomApiKey) => {
    setEditingKeyId(item.id);
    setSelectedProvider((item.provider as ProviderId) || 'gemini');
    setKeyInput(item.key);
    setNameInput(item.name || '');
    setModelMode(item.modelMode || (item.model ? 'exact' : 'cascade'));
    setModelInput(item.model || '');
    setBaseUrlInput(item.baseUrl || '');
    setCustomProviderName(item.providerName || '');
    setShowKeySecret(false);
    setFormError(null);
    setLiveModels([]);
    setLiveModelsError(null);
    setIsAdding(true);
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingKeyId(null);
    setFormError(null);
    setLiveModels([]);
    setLiveModelsError(null);
  };

  const handleFetchLiveModels = async () => {
    const trimmedKey = keyInput.trim();
    if (!trimmedKey || trimmedKey.length < 5) {
      setLiveModelsError(isRtl ? 'ابتدا مقدار کلید API را وارد کنید.' : 'Please enter an API key first.');
      return;
    }
    setIsLoadingLiveModels(true);
    setLiveModelsError(null);
    try {
      const res = await listProviderModels(
        selectedProvider,
        trimmedKey,
        baseUrlInput.trim() || undefined
      );
      if (res.success && res.models && res.models.length > 0) {
        setLiveModels(res.models);
        if (!modelInput) {
          setModelInput(res.models[0]);
        }
        if (showToast) {
          showToast(isRtl ? `${res.models.length} مدل فعال دریافت شد.` : `Retrieved ${res.models.length} models.`, 'success');
        }
      } else {
        setLiveModelsError(res.error || (isRtl ? 'مدلی از این ارائه‌دهنده دریافت نشد.' : 'Failed to retrieve models.'));
      }
    } catch (e: any) {
      setLiveModelsError(e?.message || (isRtl ? 'خطای شبکه در دریافت مدل‌ها' : 'Network error'));
    } finally {
      setIsLoadingLiveModels(false);
    }
  };

  const handleSaveForm = async (validateBeforeSave: boolean = false) => {
    setFormError(null);
    const trimmedKey = keyInput.trim();
    if (!trimmedKey) {
      setFormError(isRtl ? 'لطفاً کلید API را وارد کنید.' : 'Please enter an API key.');
      return;
    }
    if (trimmedKey.length < 5) {
      setFormError(isRtl ? 'طول کلید باید حداقل ۵ کاراکتر باشد.' : 'API key must be at least 5 characters.');
      return;
    }

    if (modelMode === 'exact' && !modelInput.trim()) {
      setFormError(isRtl ? 'لطفاً نام دقیق مدل را وارد کنید یا حالت آبشاری را انتخاب نمایید.' : 'Please enter an exact model name or select waterfall mode.');
      return;
    }

    if (baseUrlInput.trim()) {
      try {
        const u = new URL(baseUrlInput.trim());
        if (u.protocol !== 'https:') {
          setFormError(isRtl ? 'آدرس Base URL باید با https:// شروع شود.' : 'Base URL must start with https://');
          return;
        }
        if (!ALLOWED_BASE_URL_HOSTS.includes(u.hostname)) {
          setFormError(isRtl ? `هاست ${u.hostname} در لیست مجاز نیست.` : `Host ${u.hostname} is not in allowed hosts.`);
          return;
        }
      } catch {
        setFormError(isRtl ? 'آدرس Base URL نامعتبر است.' : 'Invalid Base URL format.');
        return;
      }
    }

    setIsSubmitting(true);

    if (editingKeyId) {
      const ok = updateKey(editingKeyId, {
        key: trimmedKey,
        name: nameInput.trim() || undefined,
        provider: selectedProvider,
        providerName: selectedProvider === 'custom' ? customProviderName.trim() : undefined,
        modelMode,
        model: modelMode === 'exact' ? (modelInput.trim() || undefined) : undefined,
        baseUrl: baseUrlInput.trim() || undefined
      });

      if (!ok) {
        setFormError(isRtl ? 'خطا در ویرایش کلید.' : 'Failed to update key.');
        setIsSubmitting(false);
        return;
      }

      if (validateBeforeSave) {
        await testKey(editingKeyId);
      }

      setIsSubmitting(false);
      setIsAdding(false);
      setEditingKeyId(null);
      if (showToast) {
        showToast(isRtl ? 'کلید با موفقیت به‌روزرسانی شد.' : 'Key updated successfully.', 'success');
      }
    } else {
      const res = addKey({
        key: trimmedKey,
        name: nameInput.trim() || undefined,
        provider: selectedProvider,
        providerName: selectedProvider === 'custom' ? customProviderName.trim() : undefined,
        modelMode,
        model: modelMode === 'exact' ? (modelInput.trim() || undefined) : undefined,
        baseUrl: baseUrlInput.trim() || undefined
      });

      if (!res.success || !res.key) {
        setFormError(res.error || (isRtl ? 'خطا در ثبت کلید.' : 'Failed to add key.'));
        setIsSubmitting(false);
        return;
      }

      if (validateBeforeSave) {
        await testKey(res.key.id);
      }

      setIsSubmitting(false);
      setIsAdding(false);
      if (showToast) {
        showToast(isRtl ? 'کلید با موفقیت افزوده شد.' : 'Key added successfully.', 'success');
      }
    }
  };

  const handleTestKey = async (id: string) => {
    setTestingKeyId(id);
    const result = await testKey(id);
    setTestingKeyId(null);
    if (showToast) {
      if (result.valid) {
        showToast(
          isRtl 
            ? `کلید معتبر است و ارتباط با سرور برقرار شد${result.workingModel ? ` (مدل: ${result.workingModel})` : ''}.` 
            : `Key is valid and verified${result.workingModel ? ` (model: ${result.workingModel})` : ''}.`, 
          'success'
        );
      } else {
        const errorMsg = result.error || (isRtl ? 'اعتبارسنجی ناموفق بود. پیام خطا را بررسی کنید.' : 'Validation failed. Check error details.');
        showToast(errorMsg, 'error');
      }
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    await checkAllKeys();
    setIsCheckingAll(false);
    if (showToast) {
      showToast(isRtl ? 'بررسی تمام کلیدهای فعال به پایان رسید.' : 'Finished checking all active keys.', 'success');
    }
  };

  const handleResetUsage = (id: string) => {
    resetUsage(id);
    if (showToast) {
      showToast(isRtl ? 'شمارنده مصرف این کلید صفر شد.' : 'Token usage reset for this key.', 'success');
    }
  };

  const handleResetAllUsage = () => {
    resetAllUsage();
    if (showToast) {
      showToast(isRtl ? 'شمارنده مصرف همه کلیدها صفر شد.' : 'All token usages reset.', 'success');
    }
  };

  const handleDelete = (id: string, name: string) => {
    removeKey(id);
    if (showToast) {
      showToast(isRtl ? 'کلید با موفقیت حذف شد.' : 'Key removed.', 'success');
    }
  };

  const handleToggle = (id: string) => {
    toggleEnabled(id);
  };

  const handleCopyKey = (id: string, keyValue: string) => {
    navigator.clipboard.writeText(keyValue);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const toggleMask = (id: string) => {
    setUnmaskedKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Export / Backup to planner-api-keys-backup.json
  const handleExportBackup = () => {
    const currentKeys = getKeys();
    const dataStr = JSON.stringify(currentKeys, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planner-api-keys-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (showToast) {
      showToast(isRtl ? 'پشتیبان کلیدها با نام planner-api-keys-backup.json ذخیره شد.' : 'Saved planner-api-keys-backup.json.', 'success');
    }
  };

  // Import from planner-api-keys-backup.json
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error('فرمت فایل پشتیبان باید آرایه‌ای از کلیدها باشد.');
        }

        let importedCount = 0;
        parsed.forEach((item: any) => {
          if (item && typeof item.key === 'string' && item.key.trim().length >= 5) {
            const res = addKey(item);
            if (res.success) importedCount++;
          }
        });

        if (showToast) {
          showToast(
            isRtl 
              ? `${importedCount} کلید از فایل پشتیبان با موفقیت بازیابی شد.` 
              : `Imported ${importedCount} keys from backup.`,
            'success'
          );
        }
      } catch (err: any) {
        if (showToast) {
          showToast(isRtl ? `خطا در بازخوانی فایل پشتیبان: ${err.message || err}` : 'Error importing backup file.', 'error');
        }
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Aggregated Stats (Three stat cards)
  const totalKeys = keys.length;
  const activeKeys = keys.filter(k => k.enabled).length;
  const totalTokens = keys.reduce((sum, k) => sum + (k.tokenUsage || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                  {isRtl ? 'کلیدهای هوش مصنوعی شخصی (BYOK)' : 'Personal AI API Keys (BYOK)'}
                </h3>
                <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                  12 Providers
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {isRtl 
                  ? 'استفاده مستقیم از سهمیه شخصی جمینای، اوپن‌ای‌آی، گروک، دیپ‌سیک، آنتروپیک و... با سوئیچ خودکار'
                  : 'Bring Your Own Key for Gemini, OpenAI, Groq, DeepSeek, Anthropic with automatic fallback'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
            {/* Backup Export/Import Buttons */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportBackup} 
              accept=".json" 
              className="hidden" 
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title={isRtl ? 'ورودی از فایل planner-api-keys-backup.json' : 'Import planner-api-keys-backup.json'}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isRtl ? 'ورودی فایل' : 'Import'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportBackup}
              disabled={totalKeys === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-50"
              title={isRtl ? 'خروجی فایل planner-api-keys-backup.json' : 'Export planner-api-keys-backup.json'}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isRtl ? 'خروجی فایل' : 'Export'}</span>
            </button>

            <button
              type="button"
              onClick={handleStartAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isRtl ? 'افزودن کلید' : 'Add Key'}</span>
            </button>
          </div>
        </div>

        {/* Three Stat Cards & Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-indigo-100/70 dark:border-indigo-900/40">
          {/* Stat Card 1: Total & Active Keys */}
          <div className="p-2.5 bg-white/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold block">{isRtl ? 'کلیدهای فعال / کل' : 'Active / Total Keys'}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">{activeKeys}</span>
              <span className="text-[10px] text-slate-400 font-bold">/ {totalKeys} {isRtl ? 'کلید' : 'keys'}</span>
            </div>
          </div>

          {/* Stat Card 2: Total Tokens */}
          <div className="p-2.5 bg-white/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold block">{isRtl ? 'مجموع توکن مصرفی' : 'Total Tokens'}</span>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono block mt-0.5">
              {totalTokens.toLocaleString('fa-IR')}
            </span>
          </div>

          {/* Stat Card 3: Test All Connection Button */}
          <div className="p-2.5 bg-white/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">{isRtl ? 'بررسی اتصال' : 'Connection Test'}</span>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {isCheckingAll ? (isRtl ? 'درحال بررسی...' : 'Checking...') : (isRtl ? 'همه کلیدها' : 'All Keys')}
              </span>
            </div>
            <button
              type="button"
              disabled={isCheckingAll || activeKeys === 0}
              onClick={handleCheckAll}
              className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
              title={isRtl ? 'بررسی اتصال همه کلیدها' : 'Test connection of all keys'}
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingAll ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Stat Card 4: Reset usage */}
          <div className="p-2.5 bg-white/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">{isRtl ? 'شمارنده‌ها' : 'Counters'}</span>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'صفر کردن مصرف' : 'Reset Usage'}</span>
            </div>
            <button
              type="button"
              disabled={totalTokens === 0}
              onClick={handleResetAllUsage}
              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
              title={isRtl ? 'صفر کردن شمارنده همه کلیدها' : 'Reset all token usages'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Free Key Links Banner (Groq, Gemini, OpenAI) */}
      <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300">
          <ExternalLink className="w-4 h-4" />
          <span>{isRtl ? 'لینک‌های دریافت کلید رایگان ارائه‌دهندگان معتبر:' : 'Get free API keys directly:'}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <a
            href="https://aistudio.google.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-700 hover:text-blue-900 dark:text-blue-400 font-bold underline"
          >
            <span>Google Gemini (AI Studio)</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-slate-300">•</span>
          <a
            href="https://console.groq.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-700 hover:text-blue-900 dark:text-blue-400 font-bold underline"
          >
            <span>Groq Cloud Console</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-slate-300">•</span>
          <a
            href="https://platform.openai.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-700 hover:text-blue-900 dark:text-blue-400 font-bold underline"
          >
            <span>OpenAI Platform</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Security Note Banner */}
      <div className="flex items-start gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900 rounded-2xl text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {isRtl 
            ? 'امنیت کامل: کلیدهای شما صرفاً در مرورگر همین دستگاه (localStorage) نگهداری می‌شوند و هرگز در فایربیس ذخیره یا در لاگ‌ها ثبت نمی‌شوند. در هر درخواست، کلیدهای فعال شما پیش از کلیدهای عمومی سرور قرار می‌گیرند.' 
            : 'Private & Secure: Your keys remain strictly on this browser device (localStorage) and are never stored in Firebase or server logs.'}
        </p>
      </div>

      {/* Add / Edit Form Modal / Card */}
      {isAdding && (
        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-indigo-500 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h4 className="font-black text-sm text-slate-800 dark:text-slate-100">
                {editingKeyId 
                  ? (isRtl ? 'ویرایش کلید API' : 'Edit API Key') 
                  : (isRtl ? 'افزودن کلید API جدید' : 'Add New API Key')}
              </h4>
            </div>
            <button
              type="button"
              onClick={handleCancelForm}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              {isRtl ? 'انصراف' : 'Cancel'}
            </button>
          </div>

          {/* Provider Selector Grid */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              {isRtl ? 'ارائه‌دهنده سرویس (Provider):' : 'Provider:'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {PROVIDERS.map(p => {
                const isSelected = p.id === selectedProvider;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(p.id);
                      if (p.candidateModels.length > 0 && !modelInput) {
                        setModelInput(p.candidateModels[0]);
                      }
                    }}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-600 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 font-black shadow-xs ring-1 ring-indigo-500' 
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 font-bold'
                    }`}
                  >
                    <span className="block text-xs truncate">{isRtl ? p.nameFa : p.nameEn}</span>
                    <span className="block text-[9px] text-slate-400 font-mono truncate">{p.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free Key Link if available */}
          {activeProviderDef.freeKeyUrl && (
            <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs">
              <span className="text-blue-800 dark:text-blue-300 font-medium">
                {isRtl ? `دریافت رایگان کلید ${activeProviderDef.nameFa}:` : `Get a free key for ${activeProviderDef.nameEn}:`}
              </span>
              <a
                href={activeProviderDef.freeKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 font-bold underline"
              >
                <span>{activeProviderDef.freeKeyUrl.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Key Value Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {isRtl ? 'مقدار کلید API:' : 'API Key Value:'}
              </label>
              {activeProviderDef.prefixHints.length > 0 && (
                <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                  پیشوند: {activeProviderDef.prefixHints.join(' / ')}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showKeySecret ? 'text' : 'password'}
                value={keyInput}
                onChange={e => handleKeyInputChange(e.target.value)}
                placeholder={activeProviderDef.placeholder || 'کلید API را اینجا وارد یا Paste کنید...'}
                dir="ltr"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-xl p-2.5 pr-10 text-xs font-mono text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowKeySecret(prev => !prev)}
                className="absolute inset-y-0 right-2 flex items-center px-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showKeySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Optional Fields Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Friendly Name */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                {isRtl ? 'نام دلخواه کلید (اختیاری):' : 'Key Label (optional):'}
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder={isRtl ? `پیش‌فرض: ${activeProviderDef.nameFa} ${String(Date.now()).slice(-4)}` : 'e.g. My Personal Key'}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-800 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-900/50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Model Selection & Mode Section */}
          <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {isRtl ? 'نحوه انتخاب و اجرای مدل هوش مصنوعی:' : 'AI Model Selection Mode:'}
              </label>
              {activeProviderDef.modelsPageUrl && (
                <a
                  href={activeProviderDef.modelsPageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-bold underline"
                >
                  <span>{isRtl ? 'مستندات رسمی مدل‌ها' : 'Official Models Docs'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Mode Switch: Cascade vs Exact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModelMode('cascade')}
                className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                  modelMode === 'cascade'
                    ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-600 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-2xs ring-1 ring-indigo-500'
                    : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black">{isRtl ? 'حالت آبشاری (پیشنهادی)' : 'Waterfall Fallback (Recommended)'}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${modelMode === 'cascade' ? 'bg-indigo-600' : 'border border-slate-300'}`} />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {isRtl 
                    ? 'سوئیچ خودکار بین مدل‌های کاندید در صورت اتمام سهمیه یا بازنشستگی مدل'
                    : 'Auto-fallback across candidate models if quota exhausted or model retired'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setModelMode('exact')}
                className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                  modelMode === 'exact'
                    ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-600 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-2xs ring-1 ring-indigo-500'
                    : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black">{isRtl ? 'مدل دقیق / سفارشی' : 'Exact / Custom Model'}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${modelMode === 'exact' ? 'bg-indigo-600' : 'border border-slate-300'}`} />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {isRtl 
                    ? 'ارسال مستقیم و اختصاصی به یک مدل مشخص با نام دقیق'
                    : 'Send requests strictly to a specified exact model name'}
                </p>
              </button>
            </div>

            {/* Cascade Mode View */}
            {modelMode === 'cascade' && (
              <div className="p-2.5 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold block">
                  {isRtl ? 'زنجیره مدل‌های کاندید این ارائه‌دهنده:' : 'Candidate models waterfall for this provider:'}
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {(activeProviderDef.candidateModels.length > 0 ? activeProviderDef.candidateModels : ['gpt-4o-mini']).map((m, idx) => (
                    <span 
                      key={m} 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-medium"
                    >
                      <span className="text-[9px] font-bold text-slate-400">{idx + 1}.</span>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Exact Mode View */}
            {modelMode === 'exact' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {isRtl ? 'نام دقیق مدل:' : 'Exact Model Name:'}
                  </label>

                  {/* Button to fetch live models */}
                  <button
                    type="button"
                    onClick={handleFetchLiveModels}
                    disabled={isLoadingLiveModels || !keyInput.trim()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-[10px] font-black transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingLiveModels ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                    )}
                    <span>{isLoadingLiveModels ? (isRtl ? 'دریافت لیست...' : 'Fetching...') : (isRtl ? 'دریافت مدل‌های فعال' : 'Fetch Active Models')}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modelInput}
                    onChange={e => setModelInput(e.target.value)}
                    placeholder={activeProviderDef.candidateModels[0] || 'مثال: openai/gpt-oss-120b یا qwen/qwen3.6-27b'}
                    dir="ltr"
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl p-2.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Live models dropdown / suggestions if fetched */}
                {liveModels.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">
                      {isRtl ? `انتخاب از ${liveModels.length} مدل فعال:` : `Select from ${liveModels.length} active models:`}
                    </span>
                    <select
                      value={modelInput}
                      onChange={e => setModelInput(e.target.value)}
                      dir="ltr"
                      className="flex-1 border border-indigo-200 dark:border-indigo-800 rounded-xl p-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-indigo-50/50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">{isRtl ? '-- انتخاب از مدل‌های دریافت شده --' : '-- Choose from retrieved models --'}</option>
                      {liveModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Candidate shortcuts */}
                {activeProviderDef.candidateModels.length > 0 && liveModels.length === 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-400 font-bold">{isRtl ? 'پیشنهادی:' : 'Suggested:'}</span>
                    {activeProviderDef.candidateModels.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModelInput(m)}
                        className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-mono hover:border-indigo-400 cursor-pointer"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                {liveModelsError && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-[10px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{liveModelsError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Custom Provider specific fields */}
          {selectedProvider === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isRtl ? 'نام ارائه‌دهنده سفارشی:' : 'Custom Provider Name:'}
                </label>
                <input
                  type="text"
                  value={customProviderName}
                  onChange={e => setCustomProviderName(e.target.value)}
                  placeholder="مثال: Local vLLM / Ollama"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  {isRtl ? 'آدرس Base URL (فقط HTTPS مجاز):' : 'Base URL (HTTPS only):'}
                </label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={e => setBaseUrlInput(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  dir="ltr"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {formError && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleCancelForm}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {isRtl ? 'انصراف' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveForm(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isRtl ? 'ذخیره بدون آزمایش' : 'Save Directly'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveForm(true)}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isRtl ? 'درحال آزمایش و ذخیره...' : 'Testing & Saving...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isRtl ? 'آزمایش و ذخیره' : 'Test & Save'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="space-y-2.5">
        {keys.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200">
                {isRtl ? 'هیچ کلید شخصی ثبت نشده است' : 'No personal keys registered'}
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                {isRtl 
                  ? 'در نبود کلید شخصی، تمام تحلیل‌ها و پیش‌بینی‌ها از کلیدهای پیش‌فرض سرور برنامه اجرا می‌شوند. با افزودن کلیدهای رایگان، سهمیه و سرعت بیشتری خواهید داشت.' 
                  : 'Without custom keys, analysis will fallback to server default keys. Add your own free keys for dedicated quota and higher throughput.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{isRtl ? 'افزودن نخستین کلید' : 'Add First Key'}</span>
            </button>
          </div>
        ) : (
          keys.map((item, index) => {
            const provDef = PROVIDERS.find(p => p.id === item.provider);
            const isTestingThis = testingKeyId === item.id;
            const isUnmasked = !!unmaskedKeys[item.id];
            const displayKeyValue = isUnmasked ? item.key : maskKey(item.key);

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  item.enabled 
                    ? 'bg-white dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 shadow-xs' 
                    : 'bg-slate-100/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-65'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Left info: Provider badge + Name + Key */}
                  <div className="flex items-start sm:items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      {index + 1}
                    </span>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          {item.name || (isRtl ? provDef?.nameFa : provDef?.nameEn) || item.provider}
                        </span>

                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {isRtl ? provDef?.nameFa : provDef?.nameEn}
                        </span>

                        {item.modelMode === 'exact' ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <span>{isRtl ? 'مدل دقیق:' : 'Exact:'} {item.model}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>{isRtl ? 'آبشار خودکار' : 'Auto waterfall'}</span>
                          </span>
                        )}

                        {/* Status Badge */}
                        {item.status === 'valid' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{isRtl ? 'معتبر' : 'Valid'}</span>
                          </span>
                        )}
                        {item.status === 'invalid' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/50 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{isRtl ? 'نامعتبر' : 'Invalid'}</span>
                          </span>
                        )}
                        {item.status === 'checking' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{isRtl ? 'بررسی...' : 'Checking...'}</span>
                          </span>
                        )}
                        {item.status === 'idle' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-400">
                            {isRtl ? 'بررسی‌نشده' : 'Idle'}
                          </span>
                        )}
                      </div>

                      {/* Masked Key & Controls */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300 font-bold" dir="ltr">
                          {displayKeyValue}
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleMask(item.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          title={isUnmasked ? (isRtl ? 'مخفی کردن کلید' : 'Hide key') : (isRtl ? 'نمایش کلید' : 'Show key')}
                        >
                          {isUnmasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyKey(item.id, item.key)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          title={isRtl ? 'کپی کلید' : 'Copy key'}
                        >
                          {copiedKeyId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {/* Token usage counter */}
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mr-2">
                          {(item.tokenUsage || 0).toLocaleString('fa-IR')} {isRtl ? 'توکن' : 'tokens'}
                        </span>

                        {item.tokenUsage > 0 && (
                          <button
                            type="button"
                            onClick={() => handleResetUsage(item.id)}
                            className="text-[10px] text-slate-400 hover:text-rose-500 underline cursor-pointer"
                            title={isRtl ? 'صفر کردن مصرف' : 'Reset usage'}
                          >
                            {isRtl ? 'صفر کردن' : 'reset'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions: Enable switch + Test + Edit + Delete */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        item.enabled 
                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300' 
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                      title={item.enabled ? (isRtl ? 'کلید فعال است (کلیک برای غیرفعال‌سازی)' : 'Enabled') : (isRtl ? 'کلید غیرفعال است (کلیک برای فعال‌سازی)' : 'Disabled')}
                    >
                      <Power className="w-3 h-3" />
                      <span>{item.enabled ? (isRtl ? 'فعال' : 'On') : (isRtl ? 'غیرفعال' : 'Off')}</span>
                    </button>

                    {/* Test Key Button */}
                    <button
                      type="button"
                      disabled={isTestingThis}
                      onClick={() => handleTestKey(item.id)}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                      title={isRtl ? 'ارسال درخواست آزمایشی برای بررسی اعتبار کلید' : 'Validate key'}
                    >
                      {isTestingThis ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span>{isRtl ? 'تست' : 'Test'}</span>
                    </button>

                    {/* Edit Key Button */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(item)}
                      className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                      title={isRtl ? 'ویرایش تنظیمات کلید' : 'Edit key'}
                    >
                      <span className="text-xs font-bold">{isRtl ? 'ویرایش' : 'Edit'}</span>
                    </button>

                    {/* Delete Key Button */}
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.name || item.provider)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                      title={isRtl ? 'حذف کلید' : 'Delete key'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Error message banner if invalid */}
                {item.status === 'invalid' && item.errorMessage && (
                  <div className="mt-2.5 p-2 bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 rounded-xl text-[11px] text-rose-700 dark:text-rose-300 font-medium flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <span className="break-all">{item.errorMessage}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
