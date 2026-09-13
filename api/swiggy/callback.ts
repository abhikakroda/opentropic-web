// GET /api/swiggy/callback?code=...&state=...
// Completes the Swiggy OAuth flow: validates state against the signed cookie,
// exchanges the authorization code for tokens (PKCE), stores the tokens in the
// signed cookie, and redirects the user back into the web app (Settings) with a
// success flag. Errors redirect back with an error flag.

import {
  openSession,
  sealSession,
  readCookie,
  setCookieHeader,
  exchangeCode,
  COOKIE_NAME,
  type SwiggySession,
} from './_lib';

export const config = { runtime: 'edge' };

function redirect(to: string, cookie?: string): Response {
  const headers: Record<string, string> = { Location: to, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 302, headers });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const oauthError = url.searchParams.get('error');

  const appBase = url.origin;

  if (oauthError) {
    return redirect(appBase + '/settings?swiggy=error&reason=' + encodeURIComponent(oauthError));
  }

  const session = await openSession(readCookie(req, COOKIE_NAME));
  if (!session.state || session.state !== state) {
    return redirect(appBase + '/settings?swiggy=error&reason=state_mismatch');
  }
  if (!code || !session.clientId || !session.verifier) {
    return redirect(appBase + '/settings?swiggy=error&reason=missing_code');
  }

  try {
    const tokens = await exchangeCode(session.clientId, code, session.verifier);
    const next: SwiggySession = {
      clientId: session.clientId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 432000) * 1000,
    };
    const cookie = await sealSession(next);
    return redirect(
      appBase + '/settings?swiggy=connected',
      setCookieHeader(cookie, tokens.expires_in || 432000),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'token_exchange_failed';
    return redirect(appBase + '/settings?swiggy=error&reason=' + encodeURIComponent(reason.slice(0, 120)));
  }
}
