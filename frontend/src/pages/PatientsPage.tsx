import { useState } from 'react';
import { BrowserOnlyBadge } from '@/components/demo/labels';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useCohorts, usePatients } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { CaseStatusBadge, PageHeader, SearchBox, SyntheticBadge } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { PatientFormDialog } from '@/components/forms/PatientFormDialog';
import { formatDate } from '@/lib/format';

export default function PatientsPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounce(q, 300);
  const status = sp.get('status') ?? '';
  const cohort = sp.get('cohort') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const [creating, setCreating] = useState(false);

  const cohorts = useCohorts();
  const { data, isLoading, isFetching, error, refetch } = usePatients({ q: dq || undefined, status: status || undefined, cohort: cohort || undefined, page, pageSize: 12 });

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };
  const identified = can('patients:identify');

  return (
    <div>
      <PageHeader
        title="Patients"
        description={identified ? 'Fictional patient records for research workflows.' : 'Anonymized synthetic research participants. Identifying fields are withheld for your role.'}
        actions={can('patients:write') && <Button onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> Register patient</Button>}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <SearchBox value={q} onChange={(v) => { setQ(v); update({ q: v }); }} placeholder={identified ? 'Search by name, ID or cohort' : 'Search by ID or cohort'} className="md:w-80" />
          <Select aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value })} className="md:w-44">
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="MONITORING">Monitoring</option><option value="CLOSED">Closed</option>
          </Select>
          <Select aria-label="Filter by cohort" value={cohort} onChange={(e) => update({ cohort: e.target.value })} className="md:w-60">
            <option value="">All cohorts</option>
            {cohorts.data?.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </Select>
          {(q || status || cohort) && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setSp({}, { replace: true }); }}>Clear filters</Button>}
        </div>

        {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data?.data.length ? (
          <EmptyState title="No patients match your filters" description="Try a different search term or clear the filters." />
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Patient</TH><TH>Synthetic ID</TH><TH className="hidden md:table-cell">Cohort</TH><TH>Status</TH><TH className="hidden sm:table-cell">Age</TH><TH className="hidden lg:table-cell">Records</TH><TH className="hidden lg:table-cell">Images</TH><TH className="hidden xl:table-cell">Registered</TH></TR></THead>
              <TBody>
                {data.data.map((p) => (
                  <TR key={p.id} className="cursor-pointer" onClick={() => nav(`/patients/${p.id}`)}>
                    <TD><Link to={`/patients/${p.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{p.displayName}</Link>{p.browserOnly && <span className="ml-2"><BrowserOnlyBadge /></span>}</TD>
                    <TD className="font-mono text-xs">{p.syntheticId} <SyntheticBadge /></TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{p.researchCohort}</TD>
                    <TD><CaseStatusBadge status={p.caseStatus} /></TD>
                    <TD className="hidden sm:table-cell">{p.age ?? `${p.ageBand} y`}</TD>
                    <TD className="hidden lg:table-cell tabular-nums">{p.recordCount}</TD>
                    <TD className="hidden lg:table-cell tabular-nums">{p.imageCount}</TD>
                    <TD className="hidden text-muted-foreground xl:table-cell">{formatDate(p.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={(p) => update({ page: String(p) })} />
          </div>
        )}
      </Card>
      <PatientFormDialog open={creating} onOpenChange={setCreating} cohorts={cohorts.data?.map((c) => c.name)} onSaved={(p) => nav(`/patients/${p.id}`)} />
    </div>
  );
}
