// OpenTropic MCP tool definitions + handlers.
//
// These are the tools ChatGPT sees after connecting. They expose the parts of
// OpenTropic that genuinely work server-side (no browser Zustand state):
//   - about_opentropic        product overview
//   - list_skills             the workspace skill catalog (filterable)
//   - plan_android_handoff    build a phone-side handoff plan for a request
//   - swiggy_tool             passthrough to the user's connected Swiggy MCP
//
// Anything that lives only in the browser localStorage workspace (a specific
// user's chats/tasks/artifacts) is NOT reachable from a server-side connector,
// so we do not pretend to expose it. The handoff/skills/product data below is
// static and lives with the deployment, mirroring web/src/data/catalog.ts.

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const PRODUCT = {
  name: 'OpenTropic',
  domain: 'opentropic.tech',
  tagline: 'AI workspace for the web, paired with Android.',
  description:
    'OpenTropic is a multi-platform web app for chats, skills, tasks, and artifacts. Pair it with the separate OpenTropic Android app when you need phone-side automation.',
  androidPackage: 'com.opentropic.app',
  routes: ['/app chat', '/app/tasks', '/app/skills', '/app/artifacts', '/app/devices', '/app/settings'],
};

interface SkillInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  androidHandoff: boolean;
}

// Mirrors web/src/data/catalog.ts seedSkills (kept in sync manually because
// edge functions bundle independently of the Vite src tree).
const SKILLS: SkillInfo[] = [
  { id: 'research', name: 'Research', category: 'Knowledge', description: 'Deep research briefs with source-aware summaries.', androidHandoff: false },
  { id: 'create-html', name: 'Create HTML', category: 'Artifacts', description: 'Generate pages and local previews from prompts.', androidHandoff: false },
  { id: 'automation', name: 'Automation', category: 'Workflow', description: 'Recurring routines with optional Android handoff.', androidHandoff: true },
  { id: 'price-drop-order', name: 'Price Drop Order', category: 'Shopping', description: 'Track a product ~3x/day and open the store on-screen to order when the INR target hits.', androidHandoff: true },
  { id: 'morning-briefing', name: 'Morning Briefing', category: 'Productivity', description: 'Scan phone notifications and build a morning digest. Runs on Android companion.', androidHandoff: true },
  { id: 'evening-briefing', name: 'Evening Briefing', category: 'Productivity', description: 'Scan phone notifications and wrap the day with tomorrow prep. Runs on Android companion.', androidHandoff: true },
  { id: 'meeting-prep', name: 'Meeting Prep', category: 'Productivity', description: 'Agenda, talking points, and follow-up cards.', androidHandoff: false },
  { id: 'remote-agent', name: 'Remote Agent', category: 'Runtimes', description: 'Claude Code and Codex sessions on remote machines.', androidHandoff: false },
  { id: 'widget-management', name: 'Widget Management', category: 'Android', description: 'Configure mobile widgets from the web, apply on phone.', androidHandoff: true },
  { id: 'draft-reply', name: 'Draft Reply', category: 'Messaging', description: 'Draft replies and send via Android companion when needed.', androidHandoff: true },
  { id: 'cross-channel-draft', name: 'Cross-channel Draft', category: 'Messaging', description: 'Draft Slack, Telegram, and WhatsApp replies in the web app, then send only through the right channel or paired Android device.', androidHandoff: true },
  { id: 'research-deliverable', name: 'Research Deliverable', category: 'Workflow', description: 'One prompt produces a source brief, outline, HTML artifact, and shareable summary.', androidHandoff: false },
  { id: 'workspace-memory', name: 'Workspace Memory', category: 'Memory', description: 'Lightweight memory over conversations, enabled skills, paired devices, and recent artifacts.', androidHandoff: false },
  { id: 'travel-planner', name: 'Travel Planner', category: 'Planning', description: 'Itineraries, maps, and shareable travel pages.', androidHandoff: false },
  { id: 'swiggy-order', name: 'Swiggy Order', category: 'Food', description: 'Draft a Swiggy food order from chat, then hand off to the paired Android app to place and pay on-screen.', androidHandoff: true },
];

