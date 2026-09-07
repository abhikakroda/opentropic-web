import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { product } from '../data/catalog';
import { useWorkspaceStore } from '../store/workspaceStore';

export function DevicesPage() {
  const devices = useWorkspaceStore((state) => state.devices);
  const tasks = useWorkspaceStore((state) => state.tasks);
  const pairCode = useWorkspaceStore((state) => state.pairCode);
  const pairedAndroid = useWorkspaceStore((state) => state.pairedAndroid);
  const generatePairCode = useWorkspaceStore((state) => state.generatePairCode);
  const confirmPairCode = useWorkspaceStore((state) => state.confirmPairCode);
  const unpairAndroid = useWorkspaceStore((state) => state.unpairAndroid);
  const toggleSystemDevice = useWorkspaceStore((state) => state.toggleSystemDevice);
  const runTaskOnDevice = useWorkspaceStore((state) => state.runTaskOnDevice);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const systems = devices.filter((device) => device.kind === 'system' || device.platform === 'macos' || device.platform === 'linux' || device.platform === 'windows');
  const browser = devices.find((device) => device.platform === 'web');
  const android = devices.find((device) => device.platform === 'android');
  const assignableTasks = useMemo(
    () => tasks.filter((task) => task.status !== 'done'),
    [tasks],
  );

  const onConfirm = (event: FormEvent) => {
    event.preventDefault();
    const result = confirmPairCode(code);
    if (!result.ok) {
      setError(result.error ?? 'Unable to pair');
      return;
    }
    setError('');
    setCode('');
    setNotice('Android companion paired.');
  };

  return (
    <main className="shell py-16">
      <div className="mb-10">
        <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">Integration</p>
        <h1 className="mt-2 text-3xl font-bold">Devices</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Pair the separate Android companion, then treat macOS/Windows/Linux agents as systems you can run tasks on over SSH or MCP.
        </p>
        {notice ? <p className="mt-3 text-sm text-scope">{notice}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-dashed border-border bg-card p-6">
          <h2 className="text-xl font-bold">Android companion</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Package <code className="border border-dashed border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{product.androidPackage}</code>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`font-mono text-xs uppercase tracking-widest ${pairedAndroid ? 'text-scope' : 'text-muted-foreground'}`}>
              {pairedAndroid ? 'paired' : 'not paired'}
            </span>
            {pairCode ? <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">code {pairCode}</span> : null}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{android?.detail ?? 'Phone permissions stay on device.'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={generatePairCode} className="btn-solid">
              Generate pair code
            </button>
            {pairedAndroid ? (
              <button
                type="button"
                onClick={() => {
                  unpairAndroid();
                  setNotice('Android unpaired.');
                }}
                className="border border-dashed border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 transition hover:border-red-500/50"
              >
                Unpair
              </button>
            ) : null}
          </div>
          <form onSubmit={onConfirm} className="mt-5 space-y-3">
            <label className="text-sm text-muted-foreground" htmlFor="pair-code">Confirm code from Android</label>
            <div className="flex gap-3">
              <input
                id="pair-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="6-character code"
                className="flex-1 border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope"
              />
              <button type="submit" className="btn-solid">Pair</button>
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </form>
        </div>

        <div className="border border-dashed border-border bg-card p-6">
          <h2 className="text-xl font-bold">This browser</h2>
          <p className="mt-2 text-sm text-muted-foreground">{browser?.detail ?? 'Local web workspace'}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{browser?.name ?? 'This browser'}</div>
              <div className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">web · local</div>
            </div>
            <span className="font-mono text-xs uppercase tracking-widest text-scope">{browser?.status ?? 'online'}</span>
          </div>
          <div className="mt-5">
            <label className="text-sm text-muted-foreground" htmlFor="run-task">Run open task here</label>
            <div className="mt-2 flex gap-3">
              <select
                id="run-task"
                value={selectedTaskId}
                onChange={(event) => setSelectedTaskId(event.target.value)}
                className="flex-1 border border-dashed border-border bg-background px-4 py-3 text-sm outline-none"
              >
                <option value="">Choose task…</option>
                {assignableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-solid"
                onClick={() => {
                  if (!selectedTaskId || !browser) return;
                  const result = runTaskOnDevice(selectedTaskId, browser.id);
                  setNotice(result.ok ? 'Task running in this browser.' : result.error ?? 'Unable to run task.');
                }}
              >
                Run
              </button>
            </div>
          </div>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Desktop systems</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            macOS, Windows, and Linux agents expose SSH/MCP status. Connect a machine, then run a task on it from Tasks or here.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {systems.map((device) => {
            const connected = device.connected ?? device.status !== 'offline';
            return (
              <div key={device.id} className="border border-dashed border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-medium">{device.name}</h3>
                    <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      {device.platform} · {device.transport ?? 'local'}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-xs uppercase tracking-widest ${
                      device.status === 'online' ? 'text-scope' : device.status === 'idle' ? 'text-amber-300' : 'text-red-400'
                    }`}
                  >
                    {device.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{device.detail ?? device.host ?? 'System agent'}</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  Host: {device.host ?? 'n/a'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(device.capabilities ?? []).map((capability) => (
                    <span key={capability} className="border border-dashed border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {capability}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">Last sync: {device.lastSync}</p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      toggleSystemDevice(device.id);
                      setNotice((connected ? 'Disconnected ' : 'Connected ') + device.name + '.');
                    }}
                    className="w-full border border-dashed border-border px-3 py-2 font-mono text-[11px] tracking-widest uppercase transition hover:border-foreground"
                  >
                    {connected ? 'Disconnect' : 'Connect'}
                  </button>
                  <select
                    className="w-full border border-dashed border-border bg-background px-3 py-2 text-sm outline-none"
                    defaultValue=""
                    onChange={(event) => {
                      const taskId = event.target.value;
                      if (!taskId) return;
                      const result = runTaskOnDevice(taskId, device.id);
                      setNotice(result.ok ? 'Running on ' + device.name + '.' : result.error ?? 'Unable to run task.');
                      event.currentTarget.value = '';
                    }}
                  >
                    <option value="">Run task on this machine…</option>
                    {assignableTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Linked surfaces</h2>
        <div className="mt-4 space-y-3 border border-dashed border-border bg-card p-6">
          {devices.map((device) => (
            <div key={device.id} className="border-b border-dashed border-border pb-4 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{device.name}</div>
                  <div className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    {device.platform}
                    {device.transport ? ' · ' + device.transport : ''}
                    {device.kind ? ' · ' + device.kind : ''}
                  </div>
                </div>
                <span
                  className={`font-mono text-xs uppercase tracking-widest ${
                    device.status === 'online' ? 'text-scope' : device.status === 'idle' ? 'text-amber-300' : 'text-red-400'
                  }`}
                >
                  {device.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Last sync: {device.lastSync}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
