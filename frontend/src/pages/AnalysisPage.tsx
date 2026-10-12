import { useState } from 'react';
import { imageSrc } from '@/demo/localImages';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Brain, CheckCircle2, CircleAlert, History, Play } from 'lucide-react';
import { useImages, useMlStatus, usePatients, usePreprocessPreview, useRecords, useRunAnalysis } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { KeyValue, PageHeader, ProcessingBadge, ResearchDisclaimer } from '@/components/common';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Select } from '@/components/ui/input';
import { EmptyState, Skeleton, Spinner } from '@/components/ui/feedback';
import { AnalysisResultView } from '@/components/AnalysisDetail';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Analysis } from '@/lib/types';
import { isDemo } from '@/lib/demoConfig';
import { ModelWalkthrough } from '@/components/demo/ModelWalkthrough';
import { RecordedAnalysisPanel } from '@/components/demo/RecordedAnalysisPanel';
import { BrowserOnlyBadge } from '@/components/demo/labels';
import { formatDateTime, formatMs, titleCase } from '@/lib/format';

export default function AnalysisPage() {
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const [patientId, setPatientId] = useState(sp.get('patientId') ?? '');
  const [imageId, setImageId] = useState(sp.get('imageId') ?? '');
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [result, setResult] = useState<Analysis | null>(null);

  const patients = usePatients({ pageSize: 100, sort: 'name', order: 'asc' });
  const images = useImages({ patientId: patientId || undefined, pageSize: 50 });
  const records = useRecords({ patientId: patientId || undefined, pageSize: 50 });
  const ml = useMlStatus();
  const preview = usePreprocessPreview(imageId || null);
  const run = useRunAnalysis();
  const canRun = can('analyses:create');


  const selectedImage = images.data?.data.find((i) => i.id === imageId);
  const model = ml.data?.model;

  async function execute() {
    try {
      const res = await run.mutateAsync({ imageId, recordIds });
      setResult(res.data);
      if (res.data.status === 'COMPLETED') toast.success('Experimental analysis completed');
      else if (res.data.status === 'UNAVAILABLE') toast.warning('Model weights unavailable — no predictions produced');
      else toast.error('Analysis failed — see details');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not submit analysis');
    }
  }

  return (
    <div>
      <PageHeader title="AI Analysis Workspace" description={isDemo ? 'Select a fictional patient and an example image, review the preprocessing pipeline, inspect the model, and explore results recorded by the full application.' : 'Select a patient and research image, review the preprocessing pipeline, then request an experimental EfficientNet-B0 inference.'} actions={<Button asChild variant="outline"><Link to="/history"><History className="h-4 w-4" /> History</Link></Button>} />
      <ResearchDisclaimer className="mb-6" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>1 · Select patient and image</CardTitle><CardDescription>Only synthetic patients and uploaded research images are available.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Patient" htmlFor="an-patient">
                <Select id="an-patient" value={patientId} onChange={(e) => { setPatientId(e.target.value); setImageId(''); setRecordIds([]); setResult(null); }}>
                  <option value="">Select a patient…</option>
                  {patients.data?.data.map((p) => <option key={p.id} value={p.id}>{p.displayName} — {p.syntheticId}</option>)}
                </Select>
              </Field>
              {patientId && (
                images.isLoading ? <Skeleton className="h-24 w-full" /> : !images.data?.data.length ? (
                  <EmptyState title="No images for this patient" description="Upload a research image from the Medical Imaging page first." action={<Button asChild size="sm" variant="outline"><Link to="/imaging">Go to imaging</Link></Button>} />
                ) : (
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">Research image</legend>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {images.data.data.map((img) => (
                        <button key={img.id} type="button" aria-pressed={imageId === img.id} onClick={() => { setImageId(img.id); setResult(null); }}
                          className={cn('overflow-hidden rounded-md border text-left transition-all', imageId === img.id ? 'ring-2 ring-primary' : 'hover:border-primary/50')}>
                          <img src={imageSrc(img.id)} alt={img.originalName} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
                          <div className="space-y-1 p-2"><p className="truncate text-xs font-medium">{img.originalName}</p><div className="flex flex-wrap gap-1"><ProcessingBadge status={img.processingStatus} />{img.browserOnly && <BrowserOnlyBadge />}</div></div>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2 · Link clinical context (optional)</CardTitle><CardDescription>Structured records are stored with the result for reviewers. They are not inputs to the image model.</CardDescription></CardHeader>
            <CardContent>
              {!patientId ? <p className="text-sm text-muted-foreground">Select a patient first.</p> : records.isLoading ? <Skeleton className="h-16 w-full" /> : !records.data?.data.length ? <p className="text-sm text-muted-foreground">This patient has no clinical records.</p> : (
                <ul className="space-y-2">
                  {records.data.data.slice(0, 10).map((r) => {
                    const checked = recordIds.includes(r.id);
                    return (
                      <li key={r.id}>
                        <label className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm', checked && 'border-primary bg-accent/60')}>
                          <input type="checkbox" className="mt-1" checked={checked} onChange={() => setRecordIds((ids) => (checked ? ids.filter((x) => x !== r.id) : [...ids, r.id]))} />
                          <span className="min-w-0 flex-1"><span className="block font-medium">{r.title}</span><span className="block truncate text-xs text-muted-foreground">{titleCase(r.type)} · {r.content}</span></span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3 · Review preprocessing</CardTitle><CardDescription>Output of the standardised pipeline applied before inference.</CardDescription></CardHeader>
            <CardContent>
              {!imageId ? <p className="text-sm text-muted-foreground">Select an image to preview its preprocessing.</p> : preview.isLoading ? <Spinner label="Running preprocessing preview" /> : preview.error ? (
                <p className="text-sm text-destructive" role="alert">{(preview.error as Error).message}</p>
              ) : preview.data && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <dl className="divide-y rounded-md border px-4">
                    <KeyValue label="Colour mode">{preview.data.preprocessing.color_mode}</KeyValue>
                    <KeyValue label="Resize">{preview.data.preprocessing.resize.shorter_side}px · {preview.data.preprocessing.resize.interpolation}</KeyValue>
                    <KeyValue label="Center crop">{preview.data.preprocessing.center_crop.join(' × ')}</KeyValue>
                    <KeyValue label="Layout / dtype">{preview.data.preprocessing.layout} · {preview.data.preprocessing.dtype}</KeyValue>
                    <KeyValue label="Source">{preview.data.preprocessing.input.width}×{preview.data.preprocessing.input.height} {preview.data.preprocessing.input.format}</KeyValue>
                  </dl>
                  <dl className="divide-y rounded-md border px-4">
                    <KeyValue label="Tensor shape">[{preview.data.tensor.shape.join(', ')}]</KeyValue>
                    <KeyValue label="Mean / std (norm.)">{preview.data.tensor.mean} / {preview.data.tensor.std}</KeyValue>
                    <KeyValue label="Value range">{preview.data.tensor.min} … {preview.data.tensor.max}</KeyValue>
                    <KeyValue label="Normalise mean">{preview.data.preprocessing.normalize.mean.join(', ')}</KeyValue>
                    <KeyValue label="Preprocess time">{formatMs(preview.data.timing.preprocess_ms)}</KeyValue>
                  </dl>
                </div>
              )}
            </CardContent>
          </Card>

          {isDemo ? (
            <Card>
              <CardHeader><CardTitle>4 · Recorded analysis results</CardTitle><CardDescription>Results previously produced by the full application for the selected image.</CardDescription></CardHeader>
              <CardContent>
                {!imageId ? <p className="text-sm text-muted-foreground">Select an image to see its recorded results.</p> : <RecordedAnalysisPanel imageId={imageId} browserOnly={selectedImage?.browserOnly} />}
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader><CardTitle>4 · Request experimental inference</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!canRun && <p className="text-sm text-muted-foreground">Your role can review analyses but not request new ones.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={execute} disabled={!canRun || !imageId} loading={run.isPending}><Play className="h-4 w-4" /> Run experimental analysis</Button>
                {selectedImage && <span className="text-sm text-muted-foreground">on {selectedImage.originalName}</span>}
              </div>
              {run.isPending && <p className="text-sm text-muted-foreground" role="status">Preprocessing and running EfficientNet-B0 on CPU…</p>}
              {result && <div className="border-t pt-4"><AnalysisResultView a={result} /></div>}
            </CardContent>
          </Card>
          )}
          {isDemo && <ModelWalkthrough model={model} />}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between"><CardTitle>{isDemo ? 'Model card' : 'Model service'}</CardTitle>
                {ml.isLoading ? null : isDemo ? <Badge tone="teal">Recorded</Badge> : ml.data?.reachable ? <Badge tone={ml.data.health?.model_ready ? 'success' : 'warning'}>{ml.data.health?.model_ready ? 'Ready' : 'Degraded'}</Badge> : <Badge tone="danger">Unreachable</Badge>}
              </div>
              <CardDescription>{isDemo ? `Captured from the FastAPI service on ${formatDateTime(ml.data?.snapshotAt)}. No service is running in this demo.` : 'EfficientNet-B0 inference service'}</CardDescription>
            </CardHeader>
            <CardContent>
              {ml.isLoading ? <Skeleton className="h-40 w-full" /> : !ml.data?.reachable ? (
                <div className="flex gap-2 text-sm text-muted-foreground"><CircleAlert className="h-4 w-4 shrink-0 text-destructive" /> The ML service cannot be reached. Analyses will be recorded as failed. Start it with <code className="rounded bg-muted px-1">ml-service/run.sh</code>.</div>
              ) : model && (
                <>
                  <dl className="divide-y">
                    <KeyValue label="Architecture">{model.name}</KeyValue>
                    <KeyValue label="Version">{model.version}</KeyValue>
                    <KeyValue label="Parameters">{(model.num_parameters / 1e6).toFixed(2)} M</KeyValue>
                    <KeyValue label="Input size">{model.input_size.join('×')}</KeyValue>
                    <KeyValue label="Trained on">{model.trained_task}</KeyValue>
                    <KeyValue label="Clinically validated">{model.clinically_validated ? 'Yes' : <span className="text-destructive">No</span>}</KeyValue>
                  </dl>
                  <ul className="mt-4 space-y-2 text-xs text-muted-foreground">{model.notes.map((n, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />{n}</li>)}</ul>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Research limitations</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                <li>General-purpose ImageNet weights recognise everyday objects, not pathology.</li>
                <li>Probabilities are not calibrated and carry no diagnostic meaning.</li>
                <li>Clinical text is attached for review only; the image model does not read it.</li>
                <li>No clinical performance metrics have been measured for this prototype.</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
