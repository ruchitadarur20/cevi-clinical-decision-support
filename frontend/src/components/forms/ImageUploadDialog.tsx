import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { isDemo } from '@/lib/demoConfig';
import { ImagePlus, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { usePatients, useUploadImage } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MedicalImage } from '@/lib/types';

const MAX_BYTES = 8 * 1024 * 1024;
const MODALITIES = ['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'DERMATOSCOPY', 'OTHER'] as const;

export function validateImageFile(file: File | null): string | null {
  if (!file) return 'Choose an image to upload';
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Only JPEG and PNG images are supported';
  if (file.size > MAX_BYTES) return `File is too large (${formatBytes(file.size)}). Maximum is 8 MB`;
  if (file.size === 0) return 'File is empty';
  return null;
}

export function ImageUploadDialog({ open, onOpenChange, patientId, onUploaded }: { open: boolean; onOpenChange: (o: boolean) => void; patientId?: string; onUploaded?: (i: MedicalImage) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pid, setPid] = useState(patientId ?? '');
  const [modality, setModality] = useState('XRAY');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const patients = usePatients({ pageSize: 100, sort: 'name', order: 'asc' });
  const upload = useUploadImage();

  useEffect(() => {
    if (open) { setFile(null); setPid(patientId ?? ''); setDescription(''); setErrors({}); setModality('XRAY'); }
  }, [open, patientId]);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setErrors((e) => ({ ...e, file: validateImageFile(f) ?? '' }));
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const fe = validateImageFile(file);
    if (fe) next.file = fe;
    if (!pid) next.patientId = 'Select a patient';
    setErrors(next);
    if (Object.keys(next).length || !file) return;
    const form = new FormData();
    form.append('patientId', pid);
    form.append('modality', modality);
    if (description.trim()) form.append('description', description.trim());
    form.append('file', file);
    try {
      const res = await upload.mutateAsync(form);
      toast.success(`${res.data.originalName} uploaded (${res.data.width}×${res.data.height})`);
      onUploaded?.(res.data);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fieldErrors, ...(Object.keys(err.fieldErrors).length ? {} : { file: err.message }) });
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Upload research image</DialogTitle>
            <DialogDescription>{isDemo ? 'JPEG or PNG, up to 8 MB. The file is inspected and previewed in your browser only — it is never uploaded to a server.' : 'JPEG or PNG, up to 8 MB. Use synthetic or de-identified research images only.'}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors', dragging ? 'border-primary bg-accent' : 'border-input', errors.file && 'border-destructive')}
            >
              {preview ? <img src={preview} alt="Selected file preview" className="max-h-48 rounded-md border object-contain" /> : <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />}
              <p className="text-sm font-medium">{file ? `${file.name} · ${formatBytes(file.size)}` : 'Drag and drop an image, or'}</p>
              <input ref={input} id="upload-file" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Image file" />
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" /> {file ? 'Choose a different file' : 'Browse files'}</Button>
              {errors.file && <p role="alert" className="text-xs font-medium text-destructive">{errors.file}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Patient" htmlFor="up-patient" error={errors.patientId} className="sm:col-span-2">
                <Select id="up-patient" value={pid} onChange={(e) => setPid(e.target.value)} disabled={!!patientId} aria-invalid={!!errors.patientId}>
                  <option value="">Select a patient…</option>
                  {patients.data?.data.map((p) => <option key={p.id} value={p.id}>{p.displayName} — {p.syntheticId}</option>)}
                </Select>
              </Field>
              <Field label="Modality" htmlFor="up-modality">
                <Select id="up-modality" value={modality} onChange={(e) => setModality(e.target.value)}>{MODALITIES.map((m) => <option key={m} value={m}>{m === 'XRAY' ? 'X-ray' : m.charAt(0) + m.slice(1).toLowerCase()}</option>)}</Select>
              </Field>
              <Field label="Description" htmlFor="up-desc" hint="Optional"><Input id="up-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={upload.isPending}>{isDemo ? 'Add to demo (browser-only)' : 'Upload image'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
