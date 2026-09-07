import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { product } from '../data/catalog';
import { useWorkspaceStore } from '../store/workspaceStore';
import {
  maskKey,
  providerPresets,
  runApiChat,
  fetchModels,
  validateCredentials,
} from '../lib/apiClient';
import type { ApiProviderId } from '../types/app';

export function SettingsPage() {
  const providers = useWorkspaceStore((state) => state.providers);
  const selectedRuntime = useWorkspaceStore((state) => state.selectedRuntime);
  const memory = useWorkspaceStore((state) => state.memory);
  const toggleProvider = useWorkspaceStore((state) => state.toggleProvider);
  const setRuntime = useWorkspaceStore((state) => state.setRuntime);
  const toggleMemory = useWorkspaceStore((state) => state.toggleMemory);
  const forgetMemoryFact = useWorkspaceStore((state) => state.forgetMemoryFact);
  const rememberFact = useWorkspaceStore((state) => state.rememberFact);
  const apiConfig = useWorkspaceStore((state) => state.apiConfig);
  const saveApiConfig = useWorkspaceStore((state) => state.saveApiConfig);
  const clearApiConfig = useWorkspaceStore((state) => state.clearApiConfig);
  const [label, setLabel] = useState('');
  const [detail, setDetail] = useState('');

  const [provider, setProvider] = useState<ApiProviderId>(apiConfig.provider);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(apiConfig.baseUrl);
  const [model, setModel] = useState(apiConfig.model);
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; message: string }>({
    kind: 'idle',
    message: '',
  });
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  useEffect(() => {
    setProvider(apiConfig.provider);
    setBaseUrl(apiConfig.baseUrl);
    setModel(apiConfig.model);
  }, [apiConfig.provider, apiConfig.baseUrl, apiConfig.model]);

  const activePreset = providerPresets.find((preset) => preset.id === provider) ?? providerPresets[0];

  const loadModels = async () => {
    const keyToUse = apiKey.trim() || apiConfig.apiKey;
    if (!keyToUse) {
      setModelsError('Add a key first to fetch models.');
      return;
    }
    setLoadingModels(true);
    setModelsError('');
    try {
      const list = await fetchModels({ provider, apiKey: keyToUse, baseUrl: baseUrl.trim() });
      setModels(list);
      if (list.length === 0) {
        setModelsError('No models returned. You can still type a model name.');
      } else if (!list.includes(model)) {
        setModel(list[0]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not fetch models.';
      setModelsError(message);
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  // Auto-fetch models when a saved key exists and the provider/base changes.
  useEffect(() => {
    if (!apiConfig.apiKey) return;
    let cancelled = false;
    setLoadingModels(true);
    setModelsError('');
    fetchModels({ provider: apiConfig.provider, apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl })
      .then((list) => {
        if (cancelled) return;
        setModels(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setModelsError(err instanceof Error ? err.message : 'Could not fetch models.');
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiConfig.apiKey, apiConfig.provider, apiConfig.baseUrl]);

  const onSelectProvider = (id: ApiProviderId) => {
    setProvider(id);
    const preset = providerPresets.find((item) => item.id === id) ?? providerPresets[0];
    setBaseUrl(preset.baseUrl);
    setModel(preset.defaultModel);
    setStatus({ kind: 'idle', message: '' });
    setModels([]);
    setModelsError('');
  };

  const onSaveApi = (event: FormEvent) => {
    event.preventDefault();
    const keyToUse = apiKey.trim() || apiConfig.apiKey;
    const error = validateCredentials({ apiKey: keyToUse, baseUrl, model });
    if (error) {
      setStatus({ kind: 'error', message: error });
      return;
    }
    saveApiConfig({ provider, apiKey: keyToUse, baseUrl: baseUrl.trim(), model: model.trim() });
    setApiKey('');
    setStatus({ kind: 'ok', message: 'Saved. Chat now uses this API.' });
  };

  const onTestApi = async () => {
    const keyToUse = apiKey.trim() || apiConfig.apiKey;
    const error = validateCredentials({ apiKey: keyToUse, baseUrl, model });
    if (error) {
      setStatus({ kind: 'error', message: error });
      return;
    }
    setTesting(true);
    setStatus({ kind: 'idle', message: 'Testing…' });
    try {
      const reply = await runApiChat(
        { provider, apiKey: keyToUse, baseUrl: baseUrl.trim(), model: model.trim() },
        [{ role: 'user', content: 'Reply with the single word: ok' }],
      );
      setStatus({ kind: 'ok', message: 'Connected. Model replied: ' + reply.trim().slice(0, 60) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed.';
      setStatus({ kind: 'error', message });
    } finally {
      setTesting(false);
    }
  };

  const onRemember = (event: FormEvent) => {
    event.preventDefault();
    rememberFact(label, detail, 'preference');
    setLabel('');
    setDetail('');
  };

  return (
    <main className="shell py-16">
      <div className="mb-10">
        <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">Web app</p>
        <h1 className="mt-2 text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage providers, runtime defaults, and lightweight workspace memory on {product.domain}.
        </p>
      </div>
      <div className="mb-4 border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Model API</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Add an API key to make chat call a real model, just like the Android app. Keys are stored in this
              browser only and sent directly to the provider you choose.
            </p>
          </div>
          <span
            className={`font-mono text-xs uppercase tracking-widest ${apiConfig.connected ? 'text-scope' : 'text-muted-foreground'}`}
          >
            {apiConfig.connected ? 'connected · ' + maskKey(apiConfig.apiKey) : 'not connected'}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {providerPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectProvider(preset.id)}
              className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition ${
                provider === preset.id
                  ? 'border-scope bg-scope/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSaveApi} className="mt-5 space-y-4">
          <div>
            <label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={apiConfig.connected ? 'Saved — enter a new key to replace' : activePreset.keyHint}
              autoComplete="off"
              className="mt-1 w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-scope"
            />
            {activePreset.keysUrl ? (
              <a
                href={activePreset.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex font-mono text-[11px] uppercase tracking-widest text-scope transition hover:opacity-70"
              >
                Get a {activePreset.label} key →
              </a>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Base URL</label>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="mt-1 w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-scope"
              />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Model</label>
              <div className="mt-1 flex gap-2">
                <input
                  list="opentropic-models"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={loadingModels ? 'Loading models…' : 'Model name or pick from list'}
                  className="w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-scope"
                />
                <button
                  type="button"
                  onClick={loadModels}
                  disabled={loadingModels}
                  className="shrink-0 border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition hover:border-foreground disabled:opacity-40"
                >
                  {loadingModels ? '…' : 'Fetch'}
                </button>
              </div>
              <datalist id="opentropic-models">
                {models.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              {models.length ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {models.length} models available
                </p>
              ) : null}
              {modelsError ? <p className="mt-1 text-xs text-red-400">{modelsError}</p> : null}
            </div>
          </div>

          {status.message ? (
            <p
              className={`text-sm ${
                status.kind === 'error'
                  ? 'text-red-400'
                  : status.kind === 'ok'
                    ? 'text-scope'
                    : 'text-muted-foreground'
              }`}
            >
              {status.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-solid">
              Save key
            </button>
            <button
              type="button"
              onClick={onTestApi}
              disabled={testing}
              className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest transition hover:border-foreground disabled:opacity-40"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {apiConfig.connected ? (
              <button
                type="button"
                onClick={() => {
                  clearApiConfig();
                  setStatus({ kind: 'idle', message: 'Key cleared. Chat is back in demo mode.' });
                }}
                className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition hover:border-foreground hover:text-foreground"
              >
                Clear key
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-dashed border-border bg-card p-6">
          <h2 className="text-xl font-bold">Default runtime</h2>
          <p className="mt-2 text-sm text-muted-foreground">Current: {selectedRuntime}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['built-in', 'claude', 'codex', 'opencode', 'qwen', 'hermes'].map((runtime) => (
              <button
                key={runtime}
                type="button"
                onClick={() => setRuntime(runtime as any)}
                className={`border px-3 py-1.5 text-xs transition font-mono uppercase tracking-widest ${
                  selectedRuntime === runtime
                    ? 'border-scope bg-scope/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground'
                }`}
              >
                {runtime}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-dashed border-border bg-card p-6">
          <h2 className="text-xl font-bold">Privacy boundary</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Web app state stays in browser storage. Phone permissions, accessibility, SMS, and widgets remain inside the Android app until the user grants them there. Cross-channel drafts can be prepared in web, but messaging send confirmation stays on Android.
          </p>
          <a
            href={product.privacyUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-scope transition hover:opacity-70"
          >
            Open privacy notice
          </a>
        </div>
      </div>

      <div className="mt-4 border border-dashed border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Workspace memory</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Lightweight facts about preferences, projects, paired devices, and recurring routines. Useful for research → deliverable runs and cross-channel drafts without feeling creepy.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleMemory}
            className="border-b border-dashed border-border py-2 font-mono text-xs tracking-widest uppercase transition hover:border-foreground"
          >
            {memory.enabled ? 'Disable memory' : 'Enable memory'}
          </button>
        </div>

        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {memory.enabled ? `${memory.facts.length} facts stored` : 'memory off'}
        </p>

        <form onSubmit={onRemember} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
            className="border border-dashed border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
          <input
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="Remember a preference, project, or routine"
            className="border border-dashed border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
          <button
            type="submit"
            className="border border-dashed border-border px-4 py-2 font-mono text-xs uppercase tracking-widest transition hover:border-foreground"
          >
            Remember
          </button>
        </form>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {memory.facts.map((fact) => (
            <div key={fact.id} className="border border-dashed border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{fact.label}</h3>
                  <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">{fact.kind}</p>
                </div>
                <button
                  type="button"
                  onClick={() => forgetMemoryFact(fact.id)}
                  className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                >
                  Forget
                </button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{fact.detail}</p>
            </div>
          ))}
          {!memory.facts.length ? (
            <p className="text-sm text-muted-foreground">No memory facts yet. Ask chat to remember something, or add one here.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <div key={provider.id} className="border border-dashed border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">{provider.label}</h2>
                <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">{provider.group}</p>
              </div>
              <span className={`font-mono text-xs uppercase tracking-widest ${provider.connected ? 'text-scope' : 'text-muted-foreground'}`}>
                {provider.connected ? 'connected' : 'available'}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{provider.detail}</p>
            <button
              type="button"
              onClick={() => toggleProvider(provider.id)}
              className="mt-4 w-full border-b border-dashed border-border py-3 font-mono text-xs tracking-widest uppercase transition hover:border-foreground"
            >
              {provider.connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
