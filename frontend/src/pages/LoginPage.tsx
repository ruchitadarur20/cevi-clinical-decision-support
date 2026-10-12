import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Brain, Lock, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { validateForm, loginSchema } from '@/lib/validation';
import { ApiError } from '@/lib/api';
import { isDemo } from '@/lib/demoConfig';
import { PortfolioBadge } from '@/components/demo/labels';

const DEMO = [
  { role: 'Clinician', email: 'clinician@cevi.demo', note: 'Patients, records, images, analyses' },
  { role: 'Researcher', email: 'researcher@cevi.demo', note: 'Anonymized data, analyses, analytics' },
  { role: 'Administrator', email: 'admin@cevi.demo', note: 'Users & roles, activity, analytics' },
];
const DEMO_PASSWORD = 'CeviDemo2026!';

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const { errors: v } = validateForm(loginSchema, { email, password });
    setErrors(v ?? {});
    if (v) return;
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Welcome back, ${u.name.split(' (')[0]}`);
      nav((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal/10 blur-3xl" aria-hidden />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal text-teal-foreground"><Activity className="h-6 w-6" /></div>
          <div><p className="text-xl font-semibold">CEVI</p><p className="text-xs uppercase tracking-widest text-sidebar-muted">Clinical Decision-Support Research</p></div>
        </div>
        <div className="relative max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight">Structured clinical context and medical imaging in one research workspace.</h1>
          <ul className="space-y-3 text-sm text-sidebar-muted">
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> Role-based access enforced by the API, with anonymized researcher views.</li>
            <li className="flex gap-3"><Brain className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> EfficientNet-B0 inference service with transparent, labelled experimental output.</li>
            <li className="flex gap-3"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> Synthetic data only. Not a medical device and not for clinical use.</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">Educational research prototype · No real patient information</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal text-teal-foreground"><Activity className="h-5 w-5" /></div><span className="text-lg font-semibold">CEVI</span></div>
          {isDemo ? (
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold">Enter the demo</h2><PortfolioBadge /></div>
              <p className="mt-1 text-sm text-muted-foreground">Choose a role to explore. There is no sign-in: everything runs in your browser with synthetic data.</p>
              {formError && <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
              <ul className="mt-6 space-y-2">
                {DEMO.map((d) => (
                  <li key={d.email}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true); setFormError('');
                        try { await login(d.email, ''); nav((location.state as { from?: string } | null)?.from ?? '/', { replace: true }); }
                        catch (err) { setFormError(err instanceof ApiError ? err.message : 'Could not start the demo'); }
                        finally { setBusy(false); }
                      }}
                      className="flex w-full items-center gap-3 rounded-md border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      <UserRound className="h-5 w-5 text-primary" />
                      <span className="min-w-0 flex-1"><span className="block font-medium">Explore as {d.role}</span><span className="block text-xs text-muted-foreground">{d.note}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-muted-foreground">Research prototype only. Not intended for clinical diagnosis, treatment, or patient care. Roles are simulated locally; the full application authenticates with JWT.</p>
            </div>
          ) : (
            <>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use a local demonstration account to explore the workspace.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {formError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} placeholder="name@cevi.demo" />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
            </Field>
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
          </form>

          <div className="mt-8 rounded-lg border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Local demonstration accounts</p>
            <ul className="mt-3 space-y-2">
              {DEMO.map((d) => (
                <li key={d.email}>
                  <button
                    type="button"
                    onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); setErrors({}); setFormError(''); }}
                    className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <UserRound className="h-4 w-4 text-primary" />
                    <span className="min-w-0 flex-1"><span className="block font-medium">{d.role}</span><span className="block truncate text-xs text-muted-foreground">{d.note}</span></span>
                    <span className="text-xs text-primary">Fill</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Demo password: <code className="rounded bg-muted px-1 py-0.5">{DEMO_PASSWORD}</code>. Accounts exist only in the local seeded database.</p>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
