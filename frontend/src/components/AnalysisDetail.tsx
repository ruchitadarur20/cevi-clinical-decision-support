import { AlertTriangle, Cpu, Layers } from 'lucide-react';
import { imageSrc } from '@/demo/localImages';
import { useAnalysis } from '@/api/hooks';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { AnalysisStatusBadge, KeyValue, ModeBadge, ResearchDisclaimer, SyntheticBadge } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { RecordedBadge } from '@/components/demo/labels';
import { formatDateTime, formatMs, percent, titleCase } from '@/lib/format';
import type { Analysis } from '@/lib/types';

export function PredictionList({ predictions }: { predictions: NonNullable<Analysis['predictions']> }) {
  return (
    <ol className="space-y-2">
      {predictions.map((p) => (
        <li key={p.rank} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="text-xs text-muted-foreground tabular-nums">{p.rank}</span>
          <div>
            <p className="font-medium">{p.label}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, p.probability * 100)}%` }} /></div>
          </div>
          <span className="tabular-nums text-muted-foreground">{percent(p.probability)}</span>
        </li>
      ))}
    </ol>
  );
}

export function AnalysisResultView({ a }: { a: Analysis }) {
  const demo = a.mode === 'DEMONSTRATION';
  const pre = a.preprocessing as Record<string, any> | null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><AnalysisStatusBadge status={a.status} /><ModeBadge mode={a.mode} />{a.isSynthetic && <SyntheticBadge />}{a.recorded && <RecordedBadge />}</div>
      {a.recorded && <p className="-mt-2 text-xs text-muted-foreground">Recorded by the full CEVI stack (FastAPI + EfficientNet-B0 on CPU) and replayed here. It was not generated in your browser.</p>}

      {a.status === 'UNAVAILABLE' && (
        <div role="alert" className="flex gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-warning" /><div><p className="font-medium">Model inference unavailable</p><p className="mt-1 text-muted-foreground">Trained weights are not loaded in the ML service, so no predictions were produced. CEVI never fabricates model output.</p></div></div>
      )}
      {a.status === 'FAILED' && (
        <div role="alert" className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /><div><p className="font-medium">Analysis failed</p><p className="mt-1 text-muted-foreground">{a.errorMessage ?? 'The analysis could not be completed.'}</p></div></div>
      )}
      {demo && (
        <div className="rounded-md border bg-muted/50 p-4 text-sm"><p className="font-medium">Recorded demonstration entry</p><p className="mt-1 text-muted-foreground">This entry was seeded without a model run, so it carries no predictions. Run a new experimental analysis to see real model output.</p></div>
      )}

      {a.predictions && a.predictions.length > 0 && (
        <section>
          <h4 className="mb-1 text-sm font-semibold">Top predictions</h4>
          <p className="mb-3 text-xs text-muted-foreground">Labels come from the model's training vocabulary{a.weightsSource?.includes('IMAGENET') ? ' (ImageNet-1k everyday object categories) and are not medical findings' : ''}.</p>
          <PredictionList predictions={a.predictions} />
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-primary" /> Model</h4>
          <dl className="divide-y">
            <KeyValue label="Name">{a.modelName ?? '—'}</KeyValue>
            <KeyValue label="Version">{a.modelVersion ?? '—'}</KeyValue>
            <KeyValue label="Weights">{a.weightsSource ?? '—'}</KeyValue>
            <KeyValue label="Inference">{formatMs(a.inferenceMs)}</KeyValue>
            <KeyValue label="Total duration">{formatMs(a.totalMs)}</KeyValue>
          </dl>
        </div>
        <div className="rounded-md border p-4">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-teal" /> Input & preprocessing</h4>
          <dl className="divide-y">
            <KeyValue label="Image">{a.image.originalName}</KeyValue>
            <KeyValue label="Dimensions">{a.image.width}×{a.image.height}px</KeyValue>
            <KeyValue label="Colour">{pre?.color_mode ?? '—'}</KeyValue>
            <KeyValue label="Resize / crop">{pre ? `${pre.resize?.shorter_side}px → ${pre.center_crop?.join('×')}` : '—'}</KeyValue>
            <KeyValue label="Normalise">{pre ? 'ImageNet mean/std' : '—'}</KeyValue>
          </dl>
        </div>
      </section>

      {a.contextSnapshot && (
        <section className="rounded-md border p-4">
          <h4 className="mb-1 text-sm font-semibold">Linked clinical context</h4>
          <p className="mb-3 text-xs text-muted-foreground">{a.contextSnapshot.note}</p>
          {a.contextSnapshot.records.length === 0 ? <p className="text-sm text-muted-foreground">No clinical records attached.</p> : (
            <ul className="space-y-1.5">{a.contextSnapshot.records.map((r) => <li key={r.id} className="flex items-center gap-2 text-sm"><Badge tone="blue">{titleCase(r.type)}</Badge><span>{r.title}</span></li>)}</ul>
          )}
        </section>
      )}
      <p className="text-xs text-muted-foreground">Requested by {a.requestedBy.name.split(' (')[0]} · {formatDateTime(a.createdAt)}</p>
      <ResearchDisclaimer compact />
    </div>
  );
}

export function AnalysisDetailDialog({ analysisId, onClose }: { analysisId: string | null; onClose: () => void }) {
  const { data, isLoading } = useAnalysis(analysisId);
  return (
    <Dialog open={!!analysisId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Analysis details</DialogTitle>
          <DialogDescription>{data ? `${data.patient.displayName} · ${data.image.originalName}` : 'Loading…'}</DialogDescription>
        </DialogHeader>
        <DialogBody>{isLoading || !data ? <Spinner /> : <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div><img src={imageSrc(data.image.id)} alt={`Research image ${data.image.originalName}`} className="aspect-square w-full rounded-md border bg-muted object-cover" /></div>
          <AnalysisResultView a={data} />
        </div>}</DialogBody>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
