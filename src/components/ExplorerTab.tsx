import { useState, useMemo, useCallback } from 'react'
import type { SimulationConfig } from '@/engine/types'
import type { SweepParameterDef } from '@/engine/sweep-types'
import { expandParamValues } from '@/engine/sweep'
import { useSweep } from '@/hooks/useSweep'
import { AppLayout } from '@/components/layout/AppLayout'
import { SweepParameterPanel } from '@/components/explorer/SweepParameterPanel'
import { CombinationCounter } from '@/components/explorer/CombinationCounter'
import { SweepControls, type MetricKey } from '@/components/explorer/SweepControls'
import { HeatBar } from '@/components/explorer/HeatBar'
import { VariableOrderPanel } from '@/components/explorer/VariableOrderPanel'
import { RunDetailCard } from '@/components/explorer/RunDetailCard'

interface ExplorerTabProps {
  onOpenInSimulator: (config: SimulationConfig) => void
}

export function ExplorerTab({ onOpenInSimulator }: ExplorerTabProps) {
  const { sweepConfig, setSweepConfig, results, progress, isRunning, run, reorder, cancel } = useSweep()
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('totalCost')
  const [selectedRunIndex, setSelectedRunIndex] = useState<number | null>(null)

  // Swept keys — only params with kind 'swept'
  const sweptKeys = useMemo(() => {
    return (Object.entries(sweepConfig) as [keyof SimulationConfig, SweepParameterDef][])
      .filter(([, def]) => def.kind === 'swept')
      .map(([key]) => key)
  }, [sweepConfig])

  // Variable ordering for heat bar
  const [variableOrder, setVariableOrder] = useState<(keyof SimulationConfig)[]>(sweptKeys)

  // Keep variable order in sync with swept keys
  const effectiveOrder = useMemo(() => {
    const stillSwept = variableOrder.filter((k) => sweptKeys.includes(k))
    const newSwept = sweptKeys.filter((k) => !variableOrder.includes(k))
    return [...stillSwept, ...newSwept]
  }, [variableOrder, sweptKeys])

  const totalCombinations = useMemo(() => {
    if (sweptKeys.length === 0) return 0
    return sweptKeys.reduce(
      (acc, key) => acc * expandParamValues(key, sweepConfig[key]).length,
      1,
    )
  }, [sweepConfig, sweptKeys])

  const handleRun = useCallback(() => {
    setSelectedRunIndex(null)
    run(effectiveOrder)
  }, [run, effectiveOrder])

  const handleCancel = useCallback(() => {
    cancel()
  }, [cancel])

  // When variable order changes, re-sort existing results without re-running
  const handleOrderChange = useCallback(
    (newOrder: (keyof SimulationConfig)[]) => {
      setVariableOrder(newOrder)
      if (results.length > 0) {
        reorder(newOrder)
        setSelectedRunIndex(null)
      }
    },
    [results.length, reorder],
  )

  const selectedResult = selectedRunIndex !== null ? results[selectedRunIndex] ?? null : null

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
      <div className="space-y-4">
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

        {results.length > 0 ? (
          <>
            <HeatBar
              results={results}
              selectedMetric={selectedMetric}
              selectedIndex={selectedRunIndex}
              onSelect={setSelectedRunIndex}
              sweptKeys={effectiveOrder}
            />

            <div className="grid grid-cols-[200px_1fr] gap-4">
              <VariableOrderPanel
                order={effectiveOrder}
                onChange={handleOrderChange}
              />
              {selectedResult ? (
                <RunDetailCard
                  result={selectedResult}
                  onOpenInSimulator={onOpenInSimulator}
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
                  Click a segment in the heat bar to see run details.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-12 text-muted-foreground">
            {isRunning
              ? 'Generating results...'
              : 'Configure sweep parameters and click Run to generate results.'}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
