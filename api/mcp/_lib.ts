// Shared helpers for the OpenTropic ChatGPT-facing MCP server (Vercel edge).
//
// This makes OpenTropic *itself* an MCP server that ChatGPT (or any MCP client)
// connects to — the mirror image of api/swiggy, where OpenTropic is a client of
// Swiggy. ChatGPT's "Custom connector" screen expects:
//   1. A Server URL (our /api/mcp endpoint, streamable HTTP JSON-RPC).
//   2. OAuth — so we act as a minimal OAuth 2.1 authorization server here.
//
// Because Vercel functions are stateless we avoid server-side session storage:
//   - Authorization codes are short-lived signed tokens (self-contained).
//   - Access tokens are signed too, carrying who the user is + scope + expiry.
// Everything is HMAC-signed with MCP_TOKEN_SECRET so nothing can be forged.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function tokenSecret(): string {
  return (globalThis as any).process?.env?.MCP_TOKEN_SECRET || 'opentropic-mcp-dev-secret-change-me';
}

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
    enc.encode(tokenSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}

// A signed, self-contained token: base64url(payload).signature
export interface SignedClaims {
  t: 'code' | 'access';
  sub: string; // subject / user id (anonymous per-connection is fine)
  scope: string;
  exp: number; // epoch ms
  // Present only for authorization codes so PKCE is verified at the token endpoint.
  cc?: string; // code_challenge
  ccm?: string; // code_challenge_method
  ruri?: string; // redirect_uri the code was issued for
  cid?: string; // client_id
}

export async function signToken(claims: SignedClaims): Promise<string> {
  const payload = b64urlFromBytes(enc.encode(JSON.stringify(claims)));
  const sig = await hmac(payload);
  return payload + '.' + sig;
}

export async function verifyToken(value: string | undefined | null): Promise<SignedClaims | null> {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if ((await hmac(payload)) !== sig) return null;
  try {
    const claims = JSON.parse(dec.decode(bytesFromB64url(payload))) as SignedClaims;
    if (!claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function randomUrlSafe(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64urlFromBytes(arr);
}

// PKCE S256 verification (ChatGPT uses PKCE by default).
export async function verifyPkce(
  verifier: string,
  challenge: string,
  method: string | undefined,
): Promise<boolean> {
  if (!challenge) return true; // no PKCE was requested
  if ((method || 'plain') === 'plain') return verifier === challenge;
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64urlFromBytes(new Uint8Array(digest)) === challenge;
}

export function origin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return proto + '://' + host;
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  };
}

export function json(status: number, data: unknown, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(), ...(extra || {}) },
  });
}

export const ACCESS_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const CODE_TTL_MS = 1000 * 60 * 5; // 5 minutes
export const SCOPE = 'mcp';
