import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { SimulationSnapshot } from '@/engine/types'

interface CacheHitRateProps {
  snapshots: readonly SimulationSnapshot[]
  currentStep: number
}

export function CacheHitRate({ snapshots, currentStep }: CacheHitRateProps) {
  const data = snapshots.map((s) => ({
    step: s.stepIndex,
    hitRate: Math.round(s.cache.hitRate * 100),
    compaction: s.compactionEvent,
  }))

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">Cache Hit Rate</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="step"
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={45}
          />
          <Tooltip
            formatter={(value: unknown) => [`${value}%`, 'Hit rate']}
            labelFormatter={(label: unknown) => `Step ${label}`}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: 12,
            }}
          />
          <ReferenceLine
            x={currentStep}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <Bar
            dataKey="hitRate"
            fill="#3b82f6"
            radius={[1, 1, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
