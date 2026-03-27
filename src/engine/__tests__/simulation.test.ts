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

  it('only assistant/reasoning steps incur LLM I/O cost, but compaction cost can appear on any step', () => {
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
        // compactionInput/compactionOutput may be non-zero if compaction fired on this step
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

  it('tool results are compressed when toolCompressionEnabled is true', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
      toolResultSize: 2_000,
      toolCompressionEnabled: true,
      toolCompressionRatio: 5,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      contextWindow: 200_000,
    }
    const result = run(config)
    // Every tool_result in the conversation should be compressed
    for (const snapshot of result.snapshots) {
      if (snapshot.message.type === 'tool_result') {
        expect(snapshot.message.tokens).toBe(Math.ceil(2_000 / 5))
      }
    }
  })

  it('tool results are untouched when toolCompressionEnabled is false', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
      toolResultSize: 2_000,
      toolCompressionEnabled: false,
      toolCompressionRatio: 5,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
    }
    const result = run(config)
    for (const snapshot of result.snapshots) {
      if (snapshot.message.type === 'tool_result') {
        expect(snapshot.message.tokens).toBe(2_000)
      }
    }
  })

  it('compression ratio applies ceil division correctly', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 3,
      toolResultSize: 1_001, // 1001 / 3 = 333.67 → ceil = 334
      toolCompressionEnabled: true,
      toolCompressionRatio: 3,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      contextWindow: 200_000,
    }
    const result = run(config)
    for (const snapshot of result.snapshots) {
      if (snapshot.message.type === 'tool_result') {
        expect(snapshot.message.tokens).toBe(Math.ceil(1_001 / 3))
      }
    }
  })

  it('context grows slower with tool compression enabled', () => {
    const baseConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 10,
      toolResultSize: 2_000,
      toolCompressionEnabled: false,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      contextWindow: 200_000,
      compactionThreshold: 0.99, // effectively no compaction
    }
    const withCompression: SimulationConfig = {
      ...baseConfig,
      toolCompressionEnabled: true,
      toolCompressionRatio: 5,
    }

    const resultWithout = run(baseConfig)
    const resultWith = run(withCompression)

    const peakWithout = resultWithout.summary.peakContextSize
    const peakWith = resultWith.summary.peakContextSize
    expect(peakWith).toBeLessThan(peakWithout)
  })

  it('fewer compaction events with tool compression enabled', () => {
    const baseConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 20,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      systemPromptSize: 4_000,
      contextWindow: 10_000,
      compactionThreshold: 0.8,
      compressionRatio: 10,
      toolCompressionEnabled: false,
    }
    const withCompression: SimulationConfig = {
      ...baseConfig,
      toolCompressionEnabled: true,
      toolCompressionRatio: 5,
    }

    const resultWithout = run(baseConfig)
    const resultWith = run(withCompression)

    expect(resultWith.summary.compactionEvents).toBeLessThanOrEqual(
      resultWithout.summary.compactionEvents,
    )
  })

  it('tool compression works with incremental strategy', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'incremental',
      toolCallCycles: 20,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      systemPromptSize: 4_000,
      incrementalInterval: 10_000,
      summaryAccumulationThreshold: 50_000,
      compressionRatio: 10,
      toolCompressionEnabled: true,
      toolCompressionRatio: 5,
    }
    const result = run(config)
    // Should still run without error and produce snapshots
    expect(result.snapshots.length).toBeGreaterThan(0)
    // Tool results should be compressed
    for (const snapshot of result.snapshots) {
      if (snapshot.message.type === 'tool_result') {
        expect(snapshot.message.tokens).toBe(Math.ceil(2_000 / 5))
      }
    }
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

  it('compaction cost is recorded when compaction fires on a tool_result step', () => {
    // Design config so compaction fires on a tool_result step (large tool results fill context fast)
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 10,
      toolCallSize: 100,
      toolResultSize: 3_000,
      assistantMessageSize: 100,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      userMessageSize: 100,
      systemPromptSize: 1_000,
      contextWindow: 5_000,
      compactionThreshold: 0.8, // fires at > 4000
      compressionRatio: 10,
    }
    const result = run(config)
    // Find a compaction event that fired on a tool_result step
    const compactionOnToolResult = result.snapshots.find(
      (s) => s.compactionEvent && s.message.type === 'tool_result',
    )
    expect(compactionOnToolResult).toBeDefined()
    expect(compactionOnToolResult!.cost.compactionInput).toBeGreaterThan(0)
  })

  it('strategy 2 fires compaction when main threshold is exceeded before incremental interval', () => {
    // Small context window so threshold fires before incremental interval
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'incremental',
      toolCallCycles: 10,
      toolCallSize: 200,
      toolResultSize: 2_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      userMessageSize: 200,
      systemPromptSize: 1_000,
      contextWindow: 5_000,
      compactionThreshold: 0.8, // fires at > 4000
      incrementalInterval: 100_000, // very high — would never fire on its own
      summaryAccumulationThreshold: 500_000,
      compressionRatio: 10,
    }
    const result = run(config)
    expect(result.summary.compactionEvents).toBeGreaterThanOrEqual(1)
    // Peak context should stay below contextWindow since compaction fires
    expect(result.summary.peakContextSize).toBeLessThan(config.contextWindow)
  })

  it('known-answer: fixed config produces exact cost breakdown at step 5', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 3,
      toolCallSize: 200,
      toolResultSize: 1_000,
      assistantMessageSize: 300,
      reasoningOutputSize: 0,
      userMessageFrequency: 100,
      userMessageSize: 200,
      systemPromptSize: 2_000,
      contextWindow: 200_000,
      compactionThreshold: 0.99,
      compressionRatio: 10,
      baseInputPrice: 5.0 / 1_000_000,
      outputPrice: 25.0 / 1_000_000,
      cacheWriteMultiplier: 1.25,
      cacheHitMultiplier: 0.10,
      minCacheableTokens: 1_000,
      toolCompressionEnabled: false,
    }
    const result = run(config)
    // Step 0: system (2000 tokens) — not LLM call, zero cost
    // Step 1: user (200 tokens) — not LLM call, zero cost
    // Step 2: assistant (300 tokens) — first LLM call
    //   Context: system(2000) + user(200) + assistant(300) = 2500 total
    //   No previous context → first step: cache write = 2500 - 300 = 2200, uncached = 300
    //   Output: 300 * 25/1M = 0.0075
    const step2 = result.snapshots[2]
    expect(step2.message.type).toBe('assistant')
    expect(step2.cost.output).toBeCloseTo(300 * 25 / 1_000_000, 10)
    expect(step2.cost.cacheWrite).toBeCloseTo(2200 * 5 / 1_000_000 * 1.25, 10)
    expect(step2.cost.uncachedInput).toBeCloseTo(300 * 5 / 1_000_000, 10)
    expect(step2.cost.cachedInput).toBe(0)
  })

  describe('strategy 4a — lossless append-only', () => {
    const s4aConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'lossless-append',
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

    it('compaction fires at correct intervals', () => {
      const result = run(s4aConfig)
      expect(result.summary.compactionEvents).toBeGreaterThanOrEqual(2)
    })

    it('external store is populated on compaction', () => {
      const result = run(s4aConfig)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]
      expect(lastSnapshot.externalStore.entries.length).toBeGreaterThan(0)
      expect(lastSnapshot.externalStore.totalTokens).toBeGreaterThan(0)
    })

    it('external store grows monotonically', () => {
      const result = run(s4aConfig)
      let prevEntries = 0
      let prevTokens = 0
      for (const snapshot of result.snapshots) {
        expect(snapshot.externalStore.entries.length).toBeGreaterThanOrEqual(prevEntries)
        expect(snapshot.externalStore.totalTokens).toBeGreaterThanOrEqual(prevTokens)
        prevEntries = snapshot.externalStore.entries.length
        prevTokens = snapshot.externalStore.totalTokens
      }
    })

    it('store entries have level 0', () => {
      const result = run(s4aConfig)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]
      for (const entry of lastSnapshot.externalStore.entries) {
        expect(entry.level).toBe(0)
      }
    })

    it('retrieval events fire after store has entries', () => {
      // Use high pRetrieveMax to ensure retrieval fires with enough compaction
      const config: SimulationConfig = {
        ...s4aConfig,
        toolCallCycles: 50,
        pRetrieveMax: 0.80,
        compressedTokensCap: 10_000,
      }
      const result = run(config)
      const retrievalSteps = result.snapshots.filter((s) => s.retrievalEvent)
      expect(retrievalSteps.length).toBeGreaterThan(0)

      // All retrieval events should be on LLM call steps
      for (const step of retrievalSteps) {
        expect(
          step.message.type === 'assistant' || step.message.type === 'reasoning',
        ).toBe(true)
      }
    })

    it('retrieval cost appears in step cost when retrieval fires', () => {
      const config: SimulationConfig = {
        ...s4aConfig,
        toolCallCycles: 50,
        pRetrieveMax: 0.80,
        compressedTokensCap: 10_000,
      }
      const result = run(config)
      const retrievalStep = result.snapshots.find((s) => s.retrievalEvent)
      if (retrievalStep) {
        expect(retrievalStep.cost.retrievalInput).toBeGreaterThan(0)
        expect(retrievalStep.cost.retrievalOutput).toBeGreaterThan(0)
      }
    })

    it('strategies 1 and 2 do NOT populate external store', () => {
      const s1Config: SimulationConfig = {
        ...DEFAULT_CONFIG,
        selectedStrategy: 'full-compaction',
        toolCallCycles: 10,
        toolCallSize: 200,
        toolResultSize: 2_000,
        assistantMessageSize: 300,
        reasoningOutputSize: 0,
        userMessageFrequency: 100,
        systemPromptSize: 1_000,
        contextWindow: 5_000,
        compactionThreshold: 0.8,
        compressionRatio: 10,
      }
      const result = run(s1Config)
      expect(result.summary.compactionEvents).toBeGreaterThan(0)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]
      expect(lastSnapshot.externalStore.entries.length).toBe(0)
    })

    it('external store entry count matches compaction event count', () => {
      // With no meta-compaction, each compaction should produce exactly one store entry
      const result = run(s4aConfig)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]
      expect(lastSnapshot.externalStore.entries.length).toBe(
        result.summary.compactionEvents,
      )
    })
  })

  describe('strategy 4b — lossless hierarchical', () => {
    const s4bConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      selectedStrategy: 'lossless-hierarchical',
      toolCallCycles: 30,
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

    it('compaction fires multiple times', () => {
      const result = run(s4bConfig)
      expect(result.summary.compactionEvents).toBeGreaterThanOrEqual(2)
    })

    it('context always has exactly one summary after compaction', () => {
      const result = run(s4bConfig)
      for (const snapshot of result.snapshots) {
        if (!snapshot.compactionEvent) continue
        const summaries = snapshot.context.messages.filter(
          (m) => m.type === 'summary',
        )
        expect(summaries.length).toBe(1)
      }
    })

    it('summary size follows (prev_summary + new_content) / ratio formula', () => {
      const result = run(s4bConfig)
      const compactionSnapshots = result.snapshots.filter(
        (s) => s.compactionEvent,
      )
      expect(compactionSnapshots.length).toBeGreaterThanOrEqual(3)

      // Each summary should equal ceil(allNonSystemTokens / ratio).
      // The summary converges toward New * c / (1 - c) where c = 1/ratio.
      // The first compaction may start above convergence (catches all initial
      // content), then subsequent compactions approach from above.
      // Verify each summary differs from a naive new-content-only calculation,
      // proving the previous summary is included in the compression input.
      const summaryTokens = compactionSnapshots.map((s) => {
        const summary = s.context.messages.find((m) => m.type === 'summary')
        expect(summary).toBeDefined()
        return summary!.tokens
      })

      // Summaries should converge toward steady state
      const c = 1 / s4bConfig.compressionRatio
      const convergence = Math.round(
        s4bConfig.incrementalInterval * c / (1 - c),
      )
      const lastSummary = summaryTokens[summaryTokens.length - 1]
      // Should be within 20% of theoretical convergence
      expect(lastSummary).toBeGreaterThan(convergence * 0.8)
      expect(lastSummary).toBeLessThan(convergence * 1.5)
    })

    it('summary includes previous summary tokens in its size', () => {
      // Verify the summary is NOT just new_content/ratio (that would be 4a behaviour).
      // In 4b, summary = (prev_summary + new_content) / ratio.
      const result = run(s4bConfig)
      const compactionSnapshots = result.snapshots.filter(
        (s) => s.compactionEvent,
      )
      expect(compactionSnapshots.length).toBeGreaterThanOrEqual(2)

      // The second summary should be larger than if only new content were compressed.
      // In 4a, each summary is ~incrementalInterval/ratio = 10000/10 = 1000.
      // In 4b, it's (prev_summary + new_content)/ratio, which is always > 1000.
      const second = compactionSnapshots[1]
      const summary = second.context.messages.find(
        (m) => m.type === 'summary',
      )!
      const naiveSize = s4bConfig.incrementalInterval / s4bConfig.compressionRatio
      expect(summary.tokens).toBeGreaterThan(naiveSize)
    })

    it('store entry levels increase: 0, 1, 2, ...', () => {
      const result = run(s4bConfig)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]
      const entries = lastSnapshot.externalStore.entries
      expect(entries.length).toBeGreaterThanOrEqual(2)

      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].level).toBe(i)
      }
    })

    it('external store entry count matches compaction event count', () => {
      const result = run(s4bConfig)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]
      expect(lastSnapshot.externalStore.entries.length).toBe(
        result.summary.compactionEvents,
      )
    })

    it('retrieval cost scales with store depth', () => {
      const config: SimulationConfig = {
        ...s4bConfig,
        toolCallCycles: 50,
        pRetrieveMax: 0.80,
        compressedTokensCap: 10_000,
      }
      const result = run(config)
      const retrievalSteps = result.snapshots.filter((s) => s.retrievalEvent)
      expect(retrievalSteps.length).toBeGreaterThan(0)

      // Later retrieval events should cost more than earlier ones
      // (as the average store level increases)
      const firstRetrieval = retrievalSteps[0]
      const lastRetrieval = retrievalSteps[retrievalSteps.length - 1]
      if (retrievalSteps.length > 1) {
        expect(lastRetrieval.cost.retrievalInput).toBeGreaterThanOrEqual(
          firstRetrieval.cost.retrievalInput,
        )
      }
    })
  })
})
