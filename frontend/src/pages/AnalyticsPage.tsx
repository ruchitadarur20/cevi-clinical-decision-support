import { Activity, BarChart3, Clock, Cpu, Gauge, Info } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAnalytics } from '@/api/hooks';
import { CHART_COLORS, PageHeader, ResearchDisclaimer, StatCard } from '@/components/common';
import { ChartCard, DonutChart, HBarChart, axisProps, shortDate, tooltipStyle } from '@/components/charts';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/feedback';
import { formatMs, titleCase } from '@/lib/format';

export default function AnalyticsPage() {
  const { data, isLoading, error, refetch } = useAnalytics();
  if (error) return <Card><ErrorState error={error} onRetry={() => void refetch()} /></Card>;
  const l = data?.latency;

  return (
    <div>
      <PageHeader title="Research Analytics" description="Operational statistics computed from recorded application data. No clinical performance is measured." />
      <div role="note" className="mb-6 flex items-start gap-3 rounded-md border bg-accent/60 px-4 py-3 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>{data?.dataNotice ?? 'Metrics are computed from recorded application data.'}</p></div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard loading={isLoading} label="Total analyses" value={data?.totals.analyses} hint={`${data?.totals.syntheticAnalyses ?? 0} on synthetic images`} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard loading={isLoading} label="Avg inference" value={formatMs(l?.avgMs)} hint={l?.sampleSize ? `n = ${l.sampleSize} runs` : 'No timed runs'} icon={<Clock className="h-5 w-5" />} tone="teal" />
        <StatCard loading={isLoading} label="p95 latency" value={formatMs(l?.p95Ms)} hint={`p50 ${formatMs(l?.p50Ms)}`} icon={<Gauge className="h-5 w-5" />} tone="amber" />
        <StatCard loading={isLoading} label="Images processed" value={data?.totals.images} hint={`${data?.totals.patients ?? 0} patients · ${data?.totals.records ?? 0} records`} icon={<Activity className="h-5 w-5" />} tone="slate" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Analysis volume" description="Requests per day, last 30 days" loading={isLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.trends} margin={{ left: -16, right: 8 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} interval={4} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip {...tooltipStyle} labelFormatter={shortDate} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" name="Completed" stackId="a" fill={CHART_COLORS[1]} />
              <Bar dataKey="failed" name="Failed / unavailable" stackId="a" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Processing outcomes" description="All recorded analyses" loading={isLoading} empty={!data?.outcomes.length}>
          <DonutChart data={data?.outcomes ?? []} />
        </ChartCard>

        <ChartCard className="xl:col-span-2" title="Model inference latency" description="Average inference time per day (ms)" loading={isLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.trends} margin={{ left: -8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} interval={4} />
              <YAxis {...axisProps} unit=" ms" />
              <Tooltip {...tooltipStyle} labelFormatter={shortDate} formatter={(v: number) => [`${v} ms`, 'Avg latency']} />
              <Line type="monotone" dataKey="avgLatencyMs" name="Avg latency" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Analysis modes" description="Experimental inference vs. recorded demonstration" loading={isLoading} empty={!data?.modes.length}>
          <DonutChart data={data?.modes ?? []} label={(n) => (n === 'EXPERIMENTAL_INFERENCE' ? 'Experimental' : 'Demonstration')} />
        </ChartCard>

        <ChartCard className="xl:col-span-2" title="System usage" description="Documents created and sign-ins per day" loading={isLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.trends} margin={{ left: -16, right: 8 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} interval={4} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip {...tooltipStyle} labelFormatter={shortDate} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="records" name="Records" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="images" name="Images" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="logins" name="Sign-ins" stroke={CHART_COLORS[4]} fill={CHART_COLORS[4]} fillOpacity={0.08} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Imaging modalities" description="Uploaded image distribution" loading={isLoading} empty={!data?.modalityDistribution.length}>
          <DonutChart data={data?.modalityDistribution ?? []} />
        </ChartCard>

        <ChartCard className="xl:col-span-2" title="Research dataset distribution" description="Synthetic participants by cohort" loading={isLoading} empty={!data?.cohortDistribution.length}>
          <HBarChart data={data?.cohortDistribution ?? []} color={CHART_COLORS[2]} />
        </ChartCard>
        <Card className="p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-primary" /> Model execution</h3>
          <p className="mb-3 text-xs text-muted-foreground">Completed runs by model and version</p>
          {!data?.models.length ? <p className="text-sm text-muted-foreground">No completed model runs.</p> : (
            <ul className="divide-y">{data.models.map((m) => <li key={`${m.name}-${m.version}`} className="flex items-center justify-between py-2 text-sm"><span>{m.name}<span className="block text-xs text-muted-foreground">{m.version}</span></span><span className="tabular-nums font-medium">{m.count}</span></li>)}</ul>
          )}
          {l && l.sampleSize > 0 && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Latency range {formatMs(l.minMs)} – {formatMs(l.maxMs)}</p>}
        </Card>

        <ChartCard className="xl:col-span-3" title="Most frequent top-1 labels" description="General ImageNet categories assigned to synthetic phantoms. These are NOT clinical findings." loading={isLoading} empty={!data?.topLabels.length}>
          <HBarChart data={(data?.topLabels ?? []).map((t) => ({ ...t, name: titleCase(t.name.replace(/ /g, '_')).replace(/_/g, ' ') }))} color={CHART_COLORS[4]} />
        </ChartCard>
      </div>
      <ResearchDisclaimer className="mt-6" />
    </div>
  );
}
