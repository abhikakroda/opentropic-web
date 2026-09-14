// POST /api/mcp/register
// RFC 7591 Dynamic Client Registration. ChatGPT registers itself here before
// starting OAuth. We are open (public clients, PKCE), so we accept the request
// and echo back a generated client_id. No secret is issued (auth method: none).
import { json, randomUrlSafe, corsHeaders } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'POST') return json(405, { error: 'invalid_request', error_description: 'Use POST.' });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // ChatGPT always sends JSON; tolerate empty bodies too.
  }

  const clientId = 'ot-' + randomUrlSafe(12);
  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  return json(201, {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: redirectUris,
    client_name: typeof body.client_name === 'string' ? body.client_name : 'MCP Client',
    scope: 'mcp',
  });
}
