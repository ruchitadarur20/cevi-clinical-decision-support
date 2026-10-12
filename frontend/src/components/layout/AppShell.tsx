import { useEffect, useState } from 'react';
import { isDemo } from '@/lib/demoConfig';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, BarChart3, Brain, FileText, History, ImageIcon, LayoutDashboard, Settings, ShieldCheck, Users, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Permission } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Topbar } from './Topbar';

interface NavItem { to: string; label: string; icon: typeof Activity; permission?: Permission; end?: boolean }

export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users, permission: 'patients:read' },
  { to: '/records', label: 'Clinical Records', icon: FileText, permission: 'records:read' },
  { to: '/imaging', label: 'Medical Imaging', icon: ImageIcon, permission: 'images:read' },
  { to: '/analysis', label: 'AI Analysis', icon: Brain, permission: 'analyses:read' },
  { to: '/history', label: 'Analysis History', icon: History, permission: 'analyses:read' },
  { to: '/analytics', label: 'Research Analytics', icon: BarChart3, permission: 'analytics:read' },
  { to: '/users', label: 'Users & Roles', icon: ShieldCheck, permission: 'users:manage' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal text-teal-foreground">
        <Activity className="h-5 w-5" aria-hidden />
      </div>
      <div className="leading-tight">
        <p className={cn('text-base font-semibold tracking-tight', light && 'text-sidebar-foreground')}>CEVI</p>
        <p className={cn('text-[10px] uppercase tracking-widest', light ? 'text-sidebar-muted' : 'text-muted-foreground')}>Clinical Research</p>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { can, user } = useAuth();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5"><Brand light /></div>
      <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.filter((n) => !n.permission || can(n.permission)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-sidebar-active text-white shadow-[inset_2px_0_0_hsl(var(--teal))]' : 'text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-muted">
        <p className="font-medium text-sidebar-foreground">{user?.name}</p>
        <p className="mt-1">{isDemo ? 'Portfolio demo · Synthetic data' : 'Synthetic data · Research prototype'}</p>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><SidebarContent /></aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-pop">
            <SidebarContent onNavigate={() => setOpen(false)} />
            <button className="absolute right-3 top-4 rounded p-1 text-sidebar-muted hover:text-white" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
