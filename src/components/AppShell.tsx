import { NavLink, Outlet } from 'react-router-dom';
import {
  Boxes,
  UtensilsCrossed,
  LayoutDashboard,
  MessageSquareText,
  Settings2,
  Smartphone,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { product } from '../data/catalog';
import { cn } from '../lib/cn';
import { useWorkspaceStore } from '../store/workspaceStore';
import { WorkspaceSearch } from './WorkspaceSearch';

const links = [
  { to: '/app', label: 'Chat', icon: MessageSquareText, end: true },
  { to: '/app/tasks', label: 'Tasks', icon: LayoutDashboard },
  { to: '/app/skills', label: 'Skills', icon: Workflow },
  { to: '/app/artifacts', label: 'Artifacts', icon: Boxes },
  { to: '/app/devices', label: 'Devices', icon: Smartphone },
  { to: '/app/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
];

export function AppShell() {
  const selectedRuntime = useWorkspaceStore((state) => state.selectedRuntime);
  const createConversation = useWorkspaceStore((state) => state.createConversation);

  return (
    <div className="min-h-screen">
      <div className="dash-r dash-b" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

      <header className="sticky top-0 z-30 border-b border-dashed border-border bg-background/90 backdrop-blur-sm">
        <div className="shell flex h-16 items-center gap-8">
          <NavLink to="/" className="flex min-w-0 items-center gap-3">
            <span className="marker-green size-3.5 shrink-0" />
            <span className="truncate font-display text-lg font-bold tracking-tight">
              {product.name}
            </span>
          </NavLink>

          <nav className="hidden flex-1 items-center gap-7 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'nav-link transition',
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <WorkspaceSearch />
            <span className="hidden font-mono text-xs tracking-widest text-muted-foreground md:inline-flex">
              {selectedRuntime}
            </span>
            <button
              type="button"
              onClick={createConversation}
              className="btn-solid flex items-center gap-2"
            >
              <Sparkles size={14} />
              New chat
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
