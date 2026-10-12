import { useState } from 'react';
import { RecordedBadge } from '@/components/demo/labels';
import { isDemo } from '@/lib/demoConfig';
import { useSearchParams } from 'react-router-dom';
import { useAnalyses } from '@/api/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { AnalysisStatusBadge, ModeBadge, PageHeader, SearchBox } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { AnalysisDetailDialog } from '@/components/AnalysisDetail';
import { formatDateTime, formatMs } from '@/lib/format';

export default function HistoryPage() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounce(q, 300);
  const status = sp.get('status') ?? '';
  const mode = sp.get('mode') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const [openId, setOpenId] = useState<string | null>(sp.get('open'));
  const { data, isLoading, error, refetch } = useAnalyses({ q: dq || undefined, status: status || undefined, mode: mode || undefined, page, pageSize: 12 });

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    next.delete('open');
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Analysis History" description={isDemo ? 'Analyses recorded by the full application, with model metadata, timing and linked context. Replayed from the bundled dataset.' : 'Every experimental analysis request, persisted with model metadata, timing and linked context.'} />
      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <SearchBox value={q} onChange={(v) => { setQ(v); update({ q: v }); }} placeholder="Search image, patient ID or model" className="md:w-80" />
          <Select aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value })} className="md:w-48">
            <option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="UNAVAILABLE">Unavailable</option><option value="PROCESSING">Processing</option>
          </Select>
          <Select aria-label="Filter by mode" value={mode} onChange={(e) => update({ mode: e.target.value })} className="md:w-56">
            <option value="">All modes</option><option value="EXPERIMENTAL_INFERENCE">Experimental inference</option><option value="DEMONSTRATION">Recorded demonstration</option>
          </Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data?.data.length ? <EmptyState title="No analyses found" description="Run an analysis from the AI Analysis workspace." /> : (
          <>
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>When</TH><TH>Patient</TH><TH>Image</TH><TH>Status</TH><TH className="hidden md:table-cell">Mode</TH><TH className="hidden lg:table-cell">Model</TH><TH className="hidden sm:table-cell">Inference</TH><TH className="hidden xl:table-cell">Top label</TH></TR></THead>
              <TBody>
                {data.data.map((a) => (
                  <TR key={a.id} className="cursor-pointer" onClick={() => setOpenId(a.id)}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.createdAt)}</TD>
                    <TD className="whitespace-nowrap"><span className="block">{a.patient.displayName}</span><span className="font-mono text-xs text-muted-foreground">{a.patient.syntheticId}</span></TD>
                    <TD><button className="max-w-[10rem] truncate text-left font-medium text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(a.id); }}>{a.image.originalName}</button></TD>
                    <TD><AnalysisStatusBadge status={a.status} /></TD>
                    <TD className="hidden md:table-cell">{isDemo ? <RecordedBadge /> : <ModeBadge mode={a.mode} />}</TD>
                    <TD className="hidden text-muted-foreground lg:table-cell">{a.modelName ? `${a.modelName} · ${a.modelVersion}` : '—'}</TD>
                    <TD className="hidden tabular-nums sm:table-cell">{formatMs(a.inferenceMs)}</TD>
                    <TD className="hidden max-w-[12rem] truncate text-muted-foreground xl:table-cell">{a.predictions?.[0]?.label ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
      <AnalysisDetailDialog analysisId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
