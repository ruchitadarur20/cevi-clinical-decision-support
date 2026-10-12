import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { CHART_COLORS } from '@/components/common';
import { titleCase } from '@/lib/format';
import type { NamedValue } from '@/lib/types';

export const axisProps = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 10px 30px -8px hsl(222 47% 11% / 0.25)',
    color: 'hsl(var(--foreground))',
  },
  labelStyle: { color: 'hsl(var(--muted-foreground))', marginBottom: 4 },
  cursor: { fill: 'hsl(var(--muted) / 0.6)' },
} as const;

export const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function ChartCard({ title, description, children, loading, empty, className }: { title: string; description?: string; children: ReactNode; loading?: boolean; empty?: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-60 w-full" /> : empty ? <EmptyState title="No data yet" description="Charts populate as activity is recorded." /> : <div className="h-60 w-full">{children}</div>}
      </CardContent>
    </Card>
  );
}

export function DonutChart({ data, label = (n: string) => titleCase(n) }: { data: NamedValue[]; label?: (n: string) => string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data.map((d) => ({ ...d, name: label(d.name) }))} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [`${v} (${total ? Math.round((v / total) * 100) : 0}%)`, n]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, color = CHART_COLORS[0], label = (n: string) => n }: { data: NamedValue[]; color?: string; label?: (n: string) => string }) {
  const rows = data.map((d) => ({ ...d, name: label(d.name) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="name" width={150} {...axisProps} tick={{ fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
