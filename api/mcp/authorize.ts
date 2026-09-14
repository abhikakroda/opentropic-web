// GET /api/mcp/authorize
// OAuth 2.1 authorization endpoint. ChatGPT sends the user's browser here with
// response_type=code, client_id, redirect_uri, code_challenge (PKCE), state.
//
// To let ChatGPT actually order Swiggy, we chain Swiggy's OAuth into ours:
// instead of auto-approving anonymously, we send the browser to Swiggy to sign
// in. Swiggy redirects back to /api/mcp/swiggy-callback, which mints OUR
// authorization code with the Swiggy tokens embedded. The server-side /api/mcp
// endpoint can then call Swiggy without a browser cookie (ChatGPT is
// machine-to-machine).
//
// If Swiggy linking cannot start, we fall back to an anonymous code so the base
// connector still works.
import { json, signToken, origin, CODE_TTL_MS, SCOPE, randomUrlSafe } from './_lib';
import {
  registerClient as swiggyRegister,
  randomUrlSafe as swRandom,
  pkceChallenge as swPkce,
  MCP_BASE as SWIGGY_BASE,
  SCOPE as SWIGGY_SCOPE,
} from '../swiggy/_lib';

export const config = { runtime: 'edge' };

// Where Swiggy returns the user after login (dedicated server endpoint so the
// ChatGPT flow does not depend on the SPA callback page).
function swiggyRedirectUri(base: string): string {
  return base + '/api/mcp/swiggy-callback';
}

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

  const base = origin(req);

  // Try to start the Swiggy sign-in chain. Everything we need to finish the
  // exchange later rides inside a single signed 'link' token used as Swiggy's
  // OAuth state, so nothing can be forged or tampered.
  try {
    const swClientId = await swiggyRegister();
    const swVerifier = swRandom(48);
    const swChallenge = await swPkce(swVerifier);

    const linkState = await signToken({
      t: 'code',
      sub: 'link-' + randomUrlSafe(6),
      scope: SCOPE,
      exp: Date.now() + CODE_TTL_MS,
      cc: codeChallenge,
      ccm: codeChallengeMethod,
      ruri: redirectUri,
      cid: clientId,
      cs: state,
      sv: swVerifier,
      scid: swClientId,
    });

    const authUrl = new URL(SWIGGY_BASE + '/auth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', swClientId);
    authUrl.searchParams.set('redirect_uri', swiggyRedirectUri(base));
    authUrl.searchParams.set('code_challenge', swChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', linkState);
    authUrl.searchParams.set('scope', SWIGGY_SCOPE);

    return new Response(null, {
      status: 302,
      headers: { Location: authUrl.toString(), 'Cache-Control': 'no-store' },
    });
  } catch {
    // Fall back to an anonymous code so the base connector still works.
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
}
