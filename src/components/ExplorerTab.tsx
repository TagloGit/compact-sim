import { useState, useMemo, useCallback, useRef } from 'react'
import type { SimulationConfig, StrategyType } from '@/engine/types'
import { DEFAULT_CONFIG } from '@/engine/types'
import type {
  SweepConfig,
  SweepParameterDef,
  NumericSweepRange,
  SweepRunResult,
  SweepMetrics,
} from '@/engine/sweep-types'
import { buildDefaultSweepConfig, PARAM_META } from '@/engine/sweep-defaults'
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

function getStepCount(key: keyof SimulationConfig, def: SweepParameterDef): number {
  if (def.kind === 'fixed') return 1
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') return (def as { values: StrategyType[] }).values.length
  if (meta.paramKind === 'boolean') return 2
  return (def as NumericSweepRange).steps
}

// --- Mock data generation ---

function generateLinearValues(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [min]
  return Array.from({ length: steps }, (_, i) => min + (max - min) * (i / (steps - 1)))
}

function generateLogValues(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [min]
  const logMin = Math.log(Math.max(min, 1e-12))
  const logMax = Math.log(Math.max(max, 1e-12))
  return Array.from({ length: steps }, (_, i) =>
    Math.exp(logMin + (logMax - logMin) * (i / (steps - 1))),
  )
}

/** Expand a single parameter into its possible values */
function expandParam(key: keyof SimulationConfig, def: SweepParameterDef): unknown[] {
  if (def.kind === 'fixed') return [def.value]
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') {
    return (def as { values: StrategyType[] }).values
  }
  if (meta.paramKind === 'boolean') {
    return [false, true]
  }
  const numDef = def as NumericSweepRange
  return numDef.scale === 'log'
    ? generateLogValues(numDef.min, numDef.max, numDef.steps)
    : generateLinearValues(numDef.min, numDef.max, numDef.steps)
}

/** Generate mock SweepRunResult[] from a SweepConfig, ordered by variableOrder */
function generateMockResults(
  config: SweepConfig,
  variableOrder: (keyof SimulationConfig)[],
): SweepRunResult[] {
  // Build list of all params with their values, in variable order first then remaining
  const allKeys = Object.keys(config) as (keyof SimulationConfig)[]
  const orderedKeys = [
    ...variableOrder,
    ...allKeys.filter((k) => !variableOrder.includes(k)),
  ]

  const paramValues = orderedKeys.map((key) => ({
    key,
    values: expandParam(key, config[key]),
  }))

  // Calculate total combinations
  const total = paramValues.reduce((acc, p) => acc * p.values.length, 1)
  if (total === 0) return []

  // Generate cartesian product
  const results: SweepRunResult[] = []

  for (let i = 0; i < total; i++) {
    // Decompose flat index into per-param indices
    const configObj = { ...DEFAULT_CONFIG } as Record<string, unknown>
    let remainder = i
    for (let p = paramValues.length - 1; p >= 0; p--) {
      const pv = paramValues[p]
      const idx = remainder % pv.values.length
      remainder = Math.floor(remainder / pv.values.length)
      configObj[pv.key] = pv.values[idx]
    }

    // Generate mock metrics — vary based on config values for visual interest
    const simConfig = configObj as unknown as SimulationConfig
    const metrics = generateMockMetrics(simConfig, i, total)
    results.push({ index: i, config: simConfig, metrics })
  }

  return results
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
      (acc, key) => acc * getStepCount(key, sweepConfig[key]),
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
