// Client-side helper for the server-backed Swiggy integration.
// All Swiggy calls go through our own /api/swiggy/* endpoints, which hold the
// OAuth token in a signed httpOnly cookie and talk to Swiggy's MCP server-side.

export interface SwiggyStatus {
  connected: boolean;
  expiresAt: number;
}

export async function swiggyStatus(): Promise<SwiggyStatus> {
  try {
    const res = await fetch('/api/swiggy/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: '__status' }),
    });
    if (!res.ok) return { connected: false, expiresAt: 0 };
    const json = await res.json();
    return { connected: !!json.connected, expiresAt: json.expiresAt || 0 };
  } catch {
    return { connected: false, expiresAt: 0 };
  }
}

// Kick off the OAuth flow. Navigates the browser to Swiggy sign-in.
export function connectSwiggy(): void {
  window.location.href = '/api/swiggy/start';
}

export interface SwiggyToolResult {
  ok?: boolean;
  result?: unknown;
  error?: string;
  message?: string;
}

// Call any Swiggy MCP tool. For place_food_order, pass confirm=true only after
// the user has approved the cart + total.
export async function swiggyTool(
  tool: string,
  args: Record<string, unknown> = {},
  opts: { server?: 'food' | 'im' | 'dineout'; confirm?: boolean } = {},
): Promise<SwiggyToolResult> {
  const res = await fetch('/api/swiggy/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args, server: opts.server || 'food', confirm: !!opts.confirm }),
  });
  const json = (await res.json()) as SwiggyToolResult;
  return json;
}

// Convenience wrappers for the canonical Food journey.
export const swiggyFood = {
  getAddresses: () => swiggyTool('get_addresses'),
  searchRestaurants: (addressId: string, query: string) =>
    swiggyTool('search_restaurants', { addressId, query }),
  getMenu: (restaurantId: string) => swiggyTool('get_restaurant_menu', { restaurantId }),
  searchMenu: (query: string, restaurantId?: string) =>
    swiggyTool('search_menu', restaurantId ? { query, restaurantId } : { query }),
  updateCart: (restaurantId: string, items: Array<{ itemId: string; quantity: number }>) =>
    swiggyTool('update_food_cart', { restaurantId, items }),
  getCart: () => swiggyTool('get_food_cart'),
  flushCart: () => swiggyTool('flush_food_cart'),
  fetchCoupons: () => swiggyTool('fetch_food_coupons'),
  applyCoupon: (code: string) => swiggyTool('apply_food_coupon', { code }),
  // Real order — requires explicit confirmation.
  placeOrder: (paymentMethod: 'COD' = 'COD') =>
    swiggyTool('place_food_order', { paymentMethod }, { confirm: true }),
  trackOrder: (orderId: string) => swiggyTool('track_food_order', { orderId }),
  getOrders: () => swiggyTool('get_food_orders'),
};
