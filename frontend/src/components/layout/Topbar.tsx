import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, FileText, ImageIcon, LogOut, Menu, Moon, Search, Settings, Sun, User, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useDebounce } from '@/hooks/useDebounce';
import { useActivity, useGlobalSearch } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RoleBadge } from '@/components/common';
import { timeAgo } from '@/lib/format';
import { Brand } from './AppShell';
import { isDemo } from '@/lib/demoConfig';
import { PortfolioBadge } from '@/components/demo/labels';
import { RoleSwitcher } from '@/components/demo/RoleSwitcher';

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Overview'], [/^\/patients\/.+/, 'Patient Profile'], [/^\/patients/, 'Patients'], [/^\/records/, 'Clinical Records'],
  [/^\/imaging/, 'Medical Imaging'], [/^\/analysis/, 'AI Analysis'], [/^\/history/, 'Analysis History'],
  [/^\/analytics/, 'Research Analytics'], [/^\/users/, 'Users & Roles'], [/^\/settings/, 'Settings'],
];

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q, 250);
  const { data, isFetching } = useGlobalSearch(debounced);
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (to: string) => { setOpen(false); setQ(''); nav(to); };
  const empty = data && !data.patients.length && !data.records.length && !data.images.length;

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) go(`/patients?q=${encodeURIComponent(q.trim())}`); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Search patients, records, images…"
        aria-label="Global search"
        className="h-9 w-full rounded-md border border-input bg-secondary/60 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:bg-card"
      />
      {open && debounced.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-md border bg-card p-1 shadow-pop" role="listbox">
          {isFetching && !data && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
          {empty && <p className="px-3 py-2 text-sm text-muted-foreground">No matches for “{debounced}”.</p>}
          {data?.patients.map((p) => (
            <button key={p.id} className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => go(`/patients/${p.id}`)}>
              <Users className="h-4 w-4 text-muted-foreground" /> <span className="flex-1 truncate">{p.displayName}</span><span className="text-xs text-muted-foreground">{p.syntheticId}</span>
            </button>
          ))}
          {data?.records.map((r) => (
            <button key={r.id} className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => go(`/records?q=${encodeURIComponent(r.title)}`)}>
              <FileText className="h-4 w-4 text-muted-foreground" /> <span className="flex-1 truncate">{r.title}</span><span className="text-xs text-muted-foreground">{r.patient.syntheticId}</span>
            </button>
          ))}
          {data?.images.map((i) => (
            <button key={i.id} className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => go(`/imaging?q=${encodeURIComponent(i.originalName)}`)}>
              <ImageIcon className="h-4 w-4 text-muted-foreground" /> <span className="flex-1 truncate">{i.originalName}</span><span className="text-xs text-muted-foreground">{i.patient.syntheticId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { data } = useActivity(8);
  const [seen, setSeen] = useState<string | null>(() => { try { return localStorage.getItem('cevi-seen-activity'); } catch { return null; } });
  const latest = data?.[0]?.id;
  const unread = data ? (seen ? data.findIndex((a) => a.id === seen) : data.length) : 0;
  const count = unread < 0 ? data?.length ?? 0 : unread;
  return (
    <DropdownMenu onOpenChange={(o) => { if (o && latest) { setSeen(latest); try { localStorage.setItem('cevi-seen-activity', latest); } catch { /* ignore */ } } }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${count ? `, ${count} new` : ''}`} className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal ring-2 ring-background" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Recent system activity</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data?.length && <p className="px-3 py-4 text-sm text-muted-foreground">No recent activity.</p>}
        {data?.map((a) => (
          <div key={a.id} className="rounded-sm px-3 py-2">
            <p className="text-sm leading-snug">{a.summary}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'CEVI';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
      <div className="lg:hidden"><Brand /></div>
      <h2 className="hidden shrink-0 text-sm font-semibold text-muted-foreground lg:block">{title}</h2>
      <div className="ml-auto flex w-full max-w-md items-center justify-end gap-1 sm:ml-6 sm:flex-1"><div className="hidden w-full sm:block"><GlobalSearch /></div></div>
      {isDemo && <span className="hidden md:inline-flex"><PortfolioBadge /></span>}
      {isDemo && <RoleSwitcher />}
      <Notifications />
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-accent" aria-label="User menu">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {user?.name.replace(/^Dr\.\s*/, '').split(' ').map((s) => s[0]).slice(0, 2).join('')}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="space-y-1 px-2 py-2">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            {user && <RoleBadge role={user.role} />}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => nav('/settings')}><Settings className="h-4 w-4" /> Settings</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => nav('/settings')}><User className="h-4 w-4" /> Profile</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { void logout().then(() => nav('/login')); }}><LogOut className="h-4 w-4" /> {isDemo ? 'Exit to role picker' : 'Sign out'}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
