import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Search,
  ShoppingBag,
  Star,
  Clock,
  Plus,
  Minus,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { swiggyStatus, connectSwiggy, swiggyFood } from '../lib/swiggy';

// ---- Loose shapes: Swiggy tool payloads vary, so we read defensively. ----
interface Address {
  id: string;
  label?: string;
  address?: string;
}
interface Restaurant {
  id: string;
  name: string;
  cuisines?: string[];
  rating?: number | string;
  eta?: string;
  costForTwo?: string;
  open?: boolean;
  image?: string;
}
interface MenuItem {
  id: string;
  name: string;
  price?: number;
  description?: string;
  veg?: boolean;
}
interface CartLine {
  item: MenuItem;
  quantity: number;
}

const CART_CAP = 1000;

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function firstArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'content', 'results', 'restaurants', 'items', 'addresses', 'menu']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  // MCP content array shape: { content: [{ type:'text', text:'{...}' }] }
  if (Array.isArray(payload.content) && payload.content[0]?.text) {
    try {
      const parsed = JSON.parse(payload.content[0].text);
      return firstArray(parsed);
    } catch {
      /* ignore */
    }
  }
  return [];
}

function normalizeRestaurant(r: any): Restaurant {
  return {
    id: String(r.id ?? r.restaurantId ?? r.resId ?? ''),
    name: String(r.name ?? r.restaurantName ?? 'Restaurant'),
    cuisines: Array.isArray(r.cuisines) ? r.cuisines : typeof r.cuisines === 'string' ? [r.cuisines] : [],
    rating: r.rating ?? r.avgRating,
    eta: r.eta ?? r.deliveryTime ?? r.sla?.slaString,
    costForTwo: r.costForTwo ?? r.costForTwoString,
    open: r.availabilityStatus ? r.availabilityStatus === 'OPEN' : r.open ?? r.isOpen ?? true,
    image: r.image ?? r.cloudinaryImageId,
  };
}

function normalizeMenuItem(m: any): MenuItem {
  return {
    id: String(m.id ?? m.itemId ?? m.dishId ?? ''),
    name: String(m.name ?? m.itemName ?? 'Item'),
    price: num(m.price ?? m.finalPrice ?? m.defaultPrice) / (num(m.price) > 1000 ? 100 : 1),
    description: m.description ?? m.desc,
    veg: m.isVeg ?? m.veg,
  };
}

