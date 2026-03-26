import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { SimulationSnapshot } from '@/engine/types'

interface ContextSizeChartProps {
  snapshots: readonly SimulationSnapshot[]
  currentStep: number
  contextWindow: number
  compactionThreshold: number
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`
  return String(tokens)
}

export function ContextSizeChart({
  snapshots,
  currentStep,
  contextWindow,
  compactionThreshold,
}: ContextSizeChartProps) {
  const data = snapshots.map((s) => ({
    step: s.stepIndex,
    tokens: s.context.totalTokens,
  }))

  const thresholdTokens = Math.round(compactionThreshold * contextWindow)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">Context Size</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="step"
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            tickFormatter={formatTokens}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={50}
          />
          <Tooltip
            formatter={(value: unknown) => [formatTokens(Number(value)), 'Tokens']}
            labelFormatter={(label: unknown) => `Step ${label}`}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: 12,
            }}
          />
          <ReferenceLine
            y={thresholdTokens}
            stroke="#a855f7"
            strokeDasharray="6 3"
            label={{
              value: 'Compaction threshold',
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#a855f7',
            }}
          />
          <ReferenceLine
            y={contextWindow}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{
              value: 'Context window',
              position: 'insideBottomRight',
              fontSize: 10,
              fill: '#ef4444',
            }}
          />
          <ReferenceLine
            x={currentStep}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <Line
            type="monotone"
            dataKey="tokens"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
