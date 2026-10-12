import { useState } from 'react';
import { BrowserOnlyBadge } from '@/components/demo/labels';
import { imageSrc } from '@/demo/localImages';
import { Link, useSearchParams } from 'react-router-dom';
import { Brain, ImagePlus } from 'lucide-react';
import { useImage, useImages } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { AnalysisStatusBadge, KeyValue, PageHeader, ProcessingBadge, SearchBox, SyntheticBadge } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { ImageUploadDialog } from '@/components/forms/ImageUploadDialog';
import { formatBytes, formatDateTime, formatMs, titleCase } from '@/lib/format';

function ImageDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useImage(id);
  const { can } = useAuth();
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{data?.originalName ?? 'Image'}</DialogTitle><DialogDescription>{data ? `${data.patient.displayName} · ${data.patient.syntheticId}` : 'Loading…'}</DialogDescription></DialogHeader>
        <DialogBody>
          {isLoading || !data ? <Spinner /> : (
            <div className="grid gap-6 md:grid-cols-2">
              <img src={imageSrc(data.id)} alt={`Research image ${data.originalName}`} className="w-full rounded-md border bg-muted object-contain" />
              <div>
                <div className="mb-3 flex flex-wrap gap-2"><ProcessingBadge status={data.processingStatus} /><Badge tone="blue">{titleCase(data.modality)}</Badge>{data.isSynthetic && <SyntheticBadge />}{data.browserOnly && <BrowserOnlyBadge />}</div>
                <dl className="divide-y">
                  <KeyValue label="Dimensions">{data.width} × {data.height} px</KeyValue>
                  <KeyValue label="Format">{data.mimeType}</KeyValue>
                  <KeyValue label="File size">{formatBytes(data.sizeBytes)}</KeyValue>
                  <KeyValue label="Uploaded">{formatDateTime(data.createdAt)}</KeyValue>
                  <KeyValue label="Uploaded by">{data.uploadedBy.name.split(' (')[0]}</KeyValue>
                  <KeyValue label="SHA-256"><span className="font-mono text-xs">{data.sha256.slice(0, 16)}…</span></KeyValue>
                </dl>
                {data.description && <p className="mt-3 text-sm text-muted-foreground">{data.description}</p>}
                <h4 className="mb-2 mt-5 text-sm font-semibold">Analyses ({data.analyses.length})</h4>
                {data.analyses.length === 0 ? <p className="text-sm text-muted-foreground">Not analysed yet.</p> : (
                  <ul className="space-y-2">
                    {data.analyses.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <Link to={`/history?open=${a.id}`} className="text-primary hover:underline">{formatDateTime(a.createdAt)}</Link>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">{formatMs(a.inferenceMs)}<AnalysisStatusBadge status={a.status} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {data && can('analyses:create') && <Button asChild><Link to={`/analysis?imageId=${data.id}&patientId=${data.patient.id}`}><Brain className="h-4 w-4" /> Analyse image</Link></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ImagingPage() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounce(q, 300);
  const modality = sp.get('modality') ?? '';
  const status = sp.get('status') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useImages({ q: dq || undefined, modality: modality || undefined, status: status || undefined, page, pageSize: 12 });

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Medical Imaging" description="Research image workspace. Files are validated by signature, size and dimensions, then stored outside the database." actions={can('images:write') && <Button onClick={() => setUploading(true)}><ImagePlus className="h-4 w-4" /> Upload image</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <SearchBox value={q} onChange={(v) => { setQ(v); update({ q: v }); }} placeholder="Search file name or patient ID" className="md:w-80" />
          <Select aria-label="Filter by modality" value={modality} onChange={(e) => update({ modality: e.target.value })} className="md:w-44">
            <option value="">All modalities</option><option value="XRAY">X-ray</option><option value="CT">CT</option><option value="MRI">MRI</option><option value="ULTRASOUND">Ultrasound</option><option value="DERMATOSCOPY">Dermatoscopy</option><option value="OTHER">Other</option>
          </Select>
          <Select aria-label="Filter by processing status" value={status} onChange={(e) => update({ status: e.target.value })} className="md:w-48">
            <option value="">All statuses</option><option value="UPLOADED">Uploaded</option><option value="ANALYZING">Analyzing</option><option value="ANALYZED">Analyzed</option><option value="FAILED">Failed</option>
          </Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56" />)}</div>
        ) : !data?.data.length ? <EmptyState title="No images found" description={can('images:write') ? 'Upload a research image to get started.' : 'No images match the current filters.'} /> : (
          <>
            <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.data.map((img) => (
                <li key={img.id}>
                  <button onClick={() => setOpenId(img.id)} className="group w-full overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-pop">
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img src={imageSrc(img.id)} alt={img.originalName} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    </div>
                    <div className="space-y-1.5 p-3">
                      <p className="truncate text-sm font-medium">{img.originalName}</p>
                      <p className="truncate text-xs text-muted-foreground">{img.patient.displayName} · {img.patient.syntheticId}</p>
                      <div className="flex flex-wrap items-center gap-1.5"><ProcessingBadge status={img.processingStatus} /><Badge tone="outline">{titleCase(img.modality)}</Badge>{img.browserOnly && <BrowserOnlyBadge />}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination meta={data.meta} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
      <ImageUploadDialog open={uploading} onOpenChange={setUploading} onUploaded={(i) => setOpenId(i.id)} />
      <ImageDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
