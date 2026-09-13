// POST /api/swiggy/mcp   body: { tool: string, args?: object, server?: 'food'|'im'|'dineout' }
// Authenticated Swiggy MCP tool caller. Reads the Swiggy token from the signed
// cookie, refreshes if needed, calls the requested tool server-side (no browser
// CORS), and returns the tool result. Also supports { tool: '__status' } to
// report whether the browser is connected to Swiggy.
//
// GUARDRAIL: place_food_order (the only tool that spends money / places a real
// order) requires an explicit { confirm: true } in the body. Without it, the
// endpoint refuses so the UI can force a human confirmation step first.

import {
  openSession,
  sealSession,
  readCookie,
  setCookieHeader,
  ensureToken,
  callMcpTool,
  COOKIE_NAME,
} from './_lib';

export const config = { runtime: 'edge' };

function json(status: number, data: unknown, cookie?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}

const ORDER_TOOL = 'place_food_order';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  let body: { tool?: string; args?: Record<string, unknown>; server?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const session = await openSession(readCookie(req, COOKIE_NAME));
  const connected = !!session.accessToken && (session.expiresAt || 0) > Date.now();

  if (body.tool === '__status') {
    return json(200, { connected, expiresAt: session.expiresAt || 0 });
  }

  if (!session.accessToken) {
    return json(401, { error: 'not_connected', message: 'Connect Swiggy first.' });
  }

  const tool = (body.tool || '').trim();
  if (!tool) return json(400, { error: 'Missing tool name.' });

  // Money guardrail: never place a real order without explicit confirmation.
  if (tool === ORDER_TOOL && !body.confirm) {
    return json(403, {
      error: 'confirmation_required',
      message: 'place_food_order needs { confirm: true }. Show the cart + total to the user and get a yes first.',
    });
  }

  const server = body.server || 'food';
  try {
    const { token, session: refreshed } = await ensureToken(session);
    if (!token) return json(401, { error: 'not_connected' });

    const result = await callMcpTool(server, token, tool, body.args || {});

    // Persist a refreshed token if it changed.
    let cookie: string | undefined;
    if (refreshed.accessToken !== session.accessToken) {
      cookie = setCookieHeader(await sealSession(refreshed), Math.max(60, Math.floor(((refreshed.expiresAt || 0) - Date.now()) / 1000)));
    }
    return json(200, { ok: true, tool, result }, cookie);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mcp_call_failed';
    return json(502, { error: 'mcp_error', message });
  }
}
