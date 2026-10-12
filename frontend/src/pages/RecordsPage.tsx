import { useState } from 'react';
import { BrowserOnlyBadge } from '@/components/demo/labels';
import { useSearchParams } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { useRecords } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader, SearchBox, SeverityBadge } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { RECORD_TYPES, RecordDetailDialog, RecordFormDialog } from '@/components/forms/RecordDialogs';
import { formatDate, titleCase } from '@/lib/format';

export default function RecordsPage() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounce(q, 300);
  const type = sp.get('type') ?? '';
  const severity = sp.get('severity') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useRecords({ q: dq || undefined, type: type || undefined, severity: severity || undefined, page, pageSize: 12 });

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
      <PageHeader title="Clinical Records" description="Synthetic clinical observations, notes and results linked to patients." actions={can('records:write') && <Button onClick={() => setCreating(true)}><FilePlus2 className="h-4 w-4" /> New record</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <SearchBox value={q} onChange={(v) => { setQ(v); update({ q: v }); }} placeholder="Search title or content" className="md:w-80" />
          <Select aria-label="Filter by type" value={type} onChange={(e) => update({ type: e.target.value })} className="md:w-48">
            <option value="">All types</option>{RECORD_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
          <Select aria-label="Filter by severity" value={severity} onChange={(e) => update({ severity: e.target.value })} className="md:w-44">
            <option value="">All severities</option><option value="ROUTINE">Routine</option><option value="ELEVATED">Elevated</option><option value="URGENT">Urgent</option>
          </Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data?.data.length ? <EmptyState title="No clinical records found" description="Adjust your filters or create a new record." /> : (
          <>
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Title</TH><TH>Patient</TH><TH className="hidden md:table-cell">Type</TH><TH>Severity</TH><TH className="hidden lg:table-cell">Author</TH><TH className="hidden sm:table-cell">Recorded</TH><TH className="hidden xl:table-cell">Ver.</TH></TR></THead>
              <TBody>
                {data.data.map((r) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TD><button className="text-left font-medium text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>{r.title}</button>{r.browserOnly && <span className="ml-2"><BrowserOnlyBadge /></span>}</TD>
                    <TD><span className="block">{r.patient.displayName}</span><span className="font-mono text-xs text-muted-foreground">{r.patient.syntheticId}</span></TD>
                    <TD className="hidden md:table-cell"><Badge tone="blue">{titleCase(r.type)}</Badge></TD>
                    <TD><SeverityBadge severity={r.severity} /></TD>
                    <TD className="hidden text-muted-foreground lg:table-cell">{r.author.name.split(' (')[0]}</TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{formatDate(r.recordedAt)}</TD>
                    <TD className="hidden xl:table-cell tabular-nums">v{r.version}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
      <RecordFormDialog open={creating} onOpenChange={setCreating} />
      <RecordDetailDialog recordId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
