import { ChevronDown, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { titleCase } from '@/lib/format';
import type { Role } from '@/lib/types';

const ROLES: Role[] = ['CLINICIAN', 'RESEARCHER', 'ADMINISTRATOR'];

/** Demo-only: simulates signing in as another role entirely in the browser. */
export function RoleSwitcher() {
  const { user, switchRole } = useAuth();
  if (!user || !switchRole) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium hover:bg-accent" aria-label={`Demo role: ${titleCase(user.role)}. Switch role`}>
          <UserCog className="h-4 w-4 text-primary" aria-hidden />
          <span className="hidden sm:inline">{titleCase(user.role)}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>View as (simulated role)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map((r) => (
          <DropdownMenuItem key={r} onSelect={() => { void switchRole(r).then(() => toast.success(`Now viewing as ${titleCase(r)}`, { description: 'Simulated in your browser. Permissions mirror the real API.' })); }}>
            <span className="flex-1">{titleCase(r)}</span>
            {r === user.role && <span className="text-xs text-primary">Active</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-3 py-2 text-xs text-muted-foreground">The real application authenticates with JWT and enforces roles in the API.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
