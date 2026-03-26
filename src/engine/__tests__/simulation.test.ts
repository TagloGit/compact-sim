import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { runSimulation } from '../simulation'
import type { SimulationConfig } from '../types'
import { DEFAULT_CONFIG } from '../types'

function run(config: SimulationConfig) {
  return Effect.runSync(runSimulation(config))
}

describe('runSimulation', () => {
  it('produces a snapshot for each message in the conversation', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
      contextWindow: 200_000,
      compactionThreshold: 0.85,
    }
    const result = run(config)
    // 5 cycles with reasoning: 2 + (5 * 4) + 0 user messages (freq 10, only 5 cycles) = 22
    expect(result.snapshots.length).toBe(22)
  })

  it('compaction fires at the expected step for a small config', () => {
    // Design a config where compaction fires predictably
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 10,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0, // no reasoning for simplicity
      userMessageFrequency: 100, // effectively no extra user messages
      userMessageSize: 200,
      systemPromptSize: 4_000,
      contextWindow: 10_000,
      compactionThreshold: 0.8, // fires at > 8000
      compressionRatio: 10,
    }
    const result = run(config)
    expect(result.summary.compactionEvents).toBeGreaterThanOrEqual(1)

    // Find the first compaction step
    const firstCompaction = result.snapshots.find((s) => s.compactionEvent)
    expect(firstCompaction).toBeDefined()

    // After compaction, context should be much smaller
    const stepAfterCompaction = result.snapshots.find(
      (s) => s.stepIndex > firstCompaction!.stepIndex && !s.compactionEvent,
    )
    if (stepAfterCompaction) {
      expect(stepAfterCompaction.context.totalTokens).toBeLessThan(8_000)
    }
  })

  it('final total cost is the sum of all step costs', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
    }
    const result = run(config)
    const manualTotal = result.snapshots.reduce(
      (sum, s) => sum + s.cost.total,
      0,
    )
    expect(result.summary.totalCost).toBeCloseTo(manualTotal, 10)
  })

  it('cumulative cost is monotonically non-decreasing', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 10,
    }
    const result = run(config)
    for (let i = 1; i < result.snapshots.length; i++) {
      expect(result.snapshots[i].cumulativeCost.total).toBeGreaterThanOrEqual(
        result.snapshots[i - 1].cumulativeCost.total,
      )
    }
  })

  it('only assistant/reasoning steps incur output cost', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
      reasoningOutputSize: 500,
    }
    const result = run(config)
    for (const snapshot of result.snapshots) {
      if (
        snapshot.message.type !== 'assistant' &&
        snapshot.message.type !== 'reasoning'
      ) {
        expect(snapshot.cost.output).toBe(0)
        expect(snapshot.cost.cachedInput).toBe(0)
        expect(snapshot.cost.uncachedInput).toBe(0)
        expect(snapshot.cost.cacheWrite).toBe(0)
      }
    }
  })

  it('peak context size is tracked correctly', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
    }
    const result = run(config)
    const maxFromSnapshots = Math.max(
      ...result.snapshots.map((s) => s.context.totalTokens),
    )
    expect(result.summary.peakContextSize).toBe(maxFromSnapshots)
  })

  it('incremental strategy produces multiple compaction events', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'incremental',
      toolCallCycles: 20,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      userMessageSize: 200,
      systemPromptSize: 4_000,
      incrementalInterval: 10_000,
      summaryAccumulationThreshold: 50_000,
      compressionRatio: 10,
    }
    const result = run(config)
    // With ~2500 tokens per cycle and 10k interval, should compact ~every 4 cycles
    expect(result.summary.compactionEvents).toBeGreaterThanOrEqual(2)
  })

  it('incremental strategy accumulates summaries in context', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'incremental',
      toolCallCycles: 20,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      userMessageSize: 200,
      systemPromptSize: 4_000,
      incrementalInterval: 10_000,
      summaryAccumulationThreshold: 50_000,
      compressionRatio: 10,
    }
    const result = run(config)
    // After multiple compactions, context should have multiple summaries
    const lastSnapshot = result.snapshots[result.snapshots.length - 1]
    const summariesInContext = lastSnapshot.context.messages.filter(
      (m) => m.type === 'summary',
    )
    if (result.summary.compactionEvents >= 2) {
      expect(summariesInContext.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('incremental strategy keeps context smaller than full compaction threshold', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'incremental',
      toolCallCycles: 20,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      userMessageSize: 200,
      systemPromptSize: 4_000,
      contextWindow: 200_000,
      incrementalInterval: 10_000,
      summaryAccumulationThreshold: 50_000,
      compressionRatio: 10,
    }
    const result = run(config)
    // With frequent incremental compaction, peak context should stay well below
    // the full compaction threshold (85% of 200k = 170k)
    expect(result.summary.peakContextSize).toBeLessThan(
      config.contextWindow * config.compactionThreshold,
    )
  })

  it('total tokens generated matches sum of all message tokens', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
    }
    const result = run(config)
    const sumTokens = result.snapshots.reduce(
      (sum, s) => sum + s.message.tokens,
      0,
    )
    expect(result.summary.totalTokensGenerated).toBe(sumTokens)
  })
})
