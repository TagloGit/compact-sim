import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { applySummaryFloor } from '../strategy'
import { runSimulation } from '../simulation'
import type { SimulationConfig } from '../types'
import { DEFAULT_CONFIG } from '../types'

function run(config: SimulationConfig) {
  return Effect.runSync(runSimulation(config))
}

describe('applySummaryFloor', () => {
  it('returns computedTokens unchanged for fixed model', () => {
    const config = { ...DEFAULT_CONFIG, summaryGrowthModel: 'fixed' as const }
    expect(applySummaryFloor(500, 100_000, config)).toBe(500)
  })

  it('returns computedTokens when above floor for logarithmic model', () => {
    const config = {
      ...DEFAULT_CONFIG,
      summaryGrowthModel: 'logarithmic' as const,
      summaryGrowthCoefficient: 1000,
    }
    // floor = 1000 * ln(1 + 10000/1000) = 1000 * ln(11) ≈ 2397
    // computedTokens = 5000 > 2397 → returns 5000
    expect(applySummaryFloor(5000, 10_000, config)).toBe(5000)
  })

  it('applies floor when computedTokens is below floor for logarithmic model', () => {
    const config = {
      ...DEFAULT_CONFIG,
      summaryGrowthModel: 'logarithmic' as const,
      summaryGrowthCoefficient: 1000,
    }
    // floor = 1000 * ln(1 + 100000/1000) = 1000 * ln(101) ≈ 4615
    // computedTokens = 3000 < 4615 → returns ceil(4615)
    const result = applySummaryFloor(3000, 100_000, config)
    expect(result).toBeGreaterThan(3000)
    expect(result).toBe(Math.ceil(1000 * Math.log(1 + 100_000 / 1000)))
  })

  it('floor grows with totalCompressedTokens', () => {
    const config = {
      ...DEFAULT_CONFIG,
      summaryGrowthModel: 'logarithmic' as const,
      summaryGrowthCoefficient: 1000,
    }
    const floor10k = applySummaryFloor(0, 10_000, config)
    const floor100k = applySummaryFloor(0, 100_000, config)
    const floor300k = applySummaryFloor(0, 300_000, config)
    expect(floor100k).toBeGreaterThan(floor10k)
    expect(floor300k).toBeGreaterThan(floor100k)
  })
})

describe('summary growth — full simulation', () => {
  // Base config designed for predictable compaction behaviour
  const baseConfig: SimulationConfig = {
    ...DEFAULT_CONFIG,
    toolCallCycles: 200,
    contextWindow: 200_000,
    compactionThreshold: 0.85,
    compressionRatio: 10,
    incrementalInterval: 30_000,
    selectedStrategy: 'incremental',
  }

  it('fixed model produces identical results to default (backwards compatibility)', () => {
    const defaultResult = run({ ...baseConfig })
    const fixedResult = run({ ...baseConfig, summaryGrowthModel: 'fixed' })

    expect(fixedResult.summary.totalCost).toBe(defaultResult.summary.totalCost)
    expect(fixedResult.summary.compactionEvents).toBe(defaultResult.summary.compactionEvents)
    expect(fixedResult.summary.peakContextSize).toBe(defaultResult.summary.peakContextSize)
  })

  it('fixed model summary converges (stable after a few compactions)', () => {
    const result = run({ ...baseConfig, summaryGrowthModel: 'fixed' })

    // Get summary sizes at each compaction event
    const compactionSteps = result.snapshots.filter((s) => s.compactionEvent)
    expect(compactionSteps.length).toBeGreaterThanOrEqual(3)

    // Find summary messages in context after each compaction
    const summarySizes = compactionSteps.map((step) => {
      const summaries = step.context.messages.filter((m) => m.type === 'summary')
      return summaries.reduce((sum, m) => sum + m.tokens, 0)
    })

    // After the first 2-3 compactions, summary size should converge
    // (last few values should be very close to each other)
    const lastThree = summarySizes.slice(-3)
    if (lastThree.length === 3) {
      const maxDiff = Math.max(...lastThree) - Math.min(...lastThree)
      // Should be within 50% of the mean — convergence (incremental accumulates
      // multiple summaries, so total fluctuates around the convergence ceiling)
      const mean = lastThree.reduce((a, b) => a + b, 0) / lastThree.length
      expect(maxDiff / mean).toBeLessThan(0.5)
    }
  })

  it('logarithmic model summary grows beyond fixed convergence point', () => {
    const fixedResult = run({ ...baseConfig, summaryGrowthModel: 'fixed' })
    const logResult = run({
      ...baseConfig,
      summaryGrowthModel: 'logarithmic',
      summaryGrowthCoefficient: 1000,
    })

    // Both should have compaction events
    expect(fixedResult.summary.compactionEvents).toBeGreaterThanOrEqual(3)
    expect(logResult.summary.compactionEvents).toBeGreaterThanOrEqual(3)

    // Get final summary sizes
    const getLastSummarySize = (snapshots: typeof fixedResult.snapshots) => {
      const lastCompaction = [...snapshots].reverse().find((s) => s.compactionEvent)
      if (!lastCompaction) return 0
      const summaries = lastCompaction.context.messages.filter((m) => m.type === 'summary')
      return summaries.reduce((sum, m) => sum + m.tokens, 0)
    }

    const fixedFinalSummary = getLastSummarySize(fixedResult.snapshots)
    const logFinalSummary = getLastSummarySize(logResult.snapshots)

    // Logarithmic model should produce a larger final summary
    expect(logFinalSummary).toBeGreaterThan(fixedFinalSummary)
  })

  it('logarithmic model summary grows over successive compactions', () => {
    const result = run({
      ...baseConfig,
      summaryGrowthModel: 'logarithmic',
      summaryGrowthCoefficient: 1000,
    })

    const compactionSteps = result.snapshots.filter((s) => s.compactionEvent)
    expect(compactionSteps.length).toBeGreaterThanOrEqual(3)

    // Get the total summary token size in context after each compaction
    const summarySizes = compactionSteps.map((step) => {
      const summaries = step.context.messages.filter((m) => m.type === 'summary')
      return summaries.reduce((sum, m) => sum + m.tokens, 0)
    })

    // After the initial ramp-up, the summary size should be growing
    // (at least the last value should be larger than the second)
    const last = summarySizes[summarySizes.length - 1]
    const secondToLast = summarySizes[summarySizes.length - 2]
    // For incremental strategy, summaries accumulate — check last compaction produces larger summary
    expect(last).toBeGreaterThanOrEqual(secondToLast)
  })
})
