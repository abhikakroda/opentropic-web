import { NavLink, Outlet } from 'react-router-dom';
import { product } from '../data/catalog';

export function MarketingShell() {
  return (
    <div className="min-h-screen">
      <div className="dash-r dash-b" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

      <header className="sticky top-0 z-30 border-b border-dashed border-border bg-background/90 backdrop-blur-sm">
        <div className="shell flex h-16 items-center justify-between gap-8">
          <NavLink to="/" className="flex min-w-0 items-center gap-3">
            <span className="marker-green size-3.5 shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight">
              {product.name}
            </span>
          </NavLink>
          <div className="flex items-center gap-3">
            <NavLink to="/app" className="nav-link">Open app</NavLink>
            <NavLink to="/app" className="btn-solid">Launch web app</NavLink>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
