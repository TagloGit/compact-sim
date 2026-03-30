import { useState, useMemo, useCallback } from 'react'
import type { SimulationConfig, StrategyType } from '@/engine/types'
import type { SweepConfig, SweepParameterDef, NumericSweepRange } from '@/engine/sweep-types'
import { buildDefaultSweepConfig, PARAM_META } from '@/engine/sweep-defaults'
import { AppLayout } from '@/components/layout/AppLayout'
import { SweepParameterPanel } from '@/components/explorer/SweepParameterPanel'
import { CombinationCounter } from '@/components/explorer/CombinationCounter'
import { SweepControls, type MetricKey } from '@/components/explorer/SweepControls'

interface ExplorerTabProps {
  onOpenInSimulator: (config: SimulationConfig) => void
}

function getStepCount(key: keyof SimulationConfig, def: SweepParameterDef): number {
  if (def.kind === 'fixed') return 1
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') return (def as { values: StrategyType[] }).values.length
  if (meta.paramKind === 'boolean') return 2
  return (def as NumericSweepRange).steps
}

export function ExplorerTab(_props: ExplorerTabProps) {
  const [sweepConfig, setSweepConfig] = useState<SweepConfig>(buildDefaultSweepConfig)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('totalCost')
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  const totalCombinations = useMemo(() => {
    const swept = (Object.entries(sweepConfig) as [keyof SimulationConfig, SweepParameterDef][])
      .filter(([, def]) => def.kind === 'swept')
    if (swept.length === 0) return 0
    return swept.reduce((acc, [key, def]) => acc * getStepCount(key, def), 1)
  }, [sweepConfig])

  const handleRun = useCallback(() => {
    // Mock run — just animate progress
    setIsRunning(true)
    setProgress(0)
    let p = 0
    const interval = setInterval(() => {
      p += 0.1
      if (p >= 1) {
        p = 1
        clearInterval(interval)
        setIsRunning(false)
      }
      setProgress(p)
    }, 200)
  }, [])

  const handleCancel = useCallback(() => {
    setIsRunning(false)
    setProgress(0)
  }, [])

  return (
    <AppLayout
      sidebar={
        <>
          <SweepParameterPanel config={sweepConfig} onChange={setSweepConfig} />
          <div className="px-4 pb-4">
            <CombinationCounter config={sweepConfig} onChange={setSweepConfig} />
          </div>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Parameter Sweep Explorer</h1>
          <p className="text-sm text-muted-foreground">
            Define parameter ranges, run the cartesian product, and explore results as a heat bar.
          </p>
        </div>

        <SweepControls
          totalCombinations={totalCombinations}
          isRunning={isRunning}
          progress={progress}
          selectedMetric={selectedMetric}
          onMetricChange={setSelectedMetric}
          onRun={handleRun}
          onCancel={handleCancel}
        />

        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-12 text-muted-foreground">
          Heat bar and results will be added in subsequent issues.
        </div>
      </div>
    </AppLayout>
  )
}
