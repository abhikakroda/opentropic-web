// Vercel serverless proxy for OpenAI-compatible providers.
// Browsers block direct calls to providers that don't send CORS headers
// (e.g. Baseten inference endpoints), surfacing as "Failed to fetch".
// This runs server-side where CORS does not apply, forwarding the request
// to the user-supplied provider URL and relaying the response back.
//
// Contract (used by web/src/lib/apiClient.ts):
//   POST /api/llm
//   body: { url: string, method: 'GET'|'POST', headers?: Record<string,string>, body?: string }
//   -> streams/relays the provider response (status + body) back to the browser.
//
// Only https provider URLs are allowed. The Authorization header (Bearer key)
// is forwarded but never logged.

export const config = { runtime: 'edge' };

interface ProxyPayload {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return json(405, { error: { message: 'Use POST.' } });
  }

  let payload: ProxyPayload;
  try {
    payload = (await req.json()) as ProxyPayload;
  } catch {
    return json(400, { error: { message: 'Invalid proxy request body.' } });
  }

  const target = (payload.url || '').trim();
  if (!/^https:\/\//i.test(target)) {
    return json(400, { error: { message: 'Provider URL must be absolute https.' } });
  }

  const method = (payload.method || 'GET').toUpperCase();
  const forwardHeaders = new Headers();
  const incoming = payload.headers || {};
  for (const key of Object.keys(incoming)) {
    // Only forward safe, expected headers.
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'content-type' || lower === 'http-referer' || lower === 'x-title') {
      forwardHeaders.set(key, incoming[key]);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: forwardHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : payload.body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed.';
    return json(502, { error: { message: 'Provider unreachable: ' + message } });
  }

  // Relay body (works for JSON and SSE streams) with the upstream status.
  const responseHeaders = new Headers(corsHeaders());
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('Content-Type', contentType);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
