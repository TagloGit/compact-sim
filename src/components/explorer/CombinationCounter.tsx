import { useMemo, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SimulationConfig, StrategyType } from '@/engine/types'
import type { SweepConfig, SweepParameterDef, NumericSweepRange } from '@/engine/sweep-types'
import { PARAM_META, type NumericParamMeta } from '@/engine/sweep-defaults'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'

const WARNING_THRESHOLD = 10_000

/**
 * Approximate single-threaded simulation throughput (runs/sec).
 * Measured via sweep-benchmark.test.ts across 100–50,000 runs.
 */
const ESTIMATED_SINGLE_THREAD_THROUGHPUT = 350

interface CombinationCounterProps {
  config: SweepConfig
  onChange: (config: SweepConfig) => void
}

interface ParamBreakdown {
  key: keyof SimulationConfig
  displayName: string
  steps: number
}

function getStepCount(key: keyof SimulationConfig, def: SweepParameterDef): number {
  if (def.kind === 'fixed') return 1
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') return (def as { values: StrategyType[] }).values.length
  if (meta.paramKind === 'boolean') return 2
  return (def as NumericSweepRange).steps
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function estimatedTime(total: number): string {
  const cores = typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency || 4)
    : 4
  const seconds = total / (ESTIMATED_SINGLE_THREAD_THROUGHPUT * cores)
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m`
}

export function CombinationCounter({ config, onChange }: CombinationCounterProps) {
  const { breakdown, total } = useMemo(() => {
    const items: ParamBreakdown[] = []
    for (const [key, def] of Object.entries(config) as [keyof SimulationConfig, SweepParameterDef][]) {
      if (def.kind === 'fixed') continue
      const meta = PARAM_META[key]
      items.push({
        key,
        displayName: meta.displayName,
        steps: getStepCount(key, def),
      })
    }
    const total = items.length > 0 ? items.reduce((acc, item) => acc * item.steps, 1) : 0
    return { breakdown: items, total }
  }, [config])

  // Derive current granularity from actual step counts so the slider tracks position
  const granularity = useMemo(() => {
    let sum = 0
    let count = 0
    for (const [key, def] of Object.entries(config) as [keyof SimulationConfig, SweepParameterDef][]) {
      if (def.kind !== 'swept') continue
      const meta = PARAM_META[key]
      if (meta.paramKind !== 'numeric') continue
      const nm = meta as NumericParamMeta
      const fraction = (def as NumericSweepRange).steps / nm.defaultSweepSteps
      sum += fraction
      count++
    }
    if (count === 0) return 10
    return Math.round((sum / count) * 10)
  }, [config])

  // Granularity slider: value 1..10 maps to a multiplier on step counts
  // 10 = current steps, 1 = minimum (2 steps each)
  const handleGranularity = useCallback(
    (value: number | readonly number[]) => {
      const v = Array.isArray(value) ? value[0] : value
      const fraction = v / 10
      const next = { ...config }
      for (const [key, def] of Object.entries(config) as [keyof SimulationConfig, SweepParameterDef][]) {
        if (def.kind !== 'swept') continue
        const meta = PARAM_META[key]
        if (meta.paramKind !== 'numeric') continue
        const nm = meta as NumericParamMeta
        const maxSteps = nm.defaultSweepSteps
        const newSteps = Math.max(2, Math.round(maxSteps * fraction))
        ;(next as Record<string, SweepParameterDef>)[key] = { ...(def as NumericSweepRange), steps: newSteps }
      }
      onChange(next)
    },
    [config, onChange],
  )

  if (breakdown.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground text-center">
          No parameters are being swept. Drag parameters to the Swept bucket to begin.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Combinations</span>
        <span className={`text-sm font-bold tabular-nums ${total > WARNING_THRESHOLD ? 'text-amber-500' : ''}`}>
          {formatNumber(total)}
        </span>
      </div>

      {/* Breakdown */}
      <div className="text-xs tabular-nums text-muted-foreground text-center">
        {formatNumber(total)} ={' '}
        {breakdown.map((item, i) => (
          <span key={item.key}>
            {i > 0 && ' \u00d7 '}
            <span title={item.displayName} className="cursor-help border-b border-dotted border-muted-foreground/50">
              {item.steps}
            </span>
          </span>
        ))}
      </div>

      {/* Warning */}
      {total > WARNING_THRESHOLD && (
        <div className="flex items-start gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            High combination count — estimated {estimatedTime(total)}.
          </span>
        </div>
      )}

      {/* Granularity slider */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Granularity</Label>
        <Slider
          value={[granularity]}
          min={1}
          max={10}
          step={1}
          onValueChange={handleGranularity}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Coarse</span>
          <span>Fine</span>
        </div>
      </div>
    </div>
  )
}
