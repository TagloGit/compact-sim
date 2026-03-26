import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import type { SimulationSnapshot } from '@/engine/types'

interface CostChartProps {
  snapshots: readonly SimulationSnapshot[]
  currentStep: number
}

function formatCost(dollars: number): string {
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`
  return `$${dollars.toFixed(2)}`
}

const COST_AREAS = [
  { key: 'cachedInput', name: 'Cached input', color: '#93c5fd' },
  { key: 'cacheWrite', name: 'Cache write', color: '#60a5fa' },
  { key: 'uncachedInput', name: 'Uncached input', color: '#2563eb' },
  { key: 'output', name: 'Output', color: '#22c55e' },
  { key: 'compaction', name: 'Compaction', color: '#a855f7' },
] as const

export function CostChart({ snapshots, currentStep }: CostChartProps) {
  const data = snapshots.map((s) => ({
    step: s.stepIndex,
    cachedInput: s.cumulativeCost.cachedInput,
    cacheWrite: s.cumulativeCost.cacheWrite,
    uncachedInput: s.cumulativeCost.uncachedInput,
    output: s.cumulativeCost.output,
    compaction: s.cumulativeCost.compactionInput + s.cumulativeCost.compactionOutput,
  }))

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">Cumulative Cost</h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="step"
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            tickFormatter={formatCost}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={55}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [formatCost(Number(value)), String(name)]}
            labelFormatter={(label: unknown) => `Step ${label}`}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: 12,
            }}
          />
          <Legend
            iconSize={10}
            wrapperStyle={{ fontSize: 11 }}
          />
          <ReferenceLine
            x={currentStep}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          {COST_AREAS.map((area) => (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.name}
              stackId="cost"
              stroke={area.color}
              fill={area.color}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
