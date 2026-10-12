import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Moon, ShieldCheck, Sun } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/lib/api';
import { validateForm } from '@/lib/validation';
import { KeyValue, PageHeader, RoleBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isDemo } from '@/lib/demoConfig';
import { DemoSettings } from '@/components/demo/DemoSettings';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(10, 'At least 10 characters').regex(/[A-Za-z]/, 'Must contain a letter').regex(/[0-9]/, 'Must contain a number'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: v } = validateForm(passwordSchema, form);
    setErrors(v ?? {});
    if (v) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password updated');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.code === 'WRONG_PASSWORD' ? { currentPassword: err.message } : { ...err.fieldErrors, ...(Object.keys(err.fieldErrors).length ? {} : { currentPassword: err.message }) });
    } finally { setBusy(false); }
  }

  if (!user) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Your profile, appearance and security preferences." />
      <div className="space-y-6">
        {isDemo && <DemoSettings />}
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Account details are managed by an administrator.</CardDescription></CardHeader>
          <CardContent><dl className="divide-y">
            <KeyValue label="Name">{user.name}</KeyValue>
            <KeyValue label="Email">{user.email}</KeyValue>
            <KeyValue label="Role"><RoleBadge role={user.role} /></KeyValue>
          </dl></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Permissions</CardTitle><CardDescription>What your role is authorised to do. The API enforces these independently of the interface.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">{user.permissions.map((p) => <Badge key={p} tone="outline"><ShieldCheck className="h-3 w-3" />{p}</Badge>)}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:max-w-sm">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)} aria-pressed={theme === t} className={cn('flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium', theme === t ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted')}>
                {t === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </CardContent>
        </Card>

        {!isDemo && <Card>
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} noValidate className="max-w-sm space-y-4">
              <Field label="Current password" htmlFor="pw-cur" error={errors.currentPassword}><Input id="pw-cur" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} aria-invalid={!!errors.currentPassword} /></Field>
              <Field label="New password" htmlFor="pw-new" error={errors.newPassword} hint="At least 10 characters with a letter and a number."><Input id="pw-new" type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} aria-invalid={!!errors.newPassword} /></Field>
              <Field label="Confirm new password" htmlFor="pw-conf" error={errors.confirm}><Input id="pw-conf" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} aria-invalid={!!errors.confirm} /></Field>
              <Button type="submit" loading={busy}>Update password</Button>
            </form>
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}
