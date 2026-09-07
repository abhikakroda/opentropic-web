import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { AndroidChannel } from '../lib/agent';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { TaskPlatform } from '../types/app';
import { Button } from '../components/ui';

const handoffChannels: Array<{ id: AndroidChannel; label: string }> = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
  { id: 'widget', label: 'Widget' },
  { id: 'phone', label: 'Briefing / phone' },
  { id: 'generic', label: 'Generic' },
];

export function TasksPage() {
  const tasks = useWorkspaceStore((state) => state.tasks);
  const devices = useWorkspaceStore((state) => state.devices);
  const pairedAndroid = useWorkspaceStore((state) => state.pairedAndroid);
  const addTask = useWorkspaceStore((state) => state.addTask);
  const enqueueAndroidHandoff = useWorkspaceStore((state) => state.enqueueAndroidHandoff);
  const simulateAndroidPickup = useWorkspaceStore((state) => state.simulateAndroidPickup);
  const reportAndroidResult = useWorkspaceStore((state) => state.reportAndroidResult);
  const runTaskOnDevice = useWorkspaceStore((state) => state.runTaskOnDevice);
  const cycleTaskStatus = useWorkspaceStore((state) => state.cycleTaskStatus);

  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<TaskPlatform>('shared');
  const [targetDeviceId, setTargetDeviceId] = useState('device_web');
  const [handoffTitle, setHandoffTitle] = useState('Draft WhatsApp follow-up');
  const [handoffChannel, setHandoffChannel] = useState<AndroidChannel>('whatsapp');
  const [handoffPayload, setHandoffPayload] = useState('Thanks for the update — sending the latest draft today.');
  const [notice, setNotice] = useState('');

  const deviceName = useMemo(() => {
    const map = new Map(devices.map((device) => [device.id, device.name]));
    return (id?: string | null) => (id ? map.get(id) ?? id : 'Unassigned');
  }, [devices]);

  const runnableDevices = devices.filter((device) => device.platform !== 'android' || pairedAndroid);
  const handoffQueue = tasks.filter((task) => task.platform === 'android' && task.handoff);

  const onCreateTask = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    addTask(title, platform, platform === 'shared' ? null : targetDeviceId);
    setTitle('');
    setNotice('Task created.');
  };

  const onQueueHandoff = (event: FormEvent) => {
    event.preventDefault();
    if (!handoffTitle.trim() || !handoffPayload.trim()) return;
    enqueueAndroidHandoff({
      title: handoffTitle,
      channel: handoffChannel,
      payload: handoffPayload,
      action:
        handoffChannel === 'whatsapp'
          ? 'Send WhatsApp follow-up'
          : handoffChannel === 'sms'
            ? 'Send SMS follow-up'
            : handoffChannel === 'widget'
              ? 'Apply widget configuration'
              : handoffChannel === 'phone'
                ? 'Run phone briefing / companion action'
                : 'Run companion action',
      skillId:
        handoffChannel === 'whatsapp' || handoffChannel === 'sms'
          ? 'draft-reply'
          : handoffChannel === 'widget'
            ? 'widget-management'
            : handoffChannel === 'phone'
              ? 'morning-briefing'
              : undefined,
    });
    setNotice(pairedAndroid ? 'Android handoff queued.' : 'Android handoff blocked until pairing.');
  };

  return (
    <main className="shell py-16">
      <div className="mb-10">
        <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">Web app</p>
        <h1 className="mt-2 text-3xl font-bold">Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create shared work, assign desktop jobs to SSH/MCP systems, and queue Android handoffs with clear payloads.
        </p>
        {notice ? <p className="mt-3 text-sm text-scope">{notice}</p> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="border border-dashed border-border bg-card p-4">
          <h2 className="text-lg font-medium">Create task</h2>
          <form onSubmit={onCreateTask} className="mt-4 grid gap-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="New task title"
              className="w-full border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={platform}
                onChange={(event) => {
                  const next = event.target.value as TaskPlatform;
                  setPlatform(next);
                  if (next === 'android') setTargetDeviceId('device_android');
                  if (next === 'desktop') setTargetDeviceId('device_web');
                }}
                className="border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none"
              >
                <option value="shared">Shared</option>
                <option value="desktop">Web / desktop</option>
                <option value="android">Android companion</option>
              </select>
              <select
                value={targetDeviceId}
                onChange={(event) => setTargetDeviceId(event.target.value)}
                disabled={platform === 'shared'}
                className="border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none disabled:opacity-50"
              >
                {runnableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.platform})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="bg-foreground text-background hover:bg-muted">
              Add task
            </Button>
          </form>
        </div>

        <div className="border border-dashed border-border bg-card p-4">
          <h2 className="text-lg font-medium">Android handoff queue</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Web drafts the payload. Android picks it up, runs it, and reports queued → running → done/blocked/failed.
          </p>
          <form onSubmit={onQueueHandoff} className="mt-4 grid gap-3">
            <input
              value={handoffTitle}
              onChange={(event) => setHandoffTitle(event.target.value)}
              placeholder="Handoff title"
              className="w-full border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope"
            />
            <select
              value={handoffChannel}
              onChange={(event) => setHandoffChannel(event.target.value as AndroidChannel)}
              className="border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none"
            >
              {handoffChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.label}
                </option>
              ))}
            </select>
            <textarea
              value={handoffPayload}
              onChange={(event) => setHandoffPayload(event.target.value)}
              rows={4}
              placeholder="Payload for the companion"
              className="w-full border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope"
            />
            <Button type="submit" className="bg-foreground text-background hover:bg-muted">
              Queue Android handoff
            </Button>
          </form>
        </div>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Handoff queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {handoffQueue.length} Android-tagged payload{handoffQueue.length === 1 ? '' : 's'}
            </p>
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {pairedAndroid ? 'companion online' : 'pair required'}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {handoffQueue.length === 0 ? (
            <div className="border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              No Android handoffs yet. Queue WhatsApp, SMS, widget, or briefing work above.
            </div>
          ) : (
            handoffQueue.map((task) => (
              <div key={task.id} className="border border-dashed border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-medium">{task.title}</h3>
                    <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      {task.handoff?.channel} · {task.status}
                    </p>
                  </div>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{task.status}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{task.summary}</p>
                <div className="mt-4 border border-dashed border-border bg-background p-3 text-sm whitespace-pre-wrap">
                  {task.handoff?.payload}
                </div>
                {task.resultNote ? (
                  <p className="mt-3 text-sm text-scope">Result note: {task.resultNote}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const result = simulateAndroidPickup(task.id);
                      setNotice(result.ok ? 'Android picked up the handoff.' : result.error ?? 'Pickup failed.');
                    }}
                    className="border border-dashed border-border px-3 py-2 font-mono text-[11px] tracking-widest uppercase transition hover:border-foreground"
                  >
                    Simulate pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const result = reportAndroidResult(task.id, 'done', 'Phone confirmed completion.');
                      setNotice(result.ok ? 'Companion reported done.' : result.error ?? 'Update failed.');
                    }}
                    className="border border-dashed border-border px-3 py-2 font-mono text-[11px] tracking-widest uppercase transition hover:border-foreground"
                  >
                    Report done
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const result = reportAndroidResult(task.id, 'blocked', 'Needs permission or user confirmation.');
                      setNotice(result.ok ? 'Companion reported blocked.' : result.error ?? 'Update failed.');
                    }}
                    className="border border-dashed border-border px-3 py-2 font-mono text-[11px] tracking-widest uppercase transition hover:border-foreground"
                  >
                    Report blocked
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const result = reportAndroidResult(task.id, 'failed', 'Companion could not complete the action.');
                      setNotice(result.ok ? 'Companion reported failed.' : result.error ?? 'Update failed.');
                    }}
                    className="border border-dashed border-border px-3 py-2 font-mono text-[11px] tracking-widest uppercase transition hover:border-foreground"
                  >
                    Report failed
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">All tasks</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <div key={task.id} className="border border-dashed border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium">{task.title}</h2>
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{task.status}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{task.summary}</p>
              <div className="mt-4 flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
                <span>{task.platform}</span>
                <span>{formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</span>
              </div>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                Target: {deviceName(task.targetDeviceId)}
              </p>
              <label className="mt-4 block text-xs text-muted-foreground">Run on device</label>
              <select
                className="mt-2 w-full border border-dashed border-border bg-background px-3 py-2 text-sm outline-none"
                defaultValue=""
                onChange={(event) => {
                  const deviceId = event.target.value;
                  if (!deviceId) return;
                  const result = runTaskOnDevice(task.id, deviceId);
                  setNotice(result.ok ? 'Task assigned to ' + deviceName(deviceId) + '.' : result.error ?? 'Assign failed.');
                  event.currentTarget.value = '';
                }}
              >
                <option value="">Choose machine…</option>
                {runnableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} · {device.transport ?? device.platform}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => cycleTaskStatus(task.id)}
                className="mt-4 w-full border-b border-dashed border-border py-3 font-mono text-xs tracking-widest uppercase transition hover:border-foreground"
              >
                Advance status
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
