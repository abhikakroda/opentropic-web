// Shared server-side helpers for Swiggy MCP integration (Vercel edge runtime).
// Mirrors the Android SwiggyIntegration.kt contract: dynamic client registration,
// OAuth 2.1 + PKCE, token exchange, then MCP tool calls over streamable HTTP.
//
// Because Vercel functions are stateless, we carry the Swiggy session (PKCE
// verifier + state during login, then access/refresh tokens after) inside a
// signed, httpOnly cookie. The cookie is HMAC-signed with SWIGGY_COOKIE_SECRET
// so the browser can hold it but cannot forge it.

export const MCP_BASE = 'https://mcp.swiggy.com';
export const REDIRECT_URI = 'https://opentropic.app/auth/callback/swiggy';
// All redirect URIs OpenTropic uses, declared at client registration so Swiggy
// can whitelist every surface. REDIRECT_URI above stays the canonical one we
// actually send users back to for the web sign-in flow.
export const ALL_REDIRECT_URIS = [
  'https://opentropic.app/auth/callback/swiggy',
  'https://www.opentropic.app/auth/callback/swiggy',
  'opentropic://auth/callback/swiggy',
];
export const SCOPE = 'mcp:tools mcp:resources mcp:prompts';
export const COOKIE_NAME = 'ot_swiggy';

function secret(): string {
  // Set SWIGGY_COOKIE_SECRET in Vercel env. Fallback keeps local dev working.
  return (globalThis as any).process?.env?.SWIGGY_COOKIE_SECRET || 'opentropic-dev-secret-change-me';
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}

export interface SwiggySession {
  clientId?: string;
  verifier?: string; // PKCE, only during login
  state?: string; // CSRF, only during login
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
}

export async function sealSession(session: SwiggySession): Promise<string> {
  const payload = b64urlFromBytes(enc.encode(JSON.stringify(session)));
  const sig = await hmac(payload);
  return payload + '.' + sig;
}

export async function openSession(cookieValue: string | undefined | null): Promise<SwiggySession> {
  if (!cookieValue) return {};
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return {};
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = await hmac(payload);
  if (sig !== expected) return {}; // tampered
  try {
    return JSON.parse(dec.decode(bytesFromB64url(payload))) as SwiggySession;
  } catch {
    return {};
  }
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setCookieHeader(value: string, maxAgeSeconds: number): string {
  const attrs = [
    COOKIE_NAME + '=' + encodeURIComponent(value),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds,
  ];
  return attrs.join('; ');
}

// PKCE
export function randomUrlSafe(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64urlFromBytes(arr);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64urlFromBytes(new Uint8Array(digest));
}

// Swiggy's MCP gateway currently issues the same static client_id to every
// caller ("swiggy-mcp"). Dynamic registration is best-effort: if it succeeds we
// use whatever client_id comes back, but if the register call is unreachable or
// returns a non-JSON page (edge networks sometimes get an HTML challenge), we
// fall back to the known static id so the login flow still works.
export const STATIC_CLIENT_ID = 'swiggy-mcp';

export async function registerClient(): Promise<string> {
  try {
    const res = await fetch(MCP_BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'OpenTropic Web',
        redirect_uris: ALL_REDIRECT_URIS,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: SCOPE,
      }),
    });
    const text = await res.text();
    if (res.ok || res.status === 201) {
      try {
        const json = JSON.parse(text);
        if (json && typeof json.client_id === 'string') return json.client_id;
      } catch {
        // non-JSON success body — fall through to static id
      }
    }
  } catch {
    // network error — fall through to static id
  }
  return STATIC_CLIENT_ID;
}

export async function exchangeCode(
  clientId: string,
  code: string,
  verifier: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(MCP_BASE + '/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
    }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('token exchange returned non-JSON (' + res.status + '): ' + text.slice(0, 200));
  }
  if (!res.ok) throw new Error('token exchange failed: ' + JSON.stringify(json));
  return json;
}

export async function refreshToken(
  clientId: string,
  refresh: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(MCP_BASE + '/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('refresh returned non-JSON (' + res.status + '): ' + text.slice(0, 200));
  }
  if (!res.ok) throw new Error('refresh failed: ' + JSON.stringify(json));
  return json;
}

// Ensure a valid token; refresh if near expiry. Returns updated session + token.
export async function ensureToken(session: SwiggySession): Promise<{ token: string; session: SwiggySession }> {
  if (session.accessToken && (session.expiresAt || 0) > Date.now() + 60_000) {
    return { token: session.accessToken, session };
  }
  if (session.refreshToken && session.clientId) {
    const r = await refreshToken(session.clientId, session.refreshToken);
    const next: SwiggySession = {
      ...session,
      accessToken: r.access_token,
      refreshToken: r.refresh_token || session.refreshToken,
      expiresAt: Date.now() + (r.expires_in || 432000) * 1000,
    };
    return { token: r.access_token, session: next };
  }
  return { token: session.accessToken || '', session };
}

// Call a Swiggy MCP tool over streamable HTTP. server: 'food' | 'im' | 'dineout'.
// Handles the JSON-RPC initialize handshake implicitly (Swiggy accepts tools/call
// with a valid bearer without a separate persistent session for these calls).
export async function callMcpTool(
  server: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(MCP_BASE + '/' + server, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error('MCP ' + name + ' failed (' + res.status + '): ' + raw.slice(0, 300));

  // Response may be JSON or SSE (text/event-stream). Extract the JSON-RPC result.
  const parsed = parseMcpResponse(raw);
  if (parsed?.error) throw new Error('MCP ' + name + ' error: ' + JSON.stringify(parsed.error));
  return parsed?.result;
}

function parseMcpResponse(raw: string): any {
  const trimmed = raw.trim();
  // Try plain JSON first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // SSE: find the last "data:" line carrying a JSON-RPC message.
    const lines = trimmed.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('data:')) {
        const body = line.slice(5).trim();
        if (body && body !== '[DONE]') {
          try {
            return JSON.parse(body);
          } catch {
            /* keep scanning */
          }
        }
      }
    }
  }
  return null;
}
