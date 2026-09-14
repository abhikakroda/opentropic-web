# OpenTropic MCP server (for ChatGPT & other MCP clients)

This makes OpenTropic an **MCP server** that ChatGPT connects to via its
"Custom connector" screen (Server URL + OAuth). It is the mirror of
`api/swiggy/` (where OpenTropic is a *client* of Swiggy's MCP).

## Add it in ChatGPT

- **Name:** OpenTropic
- **Description:** OpenTropic workspace skills + Android handoff planning
- **Connection:** Server URL
- **Server URL:** `https://YOUR-DOMAIN/api/mcp`  (e.g. https://opentropic.app/api/mcp)
- **Authentication:** OAuth

ChatGPT auto-discovers register/authorize/token from the `.well-known`
documents. Tick "I understand and want to continue" and connect.

## Endpoints

| Route | Purpose |
|-------|---------|
| `POST /api/mcp` | MCP JSON-RPC (initialize, tools/list, tools/call). Bearer-gated. |
| `/.well-known/oauth-protected-resource` | RFC 9728 - static JSON in public/.well-known/. |
| `/.well-known/oauth-authorization-server` | RFC 8414 - static JSON in public/.well-known/. |
| `POST /api/mcp/register` | RFC 7591 dynamic client registration. |
| `GET /api/mcp/authorize` | OAuth 2.1 authorization endpoint (issues signed PKCE code). |
| `POST /api/mcp/token` | OAuth 2.1 token endpoint (authorization_code + refresh_token). |

## Tools exposed

- `about_opentropic` - product overview.
- `list_skills` - workspace skill catalog (filter by query/category/androidOnly).
- `plan_android_handoff` - turn a request into a phone-side handoff plan (channel, action, steps). Does not send; sending/payment stays on-device.

## Configuration

Set one Vercel env var so tokens are signed with a real secret:

```
MCP_TOKEN_SECRET=<long random string>
```

Without it, a dev fallback secret is used (fine for local, not production).

## Design notes / honest boundaries

- **Auto-approve consent.** `/authorize` currently issues a code for an anonymous subject without a login screen, because OpenTropic has no server-side user auth today. To gate on a real user, render a consent/login page in `authorize.ts` and only redirect with a code after approval.
- **No browser workspace access.** A user's chats/tasks/artifacts live in the browser (Zustand + localStorage), which a server-side connector cannot read. So the tools here only expose data that genuinely exists server-side (static skill catalog + handoff planning). Wire a real backend/store to expose per-user workspace data later.
- **Swiggy is intentionally not exposed** through this connector: Swiggy tokens live in the browser httpOnly cookie for the web sign-in flow, not in the ChatGPT connection.
- Tokens are stateless signed blobs (HMAC-SHA256). Revocation is time-based (30-day access, 180-day refresh); rotate `MCP_TOKEN_SECRET` to invalidate everything.

