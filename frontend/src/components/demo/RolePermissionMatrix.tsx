import { Check, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PERMISSIONS } from '@/demo/permissions';
import type { Permission, Role } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROLES: Array<{ role: Role; label: string }> = [
  { role: 'ADMINISTRATOR', label: 'Administrator' },
  { role: 'CLINICIAN', label: 'Clinician' },
  { role: 'RESEARCHER', label: 'Researcher' },
];
const ROWS: Array<[Permission, string]> = [
  ['users:manage', 'Manage users and roles'],
  ['patients:read', 'View patients'],
  ['patients:identify', 'See names and exact birth dates'],
  ['patients:write', 'Register and edit patients'],
  ['records:read', 'View clinical records'],
  ['records:write', 'Create and edit records'],
  ['images:read', 'View medical images'],
  ['images:write', 'Upload images'],
  ['analyses:read', 'View analysis history'],
  ['analyses:create', 'Request analyses'],
  ['analytics:read', 'View research analytics'],
  ['activity:read', 'View activity feed'],
];

export function RolePermissionMatrix({ current }: { current?: Role }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Role permissions</CardTitle>
        <CardDescription>The same matrix the API uses (<code className="rounded bg-muted px-1">lib/permissions.ts</code>). In this demo the active role is simulated in the browser.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Capability</th>
              {ROLES.map((r) => <th key={r.role} className={cn('px-3 py-2 text-center font-medium', current === r.role && 'text-primary')}>{r.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ROWS.map(([perm, label]) => (
              <tr key={perm}>
                <td className="py-2 pr-4">{label}<span className="ml-2 hidden font-mono text-[11px] text-muted-foreground sm:inline">{perm}</span></td>
                {ROLES.map((r) => {
                  const ok = PERMISSIONS[perm].includes(r.role);
                  return (
                    <td key={r.role} className={cn('px-3 py-2 text-center', current === r.role && 'bg-accent/50')}>
                      {ok ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not allowed" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
