// GET /api/mcp/authorize
// OAuth 2.1 authorization endpoint. ChatGPT sends the user's browser here with
// response_type=code, client_id, redirect_uri, code_challenge (PKCE), state.
//
// OpenTropic has no server-side user login today, so this endpoint auto-approves
// and issues a short-lived, signed authorization code bound to the PKCE
// challenge and redirect_uri. To add a real consent/login screen later, render
// HTML here and only redirect with a code after the user approves.
import { json, signToken, origin, CODE_TTL_MS, SCOPE, randomUrlSafe } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.searchParams;

  const responseType = p.get('response_type');
  const redirectUri = p.get('redirect_uri') || '';
  const state = p.get('state') || '';
  const clientId = p.get('client_id') || '';
  const codeChallenge = p.get('code_challenge') || '';
  const codeChallengeMethod = p.get('code_challenge_method') || (codeChallenge ? 'S256' : '');

  if (responseType !== 'code') {
    return json(400, { error: 'unsupported_response_type' });
  }
  if (!redirectUri || !/^https?:\/\//i.test(redirectUri)) {
    return json(400, { error: 'invalid_request', error_description: 'redirect_uri must be an absolute http(s) URL.' });
  }

  // Anonymous per-authorization subject. Swap for a real user id after login.
  const sub = 'anon-' + randomUrlSafe(8);

  const code = await signToken({
    t: 'code',
    sub,
    scope: SCOPE,
    exp: Date.now() + CODE_TTL_MS,
    cc: codeChallenge,
    ccm: codeChallengeMethod,
    ruri: redirectUri,
    cid: clientId,
  });

  const dest = new URL(redirectUri);
  dest.searchParams.set('code', code);
  if (state) dest.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: { Location: dest.toString(), 'Cache-Control': 'no-store' },
  });
}