type Channel = 'whatsapp' | 'telegram' | 'slack' | 'sms' | 'widget' | 'phone' | 'swiggy' | 'generic';

export const TOOLS: McpTool[] = [
  {
    name: 'about_opentropic',
    description: 'Get an overview of the OpenTropic AI workspace: what it does, its app routes, and the paired Android companion.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_skills',
    description: 'List OpenTropic workspace skills. Optionally filter by a search query or by category, or only skills that hand off to the Android companion.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive text to match in the skill name or description.' },
        category: { type: 'string', description: 'Filter to a single category, e.g. Messaging, Productivity, Food.' },
        androidOnly: { type: 'boolean', description: 'If true, only return skills that require the Android companion.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'plan_android_handoff',
    description:
      'Build a structured Android handoff plan for a natural-language request (e.g. "order biryani on Swiggy", "message Alex on WhatsApp that I am running late"). Returns the channel, action, payload, and step list the OpenTropic Android companion would run. This does NOT send anything; sending stays on the phone with user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'The user request to turn into a phone-side plan.' },
        channel: {
          type: 'string',
          enum: ['whatsapp', 'telegram', 'slack', 'sms', 'widget', 'phone', 'swiggy', 'generic'],
          description: 'Optional explicit channel; otherwise inferred from the request text.',
        },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
];

function textResult(text: string) {
  return { content: [{ type: 'text', text }] };
}

function inferChannel(request: string): Channel {
  const r = request.toLowerCase();
  if (/swiggy|biryani|food|order.*(eat|dinner|lunch)|restaurant/.test(r)) return 'swiggy';
  if (/whatsapp/.test(r)) return 'whatsapp';
  if (/telegram/.test(r)) return 'telegram';
  if (/slack/.test(r)) return 'slack';
  if (/\bsms\b|text message/.test(r)) return 'sms';
  if (/widget/.test(r)) return 'widget';
  if (/call|phone|dial/.test(r)) return 'phone';
  return 'generic';
}

function planFor(request: string, channel: Channel) {
  const base = {
    whatsapp: { action: 'Open WhatsApp and prepare the draft reply', requiresPairing: true },
    telegram: { action: 'Open Telegram and prepare the draft reply', requiresPairing: true },
    slack: { action: 'Open Slack and prepare the draft reply', requiresPairing: true },
    sms: { action: 'Open Messages and prepare the SMS draft', requiresPairing: true },
    widget: { action: 'Apply the widget configuration on the phone', requiresPairing: true },
    phone: { action: 'Prepare the phone-side action', requiresPairing: true },
    swiggy: { action: 'Draft the Swiggy order and open checkout on-screen', requiresPairing: true },
    generic: { action: 'Prepare the requested action for the companion', requiresPairing: true },
  }[channel];

  const steps = [
    'Pair the OpenTropic Android companion in Devices.',
    channel === 'swiggy'
      ? 'Companion drafts the order (restaurant, items, address, notes).'
      : 'Companion opens ' + channel + ' with the prepared draft.',
    'Review on the phone and confirm — sending/payment stays on-device.',
  ];

  return {
    title: request.slice(0, 60),
    action: base.action,
    channel,
    payload: request,
    requiresPairing: base.requiresPairing,
    steps,
  };
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'about_opentropic':
      return textResult(JSON.stringify(PRODUCT, null, 2));

    case 'list_skills': {
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
      const category = typeof args.category === 'string' ? args.category.toLowerCase() : '';
      const androidOnly = args.androidOnly === true;
      const filtered = SKILLS.filter((s) => {
        if (androidOnly && !s.androidHandoff) return false;
        if (category && s.category.toLowerCase() !== category) return false;
        if (query && !(s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))) return false;
        return true;
      });
      return textResult(JSON.stringify({ count: filtered.length, skills: filtered }, null, 2));
    }

    case 'plan_android_handoff': {
      const request = typeof args.request === 'string' ? args.request.trim() : '';
      if (!request) throw new Error('request is required');
      const channel = (typeof args.channel === 'string' ? args.channel : inferChannel(request)) as Channel;
      const plan = planFor(request, channel);
      return textResult(JSON.stringify(plan, null, 2));
    }

    default:
      throw new Error('Unknown tool: ' + name);
  }
}
