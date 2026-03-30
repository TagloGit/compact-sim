import { useState, useMemo, useCallback, useRef } from 'react'
import type { SimulationConfig } from '@/engine/types'
import type {
  SweepConfig,
  SweepParameterDef,
  SweepRunResult,
  SweepMetrics,
} from '@/engine/sweep-types'
import { buildDefaultSweepConfig } from '@/engine/sweep-defaults'
import { expandSweepConfig, expandParamValues } from '@/engine/sweep'
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

// --- Mock data generation ---

/** Generate mock SweepRunResult[] from a SweepConfig, ordered by variableOrder */
function generateMockResults(
  config: SweepConfig,
  variableOrder: (keyof SimulationConfig)[],
): SweepRunResult[] {
  // Reorder the sweep config so variableOrder keys come first (affects cartesian product order)
  const allKeys = Object.keys(config) as (keyof SimulationConfig)[]
  const orderedKeys = [
    ...variableOrder,
    ...allKeys.filter((k) => !variableOrder.includes(k)),
  ]
  const reorderedConfig = Object.fromEntries(
    orderedKeys.map((k) => [k, config[k]]),
  ) as SweepConfig

  const expanded = expandSweepConfig(reorderedConfig)
  return expanded.map((simConfig, i) => ({
    index: i,
    config: simConfig,
    metrics: generateMockMetrics(simConfig, i, expanded.length),
  }))
}

/** Generate plausible mock metrics that vary with config parameters */
function generateMockMetrics(config: SimulationConfig, index: number, _total: number): SweepMetrics {
  // Use a simple seeded pseudo-random for reproducibility
  const seed = index * 2654435761 // Knuth multiplicative hash
  const rand = () => {
    const x = Math.sin(seed + index * 127.1) * 43758.5453
    return x - Math.floor(x)
  }

  // Cost varies with context window, tool result size, and cycles
  const sizeFactor = config.toolResultSize / 10_000
  const cycleFactor = config.toolCallCycles / 100
  const windowFactor = config.contextWindow / 200_000
  const baseCost = 0.5 + sizeFactor * cycleFactor * windowFactor * 2

  // Add variation based on compression ratio and strategy
  const compressionSaving = 1 / config.compressionRatio
  const noise = (rand() - 0.5) * 0.3

  const totalCost = Math.max(0.01, baseCost * (1 - compressionSaving * 0.3) + noise)
  const peakContextSize = Math.round(config.contextWindow * (0.6 + rand() * 0.35) * config.compactionThreshold)
  const compactionEvents = Math.max(0, Math.round(cycleFactor * 3 + (rand() - 0.5) * 4))
  const averageCacheHitRate = Math.min(0.95, Math.max(0.1, 0.5 + (1 - compressionSaving) * 0.2 + (rand() - 0.5) * 0.2))
  const externalStoreSize = config.selectedStrategy.startsWith('lossless')
    ? Math.round(peakContextSize * 0.3 * (1 + rand()))
    : 0
  const totalRetrievalCost = externalStoreSize > 0
    ? totalCost * 0.05 * (1 + rand())
    : 0

  return {
    totalCost,
    peakContextSize,
    compactionEvents,
    averageCacheHitRate,
    externalStoreSize,
    totalRetrievalCost,
  }
}

// --- Component ---

export function ExplorerTab({ onOpenInSimulator }: ExplorerTabProps) {
  const [sweepConfig, setSweepConfig] = useState<SweepConfig>(buildDefaultSweepConfig)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('totalCost')
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<SweepRunResult[]>([])
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
    // Keep existing order entries that are still swept, add new swept keys at end
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

  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  const handleRun = useCallback(() => {
    setIsRunning(true)
    setProgress(0)
    setSelectedRunIndex(null)

    // Generate mock results
    const mockResults = generateMockResults(sweepConfig, effectiveOrder)

    // Animate progress, then set results
    let p = 0
    intervalRef.current = setInterval(() => {
      p += 0.1
      if (p >= 1) {
        p = 1
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = null
        setIsRunning(false)
        setResults(mockResults)
      }
      setProgress(p)
    }, 150)
  }, [sweepConfig, effectiveOrder])

  const handleCancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setIsRunning(false)
    setProgress(0)
  }, [])

  // When variable order changes, re-sort existing results
  const handleOrderChange = useCallback(
    (newOrder: (keyof SimulationConfig)[]) => {
      setVariableOrder(newOrder)
      if (results.length > 0) {
        // Re-generate with new ordering
        const reordered = generateMockResults(sweepConfig, newOrder)
        setResults(reordered)
        setSelectedRunIndex(null)
      }
    },
    [results.length, sweepConfig],
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
