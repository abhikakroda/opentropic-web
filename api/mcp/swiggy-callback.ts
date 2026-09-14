// GET /api/mcp/swiggy-callback?code=...&state=...
// Swiggy redirects the user here after they sign in during the chained OAuth
// flow started by /api/mcp/authorize. We:
//   1. Verify our signed 'link' state (carries the ChatGPT redirect_uri, PKCE
//      challenge, upstream state, and the Swiggy PKCE verifier + client_id).
//   2. Exchange the Swiggy authorization code for Swiggy tokens (PKCE).
//   3. Mint OUR authorization code with the Swiggy tokens embedded (sw), bound
//      to ChatGPT's PKCE challenge + redirect_uri.
//   4. Redirect back to ChatGPT's redirect_uri with our code + original state.
//
// If Swiggy sign-in fails, we still mint an anonymous code (no sw) so the
// connector connects; Swiggy tools will then report not_connected until the
// user links Swiggy.
import { signToken, verifyToken, origin, CODE_TTL_MS, SCOPE, randomUrlSafe } from './_lib';
import { exchangeCode as swiggyExchange } from '../swiggy/_lib';

export const config = { runtime: 'edge' };

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const swCode = url.searchParams.get('code') || '';
  const linkState = url.searchParams.get('state') || '';
  const swError = url.searchParams.get('error') || '';

  const link = await verifyToken(linkState);
  if (!link || !link.ruri) {
    // Without a valid link we cannot know where to send the user back.
    return new Response('Invalid or expired authorization state.', { status: 400 });
  }

  const base = origin(req);
  const chatgptRedirect = new URL(link.ruri);

  async function mintCode(sw?: { cid: string; at: string; rt?: string; exp: number }) {
    return signToken({
      t: 'code',
      sub: sw ? 'swiggy-' + randomUrlSafe(6) : 'anon-' + randomUrlSafe(8),
      scope: SCOPE,
      exp: Date.now() + CODE_TTL_MS,
      cc: link!.cc,
      ccm: link!.ccm,
      ruri: link!.ruri,
      cid: link!.cid,
      sw,
    });
  }

  // If Swiggy returned an error or no code, connect anonymously.
  if (swError || !swCode || !link.sv || !link.scid) {
    const code = await mintCode(undefined);
    chatgptRedirect.searchParams.set('code', code);
    if (link.cs) chatgptRedirect.searchParams.set('state', link.cs);
    return redirect(chatgptRedirect.toString());
  }

  try {
    const tokens = await swiggyExchange(link.scid, swCode, link.sv);
    const sw = {
      cid: link.scid,
      at: tokens.access_token,
      rt: tokens.refresh_token,
      exp: Date.now() + (tokens.expires_in || 432000) * 1000,
    };
    const code = await mintCode(sw);
    chatgptRedirect.searchParams.set('code', code);
    if (link.cs) chatgptRedirect.searchParams.set('state', link.cs);
    return redirect(chatgptRedirect.toString());
  } catch {
    // Swiggy exchange failed — still connect anonymously so ChatGPT succeeds.
    const code = await mintCode(undefined);
    chatgptRedirect.searchParams.set('code', code);
    if (link.cs) chatgptRedirect.searchParams.set('state', link.cs);
    return redirect(chatgptRedirect.toString());
  }
}
