import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useAnalyses, useAnalysis } from '@/api/hooks';
import { AnalysisResultView } from '@/components/AnalysisDetail';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { formatDateTime, formatMs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FullStackOnlyBadge } from './labels';

/** Replaces the "run inference" step in the portfolio demo: shows only results the real service recorded. */
export function RecordedAnalysisPanel({ imageId, browserOnly }: { imageId: string; browserOnly?: boolean }) {
  const list = useAnalyses({ imageId, pageSize: 20 });
  const [pick, setPick] = useState<string | null>(null);
  const rows = list.data?.data ?? [];
  useEffect(() => { setPick(null); }, [imageId]);
  const activeId = pick ?? rows[0]?.id ?? null;
  const detail = useAnalysis(activeId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled title="Live inference needs the FastAPI + PyTorch service, which is not part of the static demo.">
          <Play className="h-4 w-4" /> Run live inference
        </Button>
        <FullStackOnlyBadge>Requires inference service</FullStackOnlyBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        This demo never runs a model. Results below were recorded by the full application and are replayed unchanged.
      </p>

      {list.isLoading ? <Spinner label="Loading recorded results" /> : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm">
          <p className="font-medium">No recorded analysis for this image</p>
          <p className="mt-1 text-muted-foreground">
            {browserOnly
              ? 'This image exists only in your browser. The preprocessing preview above was computed locally; producing predictions requires the full application’s inference service.'
              : 'This image was not analysed when the dataset was recorded. In the full application, you would request an experimental analysis here.'}
          </p>
        </div>
      ) : (
        <>
          {rows.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recorded analyses for this image">
              {rows.map((a, i) => (
                <button key={a.id} role="tab" aria-selected={a.id === activeId} onClick={() => setPick(a.id)}
                  className={cn('rounded-md border px-3 py-1.5 text-xs', a.id === activeId ? 'border-primary bg-accent font-medium' : 'hover:bg-muted')}>
                  Run {rows.length - i} · {formatDateTime(a.createdAt)} · {formatMs(a.inferenceMs)}
                </button>
              ))}
            </div>
          )}
          <div className="border-t pt-4">{detail.isLoading || !detail.data ? <Spinner /> : <AnalysisResultView a={detail.data} />}</div>
        </>
      )}
    </div>
  );
}
