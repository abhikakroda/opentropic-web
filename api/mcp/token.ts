// POST /api/mcp/token
// OAuth 2.1 token endpoint. Handles:
//   grant_type=authorization_code  -> verify PKCE + code, issue access token.
//   grant_type=refresh_token       -> verify refresh token, issue a fresh one.
// Access + refresh tokens are self-contained signed tokens (no server storage).
import {
  json,
  corsHeaders,
  signToken,
  verifyToken,
  verifyPkce,
  ACCESS_TTL_MS,
  SCOPE,
} from './_lib';
import type { SwiggyLink } from './_lib';

export const config = { runtime: 'edge' };

async function readForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return (await req.json()) as Record<string, string>;
    } catch {
      return {};
    }
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

async function issueTokens(sub: string, sw?: SwiggyLink) {
  const now = Date.now();
  const access = await signToken({ t: 'access', sub, scope: SCOPE, exp: now + ACCESS_TTL_MS, sw });
  // Refresh token is an access-shaped token with a longer life; the endpoint
  // reissues from it. Kept simple and stateless on purpose.
  const refresh = await signToken({ t: 'access', sub, scope: SCOPE, exp: now + ACCESS_TTL_MS * 6, sw });
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope: SCOPE,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return json(405, { error: 'invalid_request', error_description: 'Use POST.' });

  const form = await readForm(req);
  const grant = form.grant_type;

  if (grant === 'authorization_code') {
    const code = form.code || '';
    const verifier = form.code_verifier || '';
    const redirectUri = form.redirect_uri || '';

    const claims = await verifyToken(code);
    if (!claims || claims.t !== 'code') {
      return json(400, { error: 'invalid_grant', error_description: 'Authorization code is invalid or expired.' });
    }
    if (claims.ruri && redirectUri && claims.ruri !== redirectUri) {
      return json(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch.' });
    }
    if (!(await verifyPkce(verifier, claims.cc || '', claims.ccm))) {
      return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed.' });
    }
    return json(200, await issueTokens(claims.sub, claims.sw));
  }

  if (grant === 'refresh_token') {
    const claims = await verifyToken(form.refresh_token);
    if (!claims || claims.t !== 'access') {
      return json(400, { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' });
    }
    return json(200, await issueTokens(claims.sub, claims.sw));
  }

  return json(400, { error: 'unsupported_grant_type' });
}
