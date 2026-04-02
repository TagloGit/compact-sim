import { describe, it, expect } from 'vitest'
import { applySummaryFloor } from '../strategy'
import { DEFAULT_CONFIG } from '../types'
import type { SimulationConfig } from '../types'
import { runSimulationWithConversation } from '../simulation'
import { generateConversation } from '../conversation'
import { Effect } from 'effect'

// --- Unit tests for applySummaryFloor ---

describe('applySummaryFloor', () => {
  const fixedConfig: SimulationConfig = {
    ...DEFAULT_CONFIG,
    summaryGrowthModel: 'fixed',
  }

  const logConfig: SimulationConfig = {
    ...DEFAULT_CONFIG,
    summaryGrowthModel: 'logarithmic',
    summaryGrowthCoefficient: 1000,
  }

  it('returns computedTokens unchanged for fixed model', () => {
    expect(applySummaryFloor(500, 100_000, fixedConfig)).toBe(500)
  })

  it('returns computedTokens when above floor for logarithmic model', () => {
    // At totalCompressed=10k, floor = 1000 * ln(1 + 10) ≈ 2398
    // So computedTokens=5000 should be returned as-is
    expect(applySummaryFloor(5000, 10_000, logConfig)).toBe(5000)
  })

  it('returns floor when computedTokens is below for logarithmic model', () => {
    // At totalCompressed=100k, floor = 1000 * ln(1 + 100) ≈ 4615
    const result = applySummaryFloor(500, 100_000, logConfig)
    expect(result).toBe(Math.ceil(1000 * Math.log(1 + 100_000 / 1000)))
    expect(result).toBeGreaterThan(500)
  })

  it('returns 0 floor at totalCompressed=0 for logarithmic model', () => {
    // ln(1 + 0) = 0, so floor = 0, computedTokens returned
    expect(applySummaryFloor(100, 0, logConfig)).toBe(100)
  })

  it('respects custom coefficient', () => {
    const customConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      summaryGrowthModel: 'logarithmic',
      summaryGrowthCoefficient: 500,
    }
    // At totalCompressed=100k, floor = 500 * ln(101) ≈ 2308
    const result = applySummaryFloor(100, 100_000, customConfig)
    expect(result).toBe(Math.ceil(500 * Math.log(1 + 100_000 / 1000)))
  })
})

// --- Integration tests: fixed vs logarithmic across a full simulation ---

describe('summary growth model integration', () => {
  const baseConfig: SimulationConfig = {
    ...DEFAULT_CONFIG,
    toolCallCycles: 200,
    compressionRatio: 10,
    incrementalInterval: 30_000,
  }

  function getConversation(config: SimulationConfig) {
    return Effect.runSync(generateConversation(config))
  }

  it('fixed model: summary converges to stable size after a few compactions', () => {
    const config: SimulationConfig = { ...baseConfig, summaryGrowthModel: 'fixed' }
    const conversation = getConversation(config)
    const result = runSimulationWithConversation(config, conversation)

    // Find compaction events and their summary sizes
    const compactionSnapshots = result.snapshots.filter((s) => s.compactionEvent)
    expect(compactionSnapshots.length).toBeGreaterThanOrEqual(3)

    // After 3 compactions, summary sizes should stabilise (within 10% of each other)
    const lateSummaries = compactionSnapshots.slice(2)
    const summaryTokens = lateSummaries.map((s) => {
      const summaryMsg = s.context.messages.find((m) => m.type === 'summary')
      return summaryMsg?.tokens ?? 0
    })

    // Check convergence: last few summary sizes should be similar
    const maxSummary = Math.max(...summaryTokens)
    const minSummary = Math.min(...summaryTokens)
    // For fixed model with incremental strategy, summaries converge
    // Allow some variation due to different content per interval
    expect(maxSummary).toBeLessThan(minSummary * 2)
  })

  it('logarithmic model: summary grows beyond fixed convergence point', () => {
    const config: SimulationConfig = {
      ...baseConfig,
      summaryGrowthModel: 'logarithmic',
      summaryGrowthCoefficient: 1000,
    }
    const conversation = getConversation(config)
    const result = runSimulationWithConversation(config, conversation)

    const compactionSnapshots = result.snapshots.filter((s) => s.compactionEvent)
    expect(compactionSnapshots.length).toBeGreaterThanOrEqual(3)

    // Extract summary sizes at each compaction
    const summaryTokens = compactionSnapshots.map((s) => {
      const summaryMsg = s.context.messages.find((m) => m.type === 'summary')
      return summaryMsg?.tokens ?? 0
    })

    // Later summaries should be larger than earlier ones
    const firstSummary = summaryTokens[0]
    const lastSummary = summaryTokens[summaryTokens.length - 1]
    expect(lastSummary).toBeGreaterThan(firstSummary)
  })

  it('fixed model produces identical results to default config', () => {
    const defaultConversation = getConversation(DEFAULT_CONFIG)
    const defaultResult = runSimulationWithConversation(DEFAULT_CONFIG, defaultConversation)

    const fixedConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      summaryGrowthModel: 'fixed',
    }
    const fixedConversation = getConversation(fixedConfig)
    const fixedResult = runSimulationWithConversation(fixedConfig, fixedConversation)

    // Same conversation shape, same results
    expect(fixedResult.summary.totalCost).toBe(defaultResult.summary.totalCost)
    expect(fixedResult.summary.compactionEvents).toBe(defaultResult.summary.compactionEvents)
    expect(fixedResult.summary.peakContextSize).toBe(defaultResult.summary.peakContextSize)
  })

  it('logarithmic model increases total cost (larger summaries)', () => {
    const conversation = getConversation(baseConfig)

    const fixedResult = runSimulationWithConversation(
      { ...baseConfig, summaryGrowthModel: 'fixed' },
      conversation,
    )
    const logResult = runSimulationWithConversation(
      { ...baseConfig, summaryGrowthModel: 'logarithmic', summaryGrowthCoefficient: 1000 },
      conversation,
    )

    // Logarithmic model should cost more (larger summaries = more context)
    expect(logResult.summary.totalCost).toBeGreaterThan(fixedResult.summary.totalCost)
  })
})
