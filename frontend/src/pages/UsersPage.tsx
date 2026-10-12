import { useState, type FormEvent } from 'react';
import { RolePermissionMatrix } from '@/components/demo/RolePermissionMatrix';
import { isDemo } from '@/lib/demoConfig';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { useCreateUser, useUpdateUser, useUsers } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, RoleBadge, SearchBox } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { serverFieldErrors, userSchema, validateForm } from '@/lib/validation';
import type { Role } from '@/lib/types';

const ROLE_DESCRIPTIONS: Array<[Role, string]> = [
  ['ADMINISTRATOR', 'Manages users and role assignments; observes activity and analytics. Does not author clinical content.'],
  ['CLINICIAN', 'Registers patients, authors records, uploads images and requests analyses.'],
  ['RESEARCHER', 'Reviews anonymized data, runs experimental analyses and reads research analytics.'],
];

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'CLINICIAN', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateUser();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: v, value } = validateForm(userSchema, form);
    setErrors(v ?? {});
    if (v || !value) return;
    try {
      await create.mutateAsync(value);
      toast.success(`User ${value.email} created`);
      setForm({ name: '', email: '', role: 'CLINICIAN', password: '' });
      onOpenChange(false);
    } catch (err) {
      setErrors({ ...serverFieldErrors(err), ...(err instanceof ApiError && err.status === 409 ? { email: err.message } : {}) });
      toast.error(err instanceof ApiError ? err.message : 'Could not create user');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Create an account and assign a role.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Full name" htmlFor="u-name" error={errors.name}><Input id="u-name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} /></Field>
            <Field label="Email" htmlFor="u-email" error={errors.email}><Input id="u-email" type="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} /></Field>
            <Field label="Role" htmlFor="u-role"><Select id="u-role" value={form.role} onChange={set('role')}><option value="CLINICIAN">Clinician</option><option value="RESEARCHER">Researcher</option><option value="ADMINISTRATOR">Administrator</option></Select></Field>
            <Field label="Temporary password" htmlFor="u-pass" error={errors.password} hint="At least 10 characters, with a letter and a number."><Input id="u-pass" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-invalid={!!errors.password} /></Field>
          </DialogBody>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Create user</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error, refetch } = useUsers({ q: dq || undefined, role: role || undefined, page, pageSize: 15 });
  const update = useUpdateUser();

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    try { await update.mutateAsync({ id, ...body }); toast.success(ok); } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Update failed'); }
  }

  return (
    <div>
      <PageHeader title="Users & Roles" description="Manage who can access CEVI and what they can do. Permissions are enforced by the API." actions={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add user</Button>} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {ROLE_DESCRIPTIONS.map(([r, d]) => <Card key={r} className="p-4"><RoleBadge role={r} /><p className="mt-2 text-sm text-muted-foreground">{d}</p></Card>)}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or email" className="md:w-80" />
          <Select aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="md:w-48"><option value="">All roles</option><option value="ADMINISTRATOR">Administrator</option><option value="CLINICIAN">Clinician</option><option value="RESEARCHER">Researcher</option></Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : !data?.data.length ? <EmptyState title="No users found" /> : (
          <>
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>User</TH><TH>Role</TH><TH>Status</TH><TH className="hidden md:table-cell">Last sign-in</TH><TH className="text-right">Actions</TH></TR></THead>
              <TBody>
                {data.data.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <TR key={u.id}>
                      <TD><span className="block font-medium">{u.name}{self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</span><span className="text-xs text-muted-foreground">{u.email}</span></TD>
                      <TD>
                        <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={self || update.isPending} onChange={(e) => void patch(u.id, { role: e.target.value }, `Role updated for ${u.email}`)} className="h-8 w-40">
                          <option value="ADMINISTRATOR">Administrator</option><option value="CLINICIAN">Clinician</option><option value="RESEARCHER">Researcher</option>
                        </Select>
                      </TD>
                      <TD>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</TD>
                      <TD className="hidden text-muted-foreground md:table-cell">{formatDateTime(u.lastLoginAt)}</TD>
                      <TD className="text-right"><Button size="sm" variant="outline" disabled={self || update.isPending} onClick={() => void patch(u.id, { isActive: !u.isActive }, u.isActive ? `${u.email} deactivated` : `${u.email} reactivated`)}>{u.isActive ? 'Deactivate' : 'Reactivate'}</Button></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </Card>
      {isDemo && <div className="mt-6"><RolePermissionMatrix current={me?.role} /></div>}
      <CreateUserDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
