import type {
  ArtifactItem,
  DeviceLink,
  ProviderConnection,
  RuntimeId,
  SkillItem,
  TaskItem,
  WorkspaceMemory,
} from '../types/app';

export const product = {
  name: 'OpenTropic',
  domain: 'opentropic.tech',
  tagline: 'AI workspace for the web, paired with Android.',
  description:
    'OpenTropic is a multi-platform web app for chats, skills, tasks, and artifacts. Pair it with the separate OpenTropic Android app when you need phone-side automation.',
  androidPackage: 'com.opentropic.app',
  slackCommunity: 'https://opentropicbeta.slack.com',
  privacyUrl: 'https://www.opentropic.com/opentropic/privacy',
} as const;

export const runtimes: Array<{ id: RuntimeId; label: string; detail: string }> = [
  { id: 'built-in', label: 'Built-in', detail: 'OpenTropic on-device style runtime' },
  { id: 'claude', label: 'Claude Code', detail: 'Anthropic coding agent' },
  { id: 'codex', label: 'Codex', detail: 'OpenAI coding agent' },
  { id: 'opencode', label: 'OpenCode', detail: 'OpenCode terminal agent' },
  { id: 'qwen', label: 'Qwen Code', detail: 'DashScope-compatible runtime' },
  { id: 'hermes', label: 'Hermes', detail: 'Gateway agent runtime' },
];

export const seedSkills: SkillItem[] = [
  {
    id: 'research',
    name: 'Research',
    category: 'Knowledge',
    description: 'Deep research briefs with source-aware summaries.',
    enabled: true,
    androidHandoff: false,
  },
  {
    id: 'create-html',
    name: 'Create HTML',
    category: 'Artifacts',
    description: 'Generate pages and local previews from prompts.',
    enabled: true,
    androidHandoff: false,
  },
  {
    id: 'automation',
    name: 'Automation',
    category: 'Workflow',
    description: 'Recurring routines with optional Android handoff.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'price-drop-order',
    name: 'Price Drop Order',
    category: 'Shopping',
    description: 'Track a product ~3x/day and open the store on-screen to order when the INR target hits.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    category: 'Productivity',
    description: 'Scan phone notifications and build a morning digest. Runs on Android companion.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'evening-briefing',
    name: 'Evening Briefing',
    category: 'Productivity',
    description: 'Scan phone notifications and wrap the day with tomorrow prep. Runs on Android companion.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'meeting-prep',
    name: 'Meeting Prep',
    category: 'Productivity',
    description: 'Agenda, talking points, and follow-up cards.',
    enabled: true,
    androidHandoff: false,
  },
  {
    id: 'remote-agent',
    name: 'Remote Agent',
    category: 'Runtimes',
    description: 'Claude Code and Codex sessions on remote machines.',
    enabled: false,
    androidHandoff: false,
  },
  {
    id: 'widget-management',
    name: 'Widget Management',
    category: 'Android',
    description: 'Configure mobile widgets from the web, apply on phone.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'draft-reply',
    name: 'Draft Reply',
    category: 'Messaging',
    description: 'Draft replies and send via Android companion when needed.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'cross-channel-draft',
    name: 'Cross-channel Draft',
    category: 'Messaging',
    description:
      'Draft Slack, Telegram, and WhatsApp replies in the web app, then send only through the right channel or paired Android device. Messaging send confirmation stays on Android.',
    enabled: true,
    androidHandoff: true,
  },
  {
    id: 'research-deliverable',
    name: 'Research Deliverable',
    category: 'Workflow',
    description:
      'One prompt produces a source brief, outline, HTML artifact, and shareable summary. Chains Research, Create HTML, and Artifacts.',
    enabled: true,
    androidHandoff: false,
  },
  {
    id: 'workspace-memory',
    name: 'Workspace Memory',
    category: 'Memory',
    description:
      'Lightweight memory over conversations, enabled skills, paired devices, and recent artifacts so the assistant remembers preferences and recurring routines without feeling creepy.',
    enabled: true,
    androidHandoff: false,
  },
  {
    id: 'travel-planner',
    name: 'Travel Planner',
    category: 'Planning',
    description: 'Itineraries, maps, and shareable travel pages.',
    enabled: true,
    androidHandoff: false,
  },
  {
    id: 'swiggy-order',
    name: 'Swiggy Order',
    category: 'Food',
    description:
      'Draft a Swiggy food order from chat — restaurant, items, delivery address, and notes — then hand off to the paired Android app to place and pay on-screen. Checkout and payment stay on the phone.',
    enabled: true,
    androidHandoff: true,
  },
];

