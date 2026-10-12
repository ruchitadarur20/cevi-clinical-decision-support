import { Link } from 'react-router-dom';
import { isDemo } from '@/lib/demoConfig';
import { AboutDemo } from '@/components/demo/AboutDemo';
import { RecordedBadge } from '@/components/demo/labels';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Activity, ArrowRight, Brain, CheckCircle2, Clock, FileText, FlaskConical, ImageIcon, Info, Users } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboard } from '@/api/hooks';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader, StatCard, AnalysisStatusBadge, ModeBadge, CHART_COLORS } from '@/components/common';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ChartCard, DonutChart, HBarChart, axisProps, shortDate, tooltipStyle } from '@/components/charts';
import { formatMs, timeAgo, titleCase } from '@/lib/format';

export default function OverviewPage() {
  const { user, can } = useAuth();
  const [days, setDays] = useState(14);
  const { data, isLoading, error, refetch } = useDashboard(isDemo ? days : undefined);
  const t = data?.totals;
  const span = isDemo ? data?.windowDays ?? days : 14;

  return (
    <div>
      <PageHeader
        title={isDemo ? 'Overview' : `Welcome, ${user?.name.split(' (')[0]}`}
        description="Clinical operations overview across patients, records, imaging and experimental model analyses."
        actions={
          isDemo ? (
            <div role="group" aria-label="Date range" className="inline-flex rounded-md border bg-card p-0.5">
              {[7, 14, 30, 90].map((d) => (
                <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
                  className={cn('rounded px-3 py-1.5 text-xs font-medium transition-colors', days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {d} days
                </button>
              ))}
            </div>
          ) : can('analyses:create') ? <Button asChild><Link to="/analysis"><Brain className="h-4 w-4" /> New analysis</Link></Button> : undefined
        }
      />

      {isDemo && <AboutDemo />}

      <div role="note" className="mb-6 flex items-start gap-3 rounded-md border bg-accent/60 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p><span className="font-medium">Synthetic data environment.</span> {data?.dataNotice ?? 'All patient data in this environment is synthetic and generated for demonstration purposes.'}</p>
      </div>

      {error ? <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard loading={isLoading} label="Synthetic patients" value={t?.patients} hint={`${t?.activeCases ?? 0} active cases`} icon={<Users className="h-5 w-5" />} />
            <StatCard loading={isLoading} label="Clinical records" value={t?.records} hint={`${t?.recordsLast14Days ?? 0} in last ${span} days`} icon={<FileText className="h-5 w-5" />} tone="teal" />
            <StatCard loading={isLoading} label="Medical images" value={t?.images} hint="Research uploads" icon={<ImageIcon className="h-5 w-5" />} tone="slate" />
            <StatCard loading={isLoading} label="Completed analyses" value={t?.analysesCompleted} hint={`${t?.analysesFailed ?? 0} failed · ${t?.analysesUnavailable ?? 0} unavailable`} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard loading={isLoading} label="Active research cases" value={t?.activeCases} hint="Case status: Active" icon={<FlaskConical className="h-5 w-5" />} tone="teal" />
            <StatCard loading={isLoading} label="Pending analyses" value={t?.analysesPending} hint="Queued or processing" icon={<Clock className="h-5 w-5" />} tone="amber" />
            <StatCard loading={isLoading} label="Model inference runs" value={(t?.analysesCompleted ?? 0) + (t?.analysesFailed ?? 0) + (t?.analysesUnavailable ?? 0)} hint="All outcomes" icon={<Activity className="h-5 w-5" />} tone="slate" />
            <StatCard loading={isLoading} label="Image workflow" value={data?.imageProcessing.find((i) => i.name === 'ANALYZED')?.value ?? 0} hint="Images analysed" icon={<Brain className="h-5 w-5" />} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <ChartCard className="xl:col-span-2" title="Analysis activity" description={`Completed vs. failed analyses per day, last ${span} days${isDemo ? ' of recorded data' : ''}`} loading={isLoading}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.activitySeries} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip {...tooltipStyle} labelFormatter={shortDate} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="completed" name="Completed" stackId="a" fill={CHART_COLORS[1]} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="failed" name="Failed / unavailable" stackId="a" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Case status" description="Distribution of research cases" loading={isLoading} empty={!data?.caseDistribution.length}>
              <DonutChart data={data?.caseDistribution ?? []} />
            </ChartCard>
            <ChartCard className="xl:col-span-2" title="Record & image activity" description={`Documents created per day, last ${span} days`} loading={isLoading}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.activitySeries} margin={{ left: -16, right: 8 }}>
                  <defs>
                    <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} /></linearGradient>
                    <linearGradient id="gImg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip {...tooltipStyle} labelFormatter={shortDate} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="records" name="Records" stroke={CHART_COLORS[0]} fill="url(#gRec)" strokeWidth={2} />
                  <Area type="monotone" dataKey="images" name="Images" stroke={CHART_COLORS[1]} fill="url(#gImg)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Image processing" description="Imaging workflow status" loading={isLoading} empty={!data?.imageProcessing.length}>
              <DonutChart data={data?.imageProcessing ?? []} />
            </ChartCard>
            <ChartCard className="xl:col-span-3" title="Research cohorts" description="Synthetic participants per cohort" loading={isLoading} empty={!data?.cohortDistribution.length}>
              <HBarChart data={data?.cohortDistribution ?? []} color={CHART_COLORS[2]} />
            </ChartCard>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div><CardTitle>Recent model inference</CardTitle><CardDescription>{isDemo ? 'Latest recorded analyses' : 'Latest analysis requests'}</CardDescription></div>
                <Button asChild variant="ghost" size="sm"><Link to="/history">View all <ArrowRight className="h-3 w-3" /></Link></Button>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40 w-full" /> : !data?.recentAnalyses.length ? <EmptyState title="No analyses yet" /> : (
                  <ul className="divide-y">
                    {data.recentAnalyses.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.imageName}</p>
                          <p className="truncate text-xs text-muted-foreground">{a.patient.displayName} · {timeAgo(a.createdAt)} · {formatMs(a.inferenceMs)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">{isDemo ? <RecordedBadge /> : <ModeBadge mode={a.mode} />}<AnalysisStatusBadge status={a.status} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent system activity</CardTitle><CardDescription>Audit trail of user actions</CardDescription></CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40 w-full" /> : (
                  <ol className="relative space-y-4 border-l pl-5">
                    {data?.recentActivity.map((a) => (
                      <li key={a.id} className="relative">
                        <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-teal ring-4 ring-card" />
                        <p className="text-sm">{a.summary}</p>
                        <p className="text-xs text-muted-foreground">{titleCase(a.action.replace('.', ' '))} · {timeAgo(a.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
