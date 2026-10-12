import { useEffect, useState, type FormEvent } from 'react';
import { isDemo } from '@/lib/demoConfig';
import { toast } from 'sonner';
import type { Patient } from '@/lib/types';
import { useCreatePatient, useUpdatePatient } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { patientSchema, serverFieldErrors, validateForm } from '@/lib/validation';

const empty = { firstName: '', lastName: '', dateOfBirth: '', sex: 'UNKNOWN', researchCohort: '', caseStatus: 'ACTIVE', summary: '' };

export function PatientFormDialog({ open, onOpenChange, patient, cohorts = [], onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; patient?: Patient; cohorts?: string[]; onSaved?: (p: Patient) => void }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePatient();
  const update = useUpdatePatient(patient?.id ?? '');
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(patient ? { firstName: patient.firstName ?? '', lastName: patient.lastName ?? '', dateOfBirth: patient.dateOfBirth ?? '', sex: patient.sex, researchCohort: patient.researchCohort, caseStatus: patient.caseStatus, summary: patient.summary ?? '' } : empty);
  }, [open, patient]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { errors: v, value } = validateForm(patientSchema, form);
    setErrors(v ?? {});
    if (v || !value) return;
    try {
      const res = patient ? await update.mutateAsync(value) : await create.mutateAsync(value);
      toast.success(patient ? 'Patient updated' : `Synthetic patient ${(res as { data: Patient }).data.syntheticId} registered`);
      onSaved?.((res as { data: Patient }).data);
      onOpenChange(false);
    } catch (err) {
      setErrors(serverFieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'Could not save patient');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{patient ? `Edit ${patient.syntheticId}` : 'Register synthetic patient'}</DialogTitle>
            <DialogDescription>Use fictional information only. Never enter real patient data.{isDemo ? ' Saved in this browser only.' : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="pf-first" error={errors.firstName}><Input id="pf-first" value={form.firstName} onChange={set('firstName')} aria-invalid={!!errors.firstName} /></Field>
            <Field label="Last name" htmlFor="pf-last" error={errors.lastName}><Input id="pf-last" value={form.lastName} onChange={set('lastName')} aria-invalid={!!errors.lastName} /></Field>
            <Field label="Date of birth" htmlFor="pf-dob" error={errors.dateOfBirth}><Input id="pf-dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} aria-invalid={!!errors.dateOfBirth} /></Field>
            <Field label="Sex" htmlFor="pf-sex">
              <Select id="pf-sex" value={form.sex} onChange={set('sex')}>
                <option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option><option value="UNKNOWN">Unknown</option>
              </Select>
            </Field>
            <Field label="Research cohort" htmlFor="pf-cohort" error={errors.researchCohort}>
              <Input id="pf-cohort" list="cohort-list" value={form.researchCohort} onChange={set('researchCohort')} aria-invalid={!!errors.researchCohort} placeholder="e.g. Thoracic Imaging Study" />
              <datalist id="cohort-list">{cohorts.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Case status" htmlFor="pf-status">
              <Select id="pf-status" value={form.caseStatus} onChange={set('caseStatus')}>
                <option value="ACTIVE">Active</option><option value="MONITORING">Monitoring</option><option value="CLOSED">Closed</option>
              </Select>
            </Field>
            <Field label="Research summary" htmlFor="pf-summary" error={errors.summary} className="sm:col-span-2">
              <Textarea id="pf-summary" value={form.summary} onChange={set('summary')} placeholder="Brief synthetic case description (optional)" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{patient ? 'Save changes' : 'Register patient'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
