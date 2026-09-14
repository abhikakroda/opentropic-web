// Dynamic OAuth discovery documents (RFC 8414 + RFC 9728).
//
// ChatGPT and other MCP clients probe several well-known URLs, including
// PATH-SUFFIXED variants derived from the resource path, e.g.:
//   /.well-known/oauth-protected-resource
//   /.well-known/oauth-protected-resource/api/mcp
//   /.well-known/oauth-authorization-server
//   /.well-known/oauth-authorization-server/api/mcp
//   /.well-known/openid-configuration
// Static files in public/.well-known/ only answer the exact bare paths, so the
// suffixed probes 404 and the client shows "Error fetching OAuth configuration".
// This function answers every variant. vercel.json rewrites the well-known
// paths to /api/mcp/discovery?doc=... .
import { json, origin } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const doc = url.searchParams.get('doc') || '';
  const base = origin(req);

  if (doc === 'protected-resource') {
    return json(200, {
      resource: base + '/api/mcp',
      authorization_servers: [base],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  }

  // authorization-server + openid-configuration share the same AS metadata.
  return json(200, {
    issuer: base,
    authorization_endpoint: base + '/api/mcp/authorize',
    token_endpoint: base + '/api/mcp/token',
    registration_endpoint: base + '/api/mcp/register',
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256', 'plain'],
  });
}