export const seedTasks: TaskItem[] = [
  {
    id: 'task_briefing',
    title: 'Morning briefing pack',
    status: 'done',
    platform: 'shared',
    summary: 'Notification scan + calendar digest prepared for web review.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: 'task_evening_briefing',
    title: 'Evening wrap-up pack',
    status: 'queued',
    platform: 'android',
    summary: "Waiting on companion notification access for tonight's wrap-up.",
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    targetDeviceId: 'device_android',
    handoff: {
      title: 'Evening wrap-up pack',
      action: 'Scan notifications and build evening digest',
      channel: 'phone',
      payload: 'Collect unread notifications, calendar leftovers, and tomorrow prep.',
      requiresPairing: true,
      skillId: 'evening-briefing',
      steps: [
        'Pair Android companion in Devices.',
        'Enable Notification Access on the phone.',
        'Confirm the wrap-up pack after the companion finishes.',
      ],
    },
  },
  {
    id: 'task_travel',
    title: 'Draft travel itinerary page',
    status: 'running',
    platform: 'desktop',
    summary: 'Generating HTML artifact in the workbench.',
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    targetDeviceId: 'device_web',
    assignedRuntime: 'built-in',
  },
  {
    id: 'task_whatsapp',
    title: 'Reply to WhatsApp follow-ups',
    status: 'queued',
    platform: 'android',
    summary: 'Waiting for companion phone permissions and send confirmation.',
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    targetDeviceId: 'device_android',
    handoff: {
      title: 'Reply to WhatsApp follow-ups',
      action: 'Send WhatsApp follow-up',
      channel: 'whatsapp',
      payload: 'Thanks for the update — looping back today with the latest draft.',
      requiresPairing: true,
      skillId: 'draft-reply',
      steps: [
        'Review the draft payload in Tasks.',
        'Confirm send in the paired Android companion.',
        'Mark the task done after phone confirmation.',
      ],
    },
  },
  {
    id: 'task_cross_channel',
    title: 'Cross-channel draft: Slack + WhatsApp',
    status: 'queued',
    platform: 'shared',
    summary: 'Drafts ready in web. WhatsApp send waits for Android confirmation.',
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'task_research_pipeline',
    title: 'Research → deliverable pipeline',
    status: 'running',
    platform: 'desktop',
    summary: 'Source brief done. Outline approved. HTML artifact rendering.',
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    targetDeviceId: 'device_macos',
    assignedRuntime: 'codex',
  },
];

export const seedDevices: DeviceLink[] = [
  {
    id: 'device_web',
    name: 'This browser',
    platform: 'web',
    status: 'online',
    lastSync: 'Just now',
    kind: 'browser',
    transport: 'local',
    host: 'localhost',
    capabilities: ['chat', 'artifacts', 'search'],
    connected: true,
    detail: 'Local web workspace',
  },
  {
    id: 'device_android',
    name: 'OpenTropic Android',
    platform: 'android',
    status: 'idle',
    lastSync: 'Awaiting pair code',
    kind: 'companion',
    transport: 'pair-code',
    capabilities: ['whatsapp', 'sms', 'widgets', 'notifications'],
    connected: false,
    detail: 'Phone permissions stay on device',
  },
  {
    id: 'device_macos',
    name: 'MacBook Agent',
    platform: 'macos',
    status: 'online',
    lastSync: '2 min ago',
    kind: 'system',
    transport: 'ssh',
    host: 'macbook.local',
    capabilities: ['ssh', 'codex', 'claude', 'filesystem'],
    connected: true,
    detail: 'SSH bridge ready',
  },
  {
    id: 'device_linux',
    name: 'Linux Devbox',
    platform: 'linux',
    status: 'idle',
    lastSync: '18 min ago',
    kind: 'system',
    transport: 'mcp',
    host: 'devbox.lan',
    capabilities: ['mcp', 'shell', 'docker'],
    connected: true,
    detail: 'MCP ops bridge',
  },
  {
    id: 'device_windows',
    name: 'Windows Workstation',
    platform: 'windows',
    status: 'offline',
    lastSync: 'Yesterday',
    kind: 'system',
    transport: 'ssh',
    host: 'win-box.lan',
    capabilities: ['ssh', 'powershell'],
    connected: false,
    detail: 'Reconnect SSH to run tasks',
  },
];

