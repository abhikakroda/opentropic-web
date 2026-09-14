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

import type { SignedClaims, SwiggyLink } from './_lib';
import { callMcpTool, refreshToken as swiggyRefresh } from '../swiggy/_lib';

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

// ---- Swiggy ordering tools (call Swiggy's MCP server-side) -----------------
// These only work when the caller's OAuth token carries a linked Swiggy session
// (claims.sw), which happens when the user signed in to Swiggy during connect.
// place_food_order spends real money, so it is gated behind confirm:true and a
// prior human review of the cart + total.
const SWIGGY_TOOLS: McpTool[] = [
  {
    name: 'swiggy_status',
    description: 'Check whether this ChatGPT connection is linked to a Swiggy account and can place food orders.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'swiggy_search_restaurants',
    description: 'Search Swiggy for restaurants or dishes near the user (e.g. "biryani", "pizza near me"). Returns matching restaurants.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "biryani", "McDonald\'s", "north indian".' },
        location: { type: 'string', description: 'Optional area/address hint, e.g. "Koramangala, Bengaluru".' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'swiggy_restaurant_menu',
    description: 'Get the menu for a specific Swiggy restaurant by its id (from swiggy_search_restaurants).',
    inputSchema: {
      type: 'object',
      properties: { restaurant_id: { type: 'string', description: 'The Swiggy restaurant id.' } },
      required: ['restaurant_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'swiggy_manage_cart',
    description: 'Add or remove items in the Swiggy cart, or view the current cart and running total. Does NOT place the order or pay.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove', 'view', 'clear'], description: 'Cart operation.' },
        restaurant_id: { type: 'string', description: 'Restaurant id (required for add).' },
        item_id: { type: 'string', description: 'Menu item id (required for add/remove).' },
        quantity: { type: 'number', description: 'Quantity for add/remove (default 1).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'swiggy_place_order',
    description:
      'Place the current Swiggy cart as a real order and pay. SPENDS REAL MONEY. You MUST first show the user the full cart and total and get an explicit yes, then call this with confirm:true. Without confirm:true it will refuse.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Must be true. Only set after the user has reviewed the cart + total and said yes.' },
        address_id: { type: 'string', description: 'Optional saved delivery address id.' },
        payment_method: { type: 'string', description: 'Optional payment method hint (e.g. "cod", "upi"). Defaults to the account default.' },
      },
      required: ['confirm'],
      additionalProperties: false,
    },
  },
];

for (const t of SWIGGY_TOOLS) TOOLS.push(t);

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

// Resolve a live Swiggy access token from the caller's linked session,
// refreshing if it is expired/near-expiry. Returns null when not linked.
async function swiggyToken(sw: SwiggyLink | undefined): Promise<string | null> {
  if (!sw || !sw.at) return null;
  if ((sw.exp || 0) > Date.now() + 60_000) return sw.at;
  // Access token expired — try to refresh. (The refreshed token is not
  // re-persisted into the caller's OAuth token here; it is used for this call.
  // ChatGPT holds a 30-day OAuth token, and Swiggy tokens are long-lived, so in
  // practice this rarely triggers within a session.)
  if (sw.rt && sw.cid) {
    try {
      const r = await swiggyRefresh(sw.cid, sw.rt);
      return r.access_token || null;
    } catch {
      return null;
    }
  }
  return sw.at || null;
}

function notLinked() {
  return textResult(
    JSON.stringify(
      {
        error: 'swiggy_not_linked',
        message:
          'This ChatGPT connection is not linked to a Swiggy account. Re-connect the OpenTropic connector and sign in to Swiggy when prompted, then try again.',
      },
      null,
      2,
    ),
  );
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  claims?: SignedClaims,
): Promise<unknown> {
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

    case 'swiggy_status': {
      const sw = claims?.sw;
      const linked = !!(sw && sw.at);
      return textResult(
        JSON.stringify(
          {
            linked,
            expiresAt: sw?.exp || 0,
            message: linked
              ? 'Swiggy is linked. You can search restaurants, build a cart, and place orders (with confirmation).'
              : 'Swiggy is not linked to this connection. Re-connect the connector and sign in to Swiggy when prompted.',
          },
          null,
          2,
        ),
      );
    }

    case 'swiggy_search_restaurants': {
      const token = await swiggyToken(claims?.sw);
      if (!token) return notLinked();
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) throw new Error('query is required');
      const toolArgs: Record<string, unknown> = { query };
      if (typeof args.location === 'string' && args.location.trim()) toolArgs.location = args.location.trim();
      const result = await callMcpTool('food', token, 'search_restaurants', toolArgs);
      return textResult(JSON.stringify(result, null, 2));
    }

    case 'swiggy_restaurant_menu': {
      const token = await swiggyToken(claims?.sw);
      if (!token) return notLinked();
      const restaurantId = typeof args.restaurant_id === 'string' ? args.restaurant_id : '';
      if (!restaurantId) throw new Error('restaurant_id is required');
      const result = await callMcpTool('food', token, 'get_menu', { restaurant_id: restaurantId });
      return textResult(JSON.stringify(result, null, 2));
    }

    case 'swiggy_manage_cart': {
      const token = await swiggyToken(claims?.sw);
      if (!token) return notLinked();
      const action = typeof args.action === 'string' ? args.action : '';
      const map: Record<string, string> = {
        add: 'add_to_cart',
        remove: 'remove_from_cart',
        view: 'view_cart',
        clear: 'clear_cart',
      };
      const swiggyTool = map[action];
      if (!swiggyTool) throw new Error('action must be one of add, remove, view, clear');
      const toolArgs: Record<string, unknown> = {};
      if (typeof args.restaurant_id === 'string') toolArgs.restaurant_id = args.restaurant_id;
      if (typeof args.item_id === 'string') toolArgs.item_id = args.item_id;
      if (typeof args.quantity === 'number') toolArgs.quantity = args.quantity;
      const result = await callMcpTool('food', token, swiggyTool, toolArgs);
      return textResult(JSON.stringify(result, null, 2));
    }

    case 'swiggy_place_order': {
      const token = await swiggyToken(claims?.sw);
      if (!token) return notLinked();
      // Money guardrail: refuse unless the model explicitly confirms after a
      // human review of the cart + total.
      if (args.confirm !== true) {
        return textResult(
          JSON.stringify(
            {
              error: 'confirmation_required',
              message:
                'Refusing to place the order. First call swiggy_manage_cart with action "view" to show the user the exact items and total, get an explicit yes, then call swiggy_place_order again with confirm:true.',
            },
            null,
            2,
          ),
        );
      }
      const toolArgs: Record<string, unknown> = {};
      if (typeof args.address_id === 'string') toolArgs.address_id = args.address_id;
      if (typeof args.payment_method === 'string') toolArgs.payment_method = args.payment_method;
      const result = await callMcpTool('food', token, 'place_food_order', toolArgs);
      return textResult(JSON.stringify(result, null, 2));
    }

    default:
      throw new Error('Unknown tool: ' + name);
  }
}
