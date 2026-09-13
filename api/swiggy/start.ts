// GET /api/swiggy/start
// Begins the Swiggy OAuth flow server-side: registers a client (if needed),
// creates PKCE + state, stores them in a signed cookie, and 302-redirects the
// browser to Swiggy's authorize page. After the user signs in, Swiggy redirects
// to https://opentropic.app/auth/callback/swiggy which forwards to
// /api/swiggy/callback to complete the token exchange.

import {
  registerClient,
  randomUrlSafe,
  pkceChallenge,
  sealSession,
  setCookieHeader,
  MCP_BASE,
  REDIRECT_URI,
  SCOPE,
  type SwiggySession,
} from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(_req: Request): Promise<Response> {
  try {
    const clientId = await registerClient();
    const verifier = randomUrlSafe(48);
    const challenge = await pkceChallenge(verifier);
    const state = randomUrlSafe(24);

    const session: SwiggySession = { clientId, verifier, state };
    const cookie = await sealSession(session);

    const authUrl = new URL(MCP_BASE + '/auth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', SCOPE);

    const headers = new Headers();
    headers.set('Location', authUrl.toString());
    headers.set('Cache-Control', 'no-store');
    // Signed session cookie (httpOnly) holds PKCE + state during login.
    headers.append('Set-Cookie', setCookieHeader(cookie, 600));
    // Readable marker so the shared /auth/callback/swiggy page knows this is the
    // WEB flow (forward to /api/swiggy/callback) rather than the Android deep link.
    headers.append('Set-Cookie', 'ot_swiggy_web=1; Path=/; Secure; SameSite=Lax; Max-Age=600');
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'start failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