export const seedArtifacts: ArtifactItem[] = [
  {
    id: 'art_1',
    name: 'weekly-brief.html',
    kind: 'page',
    summary: 'Status summary page generated from the morning briefing task.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    revision: 1,
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Weekly brief</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #10141c; color: #f8fafc; }
      main { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
      .card { border: 1px dashed #334155; padding: 16px; margin-top: 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Weekly brief</h1>
      <p>Calendar highlights, unread digest, and follow-ups prepared for web review.</p>
      <div class="card">
        <strong>Open loops</strong>
        <p>Travel itinerary draft, WhatsApp follow-ups, and artifact polish.</p>
      </div>
    </main>
  </body>
</html>`,
  },
  {
    id: 'art_2',
    name: 'travel-outline.md',
    kind: 'note',
    summary: 'Notes and constraints for the itinerary generator.',
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    revision: 1,
    content: [
      '# Travel outline',
      '',
      '## Constraints',
      '- Prefer walkable days',
      '- Keep one buffer block each afternoon',
      '- Share final plan as an HTML page',
      '',
      '## Candidates',
      '- Morning landmark',
      '- Local lunch',
      '- Evening neighborhood walk',
    ].join('\n'),
  },
  {
    id: 'art_3',
    name: 'product-storyboard.png',
    kind: 'image',
    summary: 'Storyboard frame exported from an image skill run.',
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    revision: 1,
    content: 'Image artifact placeholder. Re-export from the image skill when needed.',
  },
  {
    id: 'art_4',
    name: 'research-deliverable.html',
    kind: 'page',
    summary: 'HTML artifact from the research → outline → page pipeline, with a shareable summary card.',
    createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    revision: 1,
    sourceSkillId: 'research-deliverable',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research deliverable</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
      main { max-width: 760px; margin: 0 auto; padding: 40px 20px; }
      .card { border: 1px dashed #334155; padding: 16px; margin-top: 18px; }
      .meta { font: 12px/1.4 ui-monospace, monospace; color: #94a3b8; letter-spacing: 0.12em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <main>
      <div class="meta">Source brief → outline → HTML → summary</div>
      <h1>Research deliverable</h1>
      <p>One-prompt pipeline output with a shareable summary card for the web workspace.</p>
      <div class="card"><strong>Shareable summary</strong><p>Key findings, open questions, and next actions in one page.</p></div>
    </main>
  </body>
</html>`,
  },
];

export const seedProviders: ProviderConnection[] = [
  { id: 'chatgpt', label: 'ChatGPT', group: 'Models', connected: false, detail: 'OAuth / API key' },
  { id: 'claude', label: 'Claude Code', group: 'Runtimes', connected: true, detail: 'Remote runtime ready' },
  { id: 'codex', label: 'Codex', group: 'Runtimes', connected: true, detail: 'Remote runtime ready' },
  { id: 'openrouter', label: 'OpenRouter', group: 'Models', connected: false, detail: 'BYO key' },
  { id: 'grok', label: 'xAI Grok', group: 'Models', connected: false, detail: 'OAuth' },
  { id: 'slack', label: 'Slack', group: 'Channels', connected: false, detail: 'Workspace channel' },
  { id: 'telegram', label: 'Telegram', group: 'Channels', connected: false, detail: 'Bot channel' },
  { id: 'whatsapp', label: 'WhatsApp', group: 'Channels', connected: false, detail: 'Android send confirmation' },
  { id: 'swiggy', label: 'Swiggy', group: 'Channels', connected: false, detail: 'Food ordering · placed on Android' },
  { id: 'ssh', label: 'SSH / MCP', group: 'Systems', connected: true, detail: 'Remote ops bridge' },
  { id: 'android', label: 'Android companion', group: 'Devices', connected: false, detail: 'Pair via code' },
];


export const seedMemory: WorkspaceMemory = {
  enabled: true,
  facts: [
    {
      id: 'mem_pref_brief',
      kind: 'preference',
      label: 'Prefer concise briefs',
      detail: 'Keep research summaries short, with sources listed at the end.',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    },
    {
      id: 'mem_project_web',
      kind: 'project',
      label: 'OpenTropic web companion',
      detail: 'Browser product stays in web/; Android remains a separate paired app.',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    },
    {
      id: 'mem_routine_morning',
      kind: 'routine',
      label: 'Morning briefing routine',
      detail: 'Notification scan + calendar digest before first meeting.',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
      id: 'mem_channel_whatsapp',
      kind: 'channel',
      label: 'WhatsApp send gate',
      detail: 'Draft in web, confirm send only on Android companion.',
      updatedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    },
    {
      id: 'mem_device_pair',
      kind: 'device',
      label: 'Android pair workflow',
      detail: 'Devices page generates a code; phone confirms before handoff tasks run.',
      updatedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    },
  ],
};

export const landingFeatures = [
  {
    title: 'Web workspace',
    body: 'Chats, skills, tasks, and artifacts in a real React app — not a static brochure page.',
  },
  {
    title: 'Android companion',
    body: 'Keep the Android app separate for device permissions, then pair it when phone-side work is needed.',
  },
  {
    title: 'Multi-runtime',
    body: 'Switch between Built-in, Claude Code, Codex, OpenCode, Qwen, and Hermes from one UI.',
  },
  {
    title: 'Local session state',
    body: 'Zustand + localStorage keep your workspace state in the browser across reloads.',
  },
  {
    title: 'Cross-channel drafts',
    body: 'Draft Slack, Telegram, and WhatsApp replies in web, then send only through the right channel or paired Android device.',
  },
  {
    title: 'Research → deliverable',
    body: 'One prompt can move from source brief to outline to HTML artifact to shareable summary.',
  },
  {
    title: 'Workspace memory',
    body: 'Remember preferences, projects, paired devices, and recent artifacts without turning into surveillance.',
  },
] as const;
