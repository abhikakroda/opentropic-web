// /api/mcp  — OpenTropic's MCP server for ChatGPT (streamable HTTP transport).
//
// This is the "Server URL" you paste into ChatGPT's Custom connector screen:
//   https://<your-domain>/api/mcp
//
// Transport: MCP streamable HTTP. ChatGPT POSTs JSON-RPC 2.0 messages here and
// accepts either application/json or text/event-stream. We reply with plain
// JSON (a single response), which is a valid streamable-HTTP response.
//
// Auth: OAuth Bearer. If the Authorization header is missing/invalid we return
// 401 with a WWW-Authenticate header pointing at the protected-resource
// metadata, which triggers ChatGPT's OAuth flow (authorize -> token).
import { json, corsHeaders, verifyToken, origin } from './_lib';
import { TOOLS, callTool } from './tools';
import type { SignedClaims } from './_lib';

export const config = { runtime: 'edge' };

const PROTOCOL_VERSION = '2025-06-18';

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function unauthorized(req: Request): Response {
  const base = origin(req);
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'WWW-Authenticate':
        'Bearer resource_metadata="' + base + '/.well-known/oauth-protected-resource"',
      ...corsHeaders(),
    },
  });
}

async function handleRpc(msg: any, claims: SignedClaims): Promise<unknown | null> {
  const { id, method, params } = msg || {};

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'OpenTropic', version: '1.0.0' },
        instructions:
          'OpenTropic MCP server. Use about_opentropic for an overview and list_skills to browse workspace skills. ' +
          'For food: first call swiggy_status to confirm Swiggy is linked. To discover the exact Swiggy tools + argument names, call swiggy_list_tools, then use swiggy_call_tool to search restaurants, open menus, and build the cart. ' +
          '(swiggy_search_restaurants / swiggy_restaurant_menu / swiggy_manage_cart are convenience wrappers but the real tool names may differ, so prefer swiggy_list_tools + swiggy_call_tool.) ' +
          'swiggy_place_order places a REAL paid order. ' +
          'Before placing an order you MUST show the user the cart + total (swiggy_manage_cart action:view), get an explicit yes, then call swiggy_place_order with confirm:true. ' +
          'plan_android_handoff turns other requests (WhatsApp, Telegram, etc.) into a phone-side plan without sending.',
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications get no response

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });

    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments || {};
      if (!name) return rpcError(id, -32602, 'Missing tool name.');
      try {
        const result = await callTool(name, args, claims);
        return rpcResult(id, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'tool_failed';
        // MCP convention: tool errors are surfaced in the result with isError.
        return rpcResult(id, { content: [{ type: 'text', text: 'Error: ' + message }], isError: true });
      }
    }

    default:
      if (id === undefined) return null; // unknown notification
      return rpcError(id, -32601, 'Method not found: ' + method);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  // A GET to /api/mcp is used by some clients to open an SSE stream. We do not
  // push server-initiated events, so return 405 to signal POST-only JSON-RPC.
  if (req.method === 'GET') {
    return json(405, { error: 'method_not_allowed', message: 'This MCP server uses POST JSON-RPC.' });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  // Auth gate.
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
  const claims = await verifyToken(bearer);
  if (!claims || claims.t !== 'access') {
    return unauthorized(req);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, rpcError(null, -32700, 'Parse error'));
  }

  // JSON-RPC may arrive as a single message or a batch.
  if (Array.isArray(payload)) {
    const responses = [];
    for (const msg of payload) {
      const r = await handleRpc(msg, claims);
      if (r !== null) responses.push(r);
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: corsHeaders() });
    return json(200, responses);
  }

  const response = await handleRpc(payload, claims);
  if (response === null) return new Response(null, { status: 202, headers: corsHeaders() });
  return json(200, response);
}
