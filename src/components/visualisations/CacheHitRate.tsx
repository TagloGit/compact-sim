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

interface CacheHitRateProps {
  snapshots: readonly SimulationSnapshot[]
  currentStep: number
}

export function CacheHitRate({ snapshots, currentStep }: CacheHitRateProps) {
  // Only show LLM call steps (assistant/reasoning) — other steps have no
  // cache calculation and would show misleading 0% values.
  const llmSteps = snapshots
    .filter((s) => s.message.type === 'assistant' || s.message.type === 'reasoning')

  const data = llmSteps.map((s) => ({
    step: s.stepIndex,
    hitRate: Math.round(s.cache.hitRate * 100),
  }))

  // Snap the current-step marker to the nearest LLM step so it's always
  // visible, even when playback is on a non-LLM step.
  let nearestStep = data.length > 0 ? data[0].step : 0
  for (const d of data) {
    if (d.step <= currentStep) nearestStep = d.step
    else break
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">
        Cache Hit Rate
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          LLM call steps only
        </span>
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
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
            x={nearestStep}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <Line
            type="monotone"
            dataKey="hitRate"
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
