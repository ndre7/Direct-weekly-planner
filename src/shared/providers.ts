export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'groq'
  | 'deepseek'
  | 'anthropic'
  | 'openrouter'
  | 'mistral'
  | 'together'
  | 'xai'
  | 'perplexity'
  | 'cerebras'
  | 'custom';

export interface ProviderDefinition {
  id: ProviderId;
  nameFa: string;
  nameEn: string;
  placeholder: string;
  prefixHints: string[];
  candidateModels: string[];
  defaultBaseUrl: string;
  freeKeyUrl: string;
  modelsPageUrl?: string;
  modelsList?: {
    url: string;
    authType: 'bearer' | 'gemini_query' | 'anthropic';
  };
  jsonMode: boolean;
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'gemini',
    nameFa: 'گوگل جمینای',
    nameEn: 'Google Gemini',
    placeholder: 'AIzaSy...',
    prefixHints: ['AIza'],
    candidateModels: ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
    defaultBaseUrl: '',
    freeKeyUrl: 'https://aistudio.google.com',
    modelsPageUrl: 'https://ai.google.dev/gemini-api/docs/models',
    modelsList: {
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      authType: 'gemini_query'
    },
    jsonMode: false
  },
  {
    id: 'openai',
    nameFa: 'اوپن‌ای‌آی',
    nameEn: 'OpenAI',
    placeholder: 'sk-... / sk-proj-...',
    prefixHints: ['sk-proj-', 'sk-'],
    candidateModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    freeKeyUrl: 'https://platform.openai.com',
    modelsPageUrl: 'https://platform.openai.com/docs/models',
    modelsList: {
      url: 'https://api.openai.com/v1/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'groq',
    nameFa: 'گروک',
    nameEn: 'Groq',
    placeholder: 'gsk_...',
    prefixHints: ['gsk_'],
    candidateModels: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    freeKeyUrl: 'https://console.groq.com',
    modelsPageUrl: 'https://console.groq.com/docs/models',
    modelsList: {
      url: 'https://api.groq.com/openai/v1/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'deepseek',
    nameFa: 'دیپ‌سیک',
    nameEn: 'DeepSeek',
    placeholder: 'sk-...',
    prefixHints: ['sk-'],
    candidateModels: ['deepseek-chat', 'deepseek-reasoner'],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    freeKeyUrl: '',
    modelsList: {
      url: 'https://api.deepseek.com/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'anthropic',
    nameFa: 'آنتروپیک کلود',
    nameEn: 'Anthropic Claude',
    placeholder: 'sk-ant-...',
    prefixHints: ['sk-ant-'],
    candidateModels: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-haiku-20240307'],
    defaultBaseUrl: 'https://api.anthropic.com',
    freeKeyUrl: '',
    modelsList: {
      url: 'https://api.anthropic.com/v1/models',
      authType: 'anthropic'
    },
    jsonMode: false
  },
  {
    id: 'openrouter',
    nameFa: 'اوپن‌روتر',
    nameEn: 'OpenRouter',
    placeholder: 'sk-or-...',
    prefixHints: ['sk-or-'],
    candidateModels: ['google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    freeKeyUrl: '',
    modelsPageUrl: 'https://openrouter.ai/models',
    modelsList: {
      url: 'https://openrouter.ai/api/v1/models',
      authType: 'bearer'
    },
    jsonMode: false
  },
  {
    id: 'mistral',
    nameFa: 'میسترال',
    nameEn: 'Mistral AI',
    placeholder: '...',
    prefixHints: [],
    candidateModels: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    freeKeyUrl: '',
    modelsList: {
      url: 'https://api.mistral.ai/v1/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'together',
    nameFa: 'توگدر ای‌آی',
    nameEn: 'Together AI',
    placeholder: '...',
    prefixHints: [],
    candidateModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    defaultBaseUrl: 'https://api.together.xyz/v1',
    freeKeyUrl: '',
    modelsList: {
      url: 'https://api.together.xyz/v1/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'xai',
    nameFa: 'ایکس‌ای‌آی گراک',
    nameEn: 'xAI Grok',
    placeholder: 'xai-...',
    prefixHints: ['xai-'],
    candidateModels: ['grok-2-latest', 'grok-beta'],
    defaultBaseUrl: 'https://api.x.ai/v1',
    freeKeyUrl: '',
    modelsList: {
      url: 'https://api.x.ai/v1/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'perplexity',
    nameFa: 'پرپلکسیتی',
    nameEn: 'Perplexity',
    placeholder: 'pplx-...',
    prefixHints: ['pplx-'],
    candidateModels: ['sonar', 'sonar-pro', 'sonar-reasoning'],
    defaultBaseUrl: 'https://api.perplexity.ai',
    freeKeyUrl: '',
    jsonMode: false
  },
  {
    id: 'cerebras',
    nameFa: 'سربرس',
    nameEn: 'Cerebras',
    placeholder: 'csk-...',
    prefixHints: ['csk-'],
    candidateModels: ['llama3.1-70b', 'llama3.1-8b'],
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    freeKeyUrl: '',
    modelsList: {
      url: 'https://api.cerebras.ai/v1/models',
      authType: 'bearer'
    },
    jsonMode: true
  },
  {
    id: 'custom',
    nameFa: 'سفارشی / سازگار با OpenAI',
    nameEn: 'Custom / OpenAI-Compatible',
    placeholder: 'کلید API خود را وارد کنید...',
    prefixHints: [],
    candidateModels: [],
    defaultBaseUrl: '',
    freeKeyUrl: '',
    jsonMode: false
  }
];

// DeepSeek هم کلید sk- می‌سازد؛ پس پیشوند sk- فقط پیش‌فرض است و انتخاب دستی ارائه‌دهنده همیشه باید ممکن باشد.
export function detectProvider(key: string): string {
  if (!key || typeof key !== 'string') return 'custom';
  const trimmed = key.trim();
  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('sk-or-')) return 'openrouter';
  if (trimmed.startsWith('sk-proj-')) return 'openai';
  if (trimmed.startsWith('gsk_')) return 'groq';
  if (trimmed.startsWith('pplx-')) return 'perplexity';
  if (trimmed.startsWith('xai-')) return 'xai';
  if (trimmed.startsWith('csk-')) return 'cerebras';
  if (trimmed.startsWith('AIza')) return 'gemini';
  if (trimmed.startsWith('sk-')) return 'openai';
  return 'custom';
}

export const ALLOWED_BASE_URL_HOSTS: string[] = [
  'api.openai.com',
  'api.groq.com',
  'api.deepseek.com',
  'api.anthropic.com',
  'openrouter.ai',
  'api.mistral.ai',
  'api.together.xyz',
  'api.x.ai',
  'api.perplexity.ai',
  'api.cerebras.ai',
  'generativelanguage.googleapis.com'
];
