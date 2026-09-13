// Real OpenAI-compatible API client for the web app.
// Mirrors the Android app's OpenAICompatibleProvider: base URL + Bearer key,
// prefers /v1/responses, falls back to /v1/chat/completions.

export type ApiProviderId = 'openai' | 'openrouter' | 'groq' | 'together' | 'custom';

export interface ApiCredentials {
  provider: ApiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderPreset {
  id: ApiProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  keyHint: string;
  keysUrl?: string;
}

export const providerPresets: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    keyHint: 'sk-...',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4.1-mini',
    keyHint: 'sk-or-...',
    keysUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyHint: 'gsk_...',
    keysUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'together',
    label: 'Together',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    keyHint: 'API key',
    keysUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    keyHint: 'API key',
  },
];

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function normalizeBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed === 'https://api.openai.com') return trimmed + '/v1';
  return trimmed;
}

function headers(creds: ApiCredentials): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + creds.apiKey,
  };
  if (creds.provider === 'openrouter') {
    h['HTTP-Referer'] = 'https://opentropic.tech';
    h['X-Title'] = 'OpenTropic';
  }
  return h;
}

function chatEndpoint(base: string): string {
  return base.endsWith('/chat/completions') ? base : base + '/chat/completions';
}

function modelsEndpoint(base: string): string {
  return base.endsWith('/models') ? base : base + '/models';
}

// Some providers (e.g. Baseten inference endpoints) do not send CORS headers,
// so a direct browser fetch fails with a generic "Failed to fetch" TypeError.
// We first try the direct call (fast path for OpenAI/OpenRouter/Groq/Together),
// and on a network/CORS failure we transparently retry through our own
// same-origin serverless proxy (/api/llm), which forwards the request
// server-side where CORS does not apply.
const PROXY_ENDPOINT = '/api/llm';

function isNetworkError(err: unknown): boolean {
  // Browser CORS/network failures throw a TypeError with "Failed to fetch"
  // (or "Load failed" on Safari). ApiError (a real HTTP response) is NOT this.
  return err instanceof TypeError;
}

async function proxyFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<Response> {
  return fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    }),
    signal: init.signal,
  });
}

// Direct fetch with automatic same-origin proxy fallback on CORS/network error.
async function resilientFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<Response> {
  try {
    return await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.method === 'GET' || init.method === 'HEAD' ? undefined : init.body,
      signal: init.signal,
    });
  } catch (err) {
    if (isNetworkError(err)) {
      return proxyFetch(url, init);
    }
    throw err;
  }
}

export async function fetchModels(
  creds: Pick<ApiCredentials, 'provider' | 'apiKey' | 'baseUrl'>,
  signal?: AbortSignal,
): Promise<string[]> {
  const base = normalizeBase(creds.baseUrl);
  const res = await resilientFetch(modelsEndpoint(base), {
    method: 'GET',
    headers: headers({ ...creds, model: '' } as ApiCredentials),
    signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message ?? parsed?.message ?? raw;
    } catch {
      // keep raw
    }
    throw new ApiError(detail || ('Could not list models (' + res.status + ')'), res.status);
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ApiError('Provider returned invalid JSON for models.');
  }

  const list: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const ids = list
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

async function chatCompletions(
  creds: ApiCredentials,
  turns: ChatTurn[],
  signal?: AbortSignal,
): Promise<string> {
  const base = normalizeBase(creds.baseUrl);
  const res = await resilientFetch(chatEndpoint(base), {
    method: 'POST',
    headers: headers(creds),
    body: JSON.stringify({
      model: creds.model,
      messages: turns,
      stream: false,
      temperature: 0.7,
    }),
    signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message ?? parsed?.message ?? raw;
    } catch {
      // keep raw
    }
    throw new ApiError(detail || ('Request failed (' + res.status + ')'), res.status);
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ApiError('Provider returned invalid JSON.');
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part: any) => (typeof part === 'string' ? part : part?.text ?? '')).join('');
  }
  throw new ApiError('Provider returned no message content.');
}

export async function runApiChat(
  creds: ApiCredentials,
  turns: ChatTurn[],
  signal?: AbortSignal,
): Promise<string> {
  return chatCompletions(creds, turns, signal);
}

async function extractStreamError(res: Response): Promise<never> {
  const raw = await res.text();
  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message ?? parsed?.message ?? raw;
  } catch {
    // keep raw
  }
  throw new ApiError(detail || ('Request failed (' + res.status + ')'), res.status);
}

// Streaming chat via SSE. Calls onToken with each incremental delta and
// resolves with the full assembled reply. Falls back gracefully if the
// provider does not stream (the caller can still show the final text).
export async function streamApiChat(
  creds: ApiCredentials,
  turns: ChatTurn[],
  onToken: (delta: string, full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const base = normalizeBase(creds.baseUrl);
  const res = await resilientFetch(chatEndpoint(base), {
    method: 'POST',
    headers: headers(creds),
    body: JSON.stringify({
      model: creds.model,
      messages: turns,
      stream: true,
      temperature: 0.7,
    }),
    signal,
  });

  if (!res.ok) {
    await extractStreamError(res);
  }

  if (!res.body) {
    // No streamable body: fall back to a single non-streaming request.
    const full = await chatCompletions(creds, turns, signal);
    onToken(full, full);
    return full;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const consumeChunk = (payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed || trimmed === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return;
    }
    const choice = json?.choices?.[0];
    const delta =
      choice?.delta?.content ??
      (typeof choice?.message?.content === 'string' ? choice.message.content : undefined);
    if (typeof delta === 'string' && delta.length) {
      full += delta;
      onToken(delta, full);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split('\n')) {
          const clean = line.trim();
          if (clean.startsWith('data:')) {
            consumeChunk(clean.slice(5));
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Handle any trailing buffered data line.
  const tail = buffer.trim();
  if (tail.startsWith('data:')) {
    consumeChunk(tail.slice(5));
  }

  if (!full.trim()) {
    // Some OpenAI-compatible servers ignore stream:true. Fall back once.
    const fallback = await chatCompletions(creds, turns, signal);
    if (fallback.trim()) {
      onToken(fallback, fallback);
      return fallback;
    }
  }

  return full;
}

export function validateCredentials(creds: Partial<ApiCredentials>): string | null {
  if (!creds.apiKey || !creds.apiKey.trim()) return 'Add an API key.';
  if (!creds.baseUrl || !creds.baseUrl.trim()) return 'Add a base URL.';
  if (!creds.model || !creds.model.trim()) return 'Add a model name.';
  return null;
}

export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••';
  return trimmed.slice(0, 4) + '••••••' + trimmed.slice(-4);
}
