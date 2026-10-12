import { useState } from 'react';
import { isDemo } from '@/lib/demoConfig';
import { BrowserOnlyBadge } from '@/components/demo/labels';
import { imageSrc } from '@/demo/localImages';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Brain, CalendarDays, FilePlus2, ImagePlus, Pencil, UserRound } from 'lucide-react';
import { useCohorts, usePatient } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { AnalysisStatusBadge, CaseStatusBadge, KeyValue, ModeBadge, ProcessingBadge, SeverityBadge, SyntheticBadge } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PatientFormDialog } from '@/components/forms/PatientFormDialog';
import { RecordDetailDialog, RecordFormDialog } from '@/components/forms/RecordDialogs';
import { ImageUploadDialog } from '@/components/forms/ImageUploadDialog';
import { AnalysisDetailDialog } from '@/components/AnalysisDetail';
import { formatDate, formatDateTime, formatMs, timeAgo, titleCase } from '@/lib/format';

export default function PatientDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const { data: p, isLoading, error, refetch } = usePatient(id);
  const cohorts = useCohorts();
  const [editing, setEditing] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  if (error) return <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card>;
  if (isLoading || !p) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link to="/patients"><ArrowLeft className="h-4 w-4" /> All patients</Link></Button>

      <Card className="mb-6">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-7 w-7" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{p.displayName}</h1><CaseStatusBadge status={p.caseStatus} /><SyntheticBadge />{p.browserOnly && <BrowserOnlyBadge />}</div>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{p.syntheticId}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{p.age != null ? `${p.age} y` : `${p.ageBand} y`} · {titleCase(p.sex)}</span>
                <span>{p.researchCohort}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Registered {formatDate(p.createdAt)}</span>
              </p>
              {p.anonymized && <p className="mt-2 text-xs text-muted-foreground">Identifying fields are withheld for the researcher role.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('patients:write') && <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {can('records:write') && <Button variant="outline" onClick={() => setNewRecord(true)}><FilePlus2 className="h-4 w-4" /> Add record</Button>}
            {can('images:write') && <Button variant="outline" onClick={() => setUploading(true)}><ImagePlus className="h-4 w-4" /> Upload image</Button>}
            {can('analyses:create') && <Button asChild><Link to={`/analysis?patientId=${p.id}`}><Brain className="h-4 w-4" /> Analyse</Link></Button>}
          </div>
        </div>
        {p.summary && <p className="border-t px-5 py-3 text-sm text-muted-foreground">{p.summary}</p>}
      </Card>

      <Tabs defaultValue="records">
        <TabsList>
          <TabsTrigger value="records">Clinical records ({p.recordCount})</TabsTrigger>
          <TabsTrigger value="images">Images ({p.imageCount})</TabsTrigger>
          <TabsTrigger value="analyses">Analyses ({p.analyses.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="mt-4">
          {p.records.length === 0 ? <Card><EmptyState title="No clinical records yet" description="Records linked to this patient will appear here." /></Card> : (
            <ol className="relative space-y-4 border-l pl-6">
              {p.records.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -left-[31px] top-3 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                  <Card className="cursor-pointer p-4 transition-shadow hover:shadow-pop" onClick={() => setRecordId(r.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{r.title}</h3><Badge tone="blue">{titleCase(r.type)}</Badge><SeverityBadge severity={r.severity} />
                      {r.version > 1 && <Badge tone="outline">v{r.version} · edited</Badge>}{r.browserOnly && <BrowserOnlyBadge />}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.content}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(r.recordedAt)} · {r.author.name.split(' (')[0]}</p>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          {p.images.length === 0 ? <Card><EmptyState title="No images yet" description="Upload a research image to begin analysis." /></Card> : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {p.images.map((i) => (
                <li key={i.id}>
                  <Card className="overflow-hidden">
                    <img src={imageSrc(i.id)} alt={i.originalName} loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" />
                    <div className="space-y-1.5 p-3"><p className="truncate text-sm font-medium">{i.originalName}</p><div className="flex items-center gap-1.5"><ProcessingBadge status={i.processingStatus} /><Badge tone="outline">{titleCase(i.modality)}</Badge>{i.browserOnly && <BrowserOnlyBadge />}</div>
                      {can('analyses:create') && <Button asChild size="sm" variant="secondary" className="mt-1 w-full"><Link to={`/analysis?patientId=${p.id}&imageId=${i.id}`}>{isDemo ? 'View analysis' : 'Analyse'}</Link></Button>}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="analyses" className="mt-4">
          <Card>
            {p.analyses.length === 0 ? <EmptyState title="No analyses yet" description="Experimental analyses of this patient's images appear here." /> : (
              <ul className="divide-y">
                {p.analyses.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <button className="text-left" onClick={() => setAnalysisId(a.id)}>
                      <span className="block text-sm font-medium text-primary hover:underline">{a.image.originalName}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)} · {a.modelName ?? 'No model'} · {formatMs(a.inferenceMs)}</span>
                    </button>
                    <div className="flex items-center gap-2"><ModeBadge mode={a.mode} /><AnalysisStatusBadge status={a.status} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
              <CardContent>
                {p.activity.length === 0 ? <p className="text-sm text-muted-foreground">No recorded activity.</p> : (
                  <ul className="space-y-3">{p.activity.map((a) => <li key={a.id} className="text-sm">{a.summary}<span className="block text-xs text-muted-foreground">{a.actor ?? 'System'} · {timeAgo(a.createdAt)}</span></li>)}</ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Case information</CardTitle></CardHeader>
              <CardContent><dl className="divide-y">
                <KeyValue label="Synthetic ID">{p.syntheticId}</KeyValue>
                <KeyValue label="Cohort">{p.researchCohort}</KeyValue>
                <KeyValue label="Registered by">{p.createdBy.name.split(' (')[0]}</KeyValue>
                <KeyValue label="Last updated">{formatDateTime(p.updatedAt)}</KeyValue>
              </dl></CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <PatientFormDialog open={editing} onOpenChange={setEditing} patient={p} cohorts={cohorts.data?.map((c) => c.name)} />
      <RecordFormDialog open={newRecord} onOpenChange={setNewRecord} patientId={p.id} />
      <ImageUploadDialog open={uploading} onOpenChange={setUploading} patientId={p.id} />
      <RecordDetailDialog recordId={recordId} onClose={() => setRecordId(null)} />
      <AnalysisDetailDialog analysisId={analysisId} onClose={() => setAnalysisId(null)} />
    </div>
  );
}