export function FoodPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [query, setQuery] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState<{ kind: 'idle' | 'ok' | 'error' | 'info'; message: string }>({
    kind: 'idle',
    message: '',
  });
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<{ id: string; status: string } | null>(null);

  // Discover Swiggy status + saved addresses on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await swiggyStatus();
      if (cancelled) return;
      setConnected(s.connected);
      if (s.connected) {
        const res = await swiggyFood.getAddresses();
        const list = firstArray(res?.result ?? res).map((a: any) => ({
          id: String(a.id ?? a.addressId ?? ''),
          label: a.label ?? a.type ?? 'Address',
          address: a.address ?? a.fullAddress ?? a.formattedAddress,
        }));
        if (!cancelled && list.length) {
          setAddresses(list);
          const home = list.find((a) => (a.label || '').toLowerCase() === 'home') ?? list[0];
          setAddressId(home.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + (line.item.price || 0) * line.quantity, 0),
    [cart],
  );
  const overCap = cartTotal > CART_CAP;

  const onSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!query.trim()) return;
    if (!addressId) {
      setNotice({ kind: 'error', message: 'No delivery address found on your Swiggy account. Add one in the Swiggy app first.' });
      return;
    }
    setSearching(true);
    setNotice({ kind: 'idle', message: '' });
    setActiveRestaurant(null);
    setMenu([]);
    try {
      const res = await swiggyFood.searchRestaurants(addressId, query.trim());
      const list = firstArray(res?.result ?? res).map(normalizeRestaurant).filter((r) => r.id);
      setRestaurants(list);
      if (!list.length) setNotice({ kind: 'info', message: 'No restaurants matched. Try another dish or cuisine.' });
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : 'Search failed.' });
    } finally {
      setSearching(false);
    }
  };

  const openMenu = async (restaurant: Restaurant) => {
    setActiveRestaurant(restaurant);
    setMenu([]);
    setLoadingMenu(true);
    setNotice({ kind: 'idle', message: '' });
    try {
      const res = await swiggyFood.getMenu(restaurant.id);
      const list = firstArray(res?.result ?? res).map(normalizeMenuItem).filter((m) => m.id);
      setMenu(list);
      if (!list.length) setNotice({ kind: 'info', message: 'Could not load this menu. Pick another restaurant.' });
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : 'Menu failed to load.' });
    } finally {
      setLoadingMenu(false);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) return prev.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { item, quantity: 1 }];
    });
  };
  const changeQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === itemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const placeOrder = async () => {
    if (!activeRestaurant || !cart.length) return;
    if (overCap) {
      setNotice({ kind: 'error', message: 'Cart is over the ' + CART_CAP + ' rupee cap. Remove an item first.' });
      return;
    }
    const summary = cart.map((l) => l.quantity + ' x ' + l.item.name).join(', ');
    const confirmed = window.confirm(
      'Place a REAL Swiggy order (cash on delivery)?\n\n' +
        activeRestaurant.name + '\n' + summary + '\n\nTotal: ~' + cartTotal + ' rupees\n\nThis will place an actual order.',
    );
    if (!confirmed) return;
    setPlacing(true);
    setNotice({ kind: 'idle', message: '' });
    try {
      // Sync the cart server-side, then place the order with explicit confirmation.
      await swiggyFood.updateCart(
        activeRestaurant.id,
        cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
      );
      const res = await swiggyFood.placeOrder('COD');
      const payload: any = res?.result ?? res;
      if (res?.error) throw new Error(res.message || res.error);
      const orderId = String(payload?.orderId ?? payload?.id ?? firstArray(payload)[0]?.orderId ?? 'placed');
      setOrder({ id: orderId, status: 'Placed' });
      setCart([]);
      setNotice({ kind: 'ok', message: 'Order placed. Track it below.' });
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : 'Order failed.' });
    } finally {
      setPlacing(false);
    }
  };

  const trackOrder = async () => {
    if (!order) return;
    try {
      const res = await swiggyFood.trackOrder(order.id);
      const payload: any = res?.result ?? res;
      const status = payload?.status ?? payload?.orderStatus ?? firstArray(payload)[0]?.status ?? 'In progress';
      setOrder({ ...order, status: String(status) });
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : 'Could not fetch order status.' });
    }
  };

  if (connected === false) {
    return (
      <main className="shell py-16">
        <h1 className="font-display text-3xl font-bold">Food</h1>
        <div className="mt-6 max-w-xl border border-dashed border-border bg-card p-8 text-center">
          <ShoppingBag className="mx-auto text-scope" size={32} />
          <h2 className="mt-4 text-xl font-bold">Connect Swiggy to order</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Search restaurants, browse menus, and place real cash-on-delivery orders right here. Sign-in happens on Swiggy; we never see your password.
          </p>
          <button type="button" onClick={connectSwiggy} className="btn-solid mt-6">
            Connect Swiggy
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Food</h1>
          <p className="mt-1 text-sm text-muted-foreground">Real Swiggy ordering — search, cart, and cash-on-delivery checkout.</p>
        </div>
        {addresses.length ? (
          <label className="flex items-center gap-2 border border-dashed border-border bg-card px-3 py-2 text-sm">
            <MapPin size={15} className="text-scope" />
            <select
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              className="bg-transparent text-sm outline-none"
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <form onSubmit={onSearch} className="mt-6 flex gap-3">
        <div className="flex flex-1 items-center gap-2 border border-dashed border-border bg-background px-3">
          <Search size={16} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes or restaurants — biryani, pizza, dosa…"
            className="flex-1 bg-transparent py-3 text-sm outline-none"
          />
        </div>
        <button type="submit" disabled={searching} className="btn-solid disabled:opacity-40">
          {searching ? <Loader2 className="animate-spin" size={16} /> : 'Search'}
        </button>
      </form>

      {notice.kind !== 'idle' ? (
        <div
          className={
            'mt-4 flex items-center gap-2 border border-dashed p-3 text-sm ' +
            (notice.kind === 'error'
              ? 'border-red-500/40 text-red-400'
              : notice.kind === 'ok'
                ? 'border-scope/40 text-scope'
                : 'border-border text-muted-foreground')
          }
        >
          {notice.kind === 'error' ? <AlertCircle size={15} /> : notice.kind === 'ok' ? <CheckCircle2 size={15} /> : null}
          {notice.message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {!activeRestaurant ? (
            <div className="grid gap-4 md:grid-cols-2">
              {restaurants.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => (r.open ? openMenu(r) : null)}
                  disabled={!r.open}
                  className={
                    'border border-dashed border-border bg-card p-5 text-left transition hover:border-foreground ' +
                    (r.open ? '' : 'opacity-50')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">{r.name}</h3>
                    <span className={'font-mono text-xs uppercase tracking-widest ' + (r.open ? 'text-scope' : 'text-muted-foreground')}>
                      {r.open ? 'open' : 'closed'}
                    </span>
                  </div>
                  {r.cuisines?.length ? (
                    <p className="mt-1 text-sm text-muted-foreground">{r.cuisines.slice(0, 3).join(', ')}</p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    {r.rating ? (
                      <span className="flex items-center gap-1">
                        <Star size={12} className="text-scope" /> {r.rating}
                      </span>
                    ) : null}
                    {r.eta ? (
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {r.eta}
                      </span>
                    ) : null}
                    {r.costForTwo ? <span>{r.costForTwo}</span> : null}
                  </div>
                </button>
              ))}
              {!restaurants.length && !searching ? (
                <p className="text-sm text-muted-foreground">Search above to see restaurants near your delivery address.</p>
              ) : null}
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setActiveRestaurant(null)}
                className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
              >
                &larr; Back to results
              </button>
              <h2 className="text-xl font-bold">{activeRestaurant.name}</h2>
              {loadingMenu ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="animate-spin" size={16} /> Loading menu…
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {menu.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-4 border border-dashed border-border bg-card p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          {typeof m.veg === 'boolean' ? (
                            <span className={'size-3 border ' + (m.veg ? 'border-scope' : 'border-red-500')}>
                              <span className={'block size-full scale-50 rounded-full ' + (m.veg ? 'bg-scope' : 'bg-red-500')} />
                            </span>
                          ) : null}
                          <h4 className="font-medium">{m.name}</h4>
                        </div>
                        {m.description ? <p className="mt-1 text-sm text-muted-foreground">{m.description}</p> : null}
                        {m.price ? <p className="mt-1 font-mono text-sm">{'\u20b9' + m.price}</p> : null}
                      </div>
                      <button type="button" onClick={() => addToCart(m)} className="btn-solid flex items-center gap-1 self-center">
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="h-fit border border-dashed border-border bg-card p-5 lg:sticky lg:top-24">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-scope" />
            <h2 className="font-bold">Cart</h2>
          </div>
          {order ? (
            <div className="mt-4 border border-dashed border-scope/40 bg-scope/5 p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-scope">Order {order.status}</p>
              <p className="mt-1 text-sm text-muted-foreground">Order id: {order.id}</p>
              <button
                type="button"
                onClick={trackOrder}
                className="mt-3 border border-dashed border-border px-3 py-2 font-mono text-xs uppercase tracking-widest transition hover:border-foreground"
              >
                Refresh status
              </button>
            </div>
          ) : null}
          {!cart.length ? (
            <p className="mt-4 text-sm text-muted-foreground">Add items from a menu to build your order.</p>
          ) : (
            <>
              <div className="mt-4 grid gap-3">
                {cart.map((l) => (
                  <div key={l.item.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{l.item.name}</p>
                      {l.item.price ? (
                        <p className="font-mono text-xs text-muted-foreground">{'\u20b9' + l.item.price * l.quantity}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQty(l.item.id, -1)}
                        className="border border-dashed border-border p-1 transition hover:border-foreground"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-mono text-sm">{l.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(l.item.id, 1)}
                        className="border border-dashed border-border p-1 transition hover:border-foreground"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-dashed border-border pt-3 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className={'font-mono ' + (overCap ? 'text-red-400' : '')}>{'\u20b9' + cartTotal}</span>
              </div>
              {overCap ? (
                <p className="mt-1 text-xs text-red-400">Over the {'\u20b9' + CART_CAP} cap. Remove an item to continue.</p>
              ) : null}
              <div className="mt-4 border-t border-dashed border-border pt-4">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Payment</p>
                <p className="mt-1 text-sm">Cash on delivery</p>
              </div>
              <button
                type="button"
                onClick={placeOrder}
                disabled={placing || overCap}
                className="btn-solid mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-40"
              >
                {placing ? <Loader2 className="animate-spin" size={16} /> : 'Place order (COD)'}
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                You'll get a final confirmation prompt before any real order is placed.
              </p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
