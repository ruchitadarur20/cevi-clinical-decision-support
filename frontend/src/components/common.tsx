import type { ReactNode } from 'react';
import { FlaskConical, Search, ShieldAlert } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import { titleCase } from '@/lib/format';
import type { AnalysisMode, AnalysisStatus, CaseStatus, ProcessingStatus, Role, Severity } from '@/lib/types';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'blue', loading }: { label: string; value: ReactNode; hint?: string; icon: ReactNode; tone?: 'blue' | 'teal' | 'amber' | 'slate'; loading?: boolean }) {
  const tones = { blue: 'bg-primary/10 text-primary', teal: 'bg-teal/10 text-teal', amber: 'bg-warning/10 text-warning', slate: 'bg-secondary text-secondary-foreground' };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>}
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', tones[tone])}>{icon}</div>
      </div>
    </Card>
  );
}

const caseTone: Record<CaseStatus, BadgeTone> = { ACTIVE: 'teal', MONITORING: 'warning', CLOSED: 'neutral' };
export const CaseStatusBadge = ({ status }: { status: CaseStatus }) => <Badge tone={caseTone[status]}>{titleCase(status)}</Badge>;

const sevTone: Record<Severity, BadgeTone> = { ROUTINE: 'neutral', ELEVATED: 'warning', URGENT: 'danger' };
export const SeverityBadge = ({ severity }: { severity: Severity }) => <Badge tone={sevTone[severity]}>{titleCase(severity)}</Badge>;

const anaTone: Record<AnalysisStatus, BadgeTone> = { PENDING: 'neutral', PROCESSING: 'blue', COMPLETED: 'success', FAILED: 'danger', UNAVAILABLE: 'warning' };
export const AnalysisStatusBadge = ({ status }: { status: AnalysisStatus }) => <Badge tone={anaTone[status]}>{titleCase(status)}</Badge>;

const procTone: Record<ProcessingStatus, BadgeTone> = { UPLOADED: 'neutral', ANALYZING: 'blue', ANALYZED: 'success', FAILED: 'danger' };
export const ProcessingBadge = ({ status }: { status: ProcessingStatus }) => <Badge tone={procTone[status]}>{titleCase(status)}</Badge>;

const roleTone: Record<Role, BadgeTone> = { ADMINISTRATOR: 'blue', CLINICIAN: 'teal', RESEARCHER: 'warning' };
export const RoleBadge = ({ role }: { role: Role }) => <Badge tone={roleTone[role]}>{titleCase(role)}</Badge>;

export const ModeBadge = ({ mode }: { mode: AnalysisMode }) =>
  mode === 'EXPERIMENTAL_INFERENCE' ? <Badge tone="blue"><FlaskConical className="h-3 w-3" /> Experimental</Badge> : <Badge tone="outline">Recorded demonstration</Badge>;

export const SyntheticBadge = () => <Badge tone="outline" title="Generated data - not a real person or scan">Synthetic</Badge>;

export function ResearchDisclaimer({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div role="note" className={cn('flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm', className)}>
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="text-foreground/90">
        <span className="font-semibold">Research use only.</span>{' '}
        {compact
          ? 'Experimental output — not validated for clinical decision-making.'
          : 'CEVI is an educational research prototype using synthetic data. Model output is experimental, has not been clinically validated, and must not be used for diagnosis, treatment or any clinical decision.'}
      </p>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9" />
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export const CHART_COLORS = ['hsl(214 88% 48%)', 'hsl(174 72% 38%)', 'hsl(222 47% 28%)', 'hsl(32 92% 48%)', 'hsl(262 52% 56%)', 'hsl(0 72% 52%)'];
