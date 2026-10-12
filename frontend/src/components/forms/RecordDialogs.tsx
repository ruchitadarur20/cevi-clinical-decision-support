import { useEffect, useState, type FormEvent } from 'react';
import { isDemo } from '@/lib/demoConfig';
import { BrowserOnlyBadge } from '@/components/demo/labels';
import { toast } from 'sonner';
import { History as HistoryIcon, Pencil } from 'lucide-react';
import type { ClinicalRecord } from '@/lib/types';
import { useCreateRecord, usePatients, useRecord, useUpdateRecord } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/feedback';
import { SeverityBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api';
import { formatDateTime, titleCase } from '@/lib/format';
import { recordSchema, serverFieldErrors, validateForm } from '@/lib/validation';

export const RECORD_TYPES = ['OBSERVATION', 'DIAGNOSTIC_NOTE', 'LAB_RESULT', 'PROCEDURE', 'FOLLOW_UP'] as const;

export function RecordFormDialog({ open, onOpenChange, record, patientId }: { open: boolean; onOpenChange: (o: boolean) => void; record?: ClinicalRecord | null; patientId?: string }) {
  const blank = { patientId: patientId ?? '', type: 'OBSERVATION', severity: 'ROUTINE', title: '', content: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const patients = usePatients({ pageSize: 100, sort: 'name', order: 'asc' });
  const create = useCreateRecord();
  const update = useUpdateRecord(record?.id ?? '');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(record ? { patientId: record.patient.id, type: record.type, severity: record.severity, title: record.title, content: record.content } : { ...blank, patientId: patientId ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record, patientId]);

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: v, value } = validateForm(recordSchema, form);
    setErrors(v ?? {});
    if (v || !value) return;
    try {
      if (record) {
        const { patientId: _p, ...rest } = value;
        await update.mutateAsync(rest);
        toast.success('Record updated — previous version preserved in history');
      } else {
        await create.mutateAsync(value);
        toast.success('Clinical record created');
      }
      onOpenChange(false);
    } catch (err) {
      setErrors(serverFieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'Could not save record');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{record ? 'Edit clinical record' : 'New clinical record'}</DialogTitle>
            <DialogDescription>{record ? `Saving creates version ${record.version + 1}; the current version is kept in history.` : 'Synthetic observation linked to a patient.'}{isDemo ? ' Saved in this browser only.' : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Patient" htmlFor="rf-patient" error={errors.patientId} className="sm:col-span-2">
              <Select id="rf-patient" value={form.patientId} onChange={set('patientId')} disabled={!!record || !!patientId} aria-invalid={!!errors.patientId}>
                <option value="">Select a patient…</option>
                {patients.data?.data.map((p) => <option key={p.id} value={p.id}>{p.displayName} — {p.syntheticId}</option>)}
              </Select>
            </Field>
            <Field label="Record type" htmlFor="rf-type">
              <Select id="rf-type" value={form.type} onChange={set('type')}>{RECORD_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
            </Field>
            <Field label="Severity" htmlFor="rf-sev">
              <Select id="rf-sev" value={form.severity} onChange={set('severity')}><option value="ROUTINE">Routine</option><option value="ELEVATED">Elevated</option><option value="URGENT">Urgent</option></Select>
            </Field>
            <Field label="Title" htmlFor="rf-title" error={errors.title} className="sm:col-span-2"><Input id="rf-title" value={form.title} onChange={set('title')} aria-invalid={!!errors.title} /></Field>
            <Field label="Clinical observation" htmlFor="rf-content" error={errors.content} className="sm:col-span-2">
              <Textarea id="rf-content" rows={6} value={form.content} onChange={set('content')} aria-invalid={!!errors.content} placeholder="Synthetic clinical text…" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>{record ? 'Save new version' : 'Create record'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordDetailDialog({ recordId, onClose }: { recordId: string | null; onClose: () => void }) {
  const { user, can } = useAuth();
  const { data, isLoading } = useRecord(recordId);
  const [editing, setEditing] = useState(false);
  const canEdit = !!data && can('records:write') && data.author.id === user?.id;

  return (
    <>
      <Dialog open={!!recordId && !editing} onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{data?.title ?? 'Clinical record'}</DialogTitle>
            <DialogDescription>{data ? `${data.patient.displayName} · ${data.patient.syntheticId}` : 'Loading…'}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {isLoading || !data ? <Spinner /> : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{titleCase(data.type)}</Badge><SeverityBadge severity={data.severity} />
                  <Badge tone="outline">Version {data.version}</Badge><Badge tone="outline">Synthetic</Badge>{data.browserOnly && <BrowserOnlyBadge />}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.content}</p>
                <p className="text-xs text-muted-foreground">Recorded {formatDateTime(data.recordedAt)} by {data.author.name}</p>
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><HistoryIcon className="h-4 w-4" /> Revision history</h4>
                  {data.revisions.length === 0 ? <p className="text-sm text-muted-foreground">No earlier versions — this record has not been edited.</p> : (
                    <ol className="space-y-3">
                      {data.revisions.map((r) => (
                        <li key={r.version} className="rounded-md border bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">Version {r.version} · superseded {formatDateTime(r.createdAt)} · edited by {r.editedBy.name}</p>
                          <p className="mt-1 text-sm font-medium">{r.title}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.content}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            {canEdit && <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit record</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RecordFormDialog open={editing} onOpenChange={(o) => setEditing(o)} record={data ?? null} />
    </>
  );
}
