import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { DEFAULT_CONFIG } from '../types'
import type { SimulationConfig } from '../types'
import type { SweepConfig } from '../sweep-types'
import { buildDefaultSweepConfig } from '../sweep-defaults'
import { expandSweepConfig, partitionByShape } from '../sweep'
import { generateConversation } from '../conversation'
import { runSimulationWithConversation } from '../simulation'
import { generateConversationSync } from '../sweep-worker-protocol'

/** Helper: build a SweepConfig with overrides */
function sweepConfig(overrides: Partial<SweepConfig>): SweepConfig {
  return { ...buildDefaultSweepConfig(), ...overrides }
}

/** Small config for fast tests */
const SMALL_CONFIG: SimulationConfig = {
  ...DEFAULT_CONFIG,
  toolCallCycles: 3,
  contextWindow: 20_000,
  compactionThreshold: 0.8,
}

describe('generateConversationSync', () => {
  it('produces the same messages as the Effect-wrapped version', () => {
    const syncMessages = generateConversationSync(SMALL_CONFIG)
    const effectMessages = Effect.runSync(generateConversation(SMALL_CONFIG))
    expect(syncMessages).toEqual(effectMessages)
  })
})

describe('sweep worker integration', () => {
  it('runs a small sweep with correct result count', () => {
    // 3 swept params × 2 steps each = 8 combinations
    const config = sweepConfig({
      compactionThreshold: {
        kind: 'swept',
        min: 0.7,
        max: 0.9,
        steps: 2,
        scale: 'linear',
      },
      compressionRatio: {
        kind: 'swept',
        min: 5,
        max: 10,
        steps: 2,
        scale: 'linear',
      },
      contextWindow: {
        kind: 'swept',
        min: 20_000,
        max: 50_000,
        steps: 2,
        scale: 'linear',
      },
    })

    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(8)

    // Partition by shape and generate conversations
    const groups = partitionByShape(expanded)

    // All 8 configs share the same conversation shape (only non-shape params swept)
    expect(groups.size).toBe(1)

    // Run each config through the simulation
    const results = expanded.map((simConfig, i) => {
      const messages = generateConversationSync(simConfig)
      const result = runSimulationWithConversation(simConfig, messages)
      const lastSnapshot = result.snapshots[result.snapshots.length - 1]

      return {
        index: i,
        config: simConfig,
        metrics: {
          totalCost: result.summary.totalCost,
          peakContextSize: result.summary.peakContextSize,
          compactionEvents: result.summary.compactionEvents,
          averageCacheHitRate: result.summary.averageCacheHitRate,
          externalStoreSize: lastSnapshot?.externalStore.totalTokens ?? 0,
          totalRetrievalCost: lastSnapshot
            ? lastSnapshot.cumulativeCost.retrievalInput +
              lastSnapshot.cumulativeCost.retrievalOutput
            : 0,
        },
      }
    })

    expect(results).toHaveLength(8)

    // Each result should have valid metrics
    for (const r of results) {
      expect(r.metrics.totalCost).toBeGreaterThan(0)
      expect(r.metrics.peakContextSize).toBeGreaterThan(0)
      expect(r.metrics.averageCacheHitRate).toBeGreaterThanOrEqual(0)
      expect(r.metrics.averageCacheHitRate).toBeLessThanOrEqual(1)
      expect(r.metrics.compactionEvents).toBeGreaterThanOrEqual(0)
    }
  })

  it('conversation reuse produces identical results for same shape', () => {
    const config = sweepConfig({
      compressionRatio: {
        kind: 'swept',
        min: 5,
        max: 10,
        steps: 2,
        scale: 'linear',
      },
    })

    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(2)

    // Both configs share conversation shape — generate once
    const messages = generateConversationSync(expanded[0])

    const result1 = runSimulationWithConversation(expanded[0], messages)
    const result2 = runSimulationWithConversation(expanded[1], messages)

    // Same conversation, different configs — should produce different costs
    expect(result1.summary.totalCost).not.toBe(result2.summary.totalCost)

    // But same number of snapshots (same conversation)
    expect(result1.snapshots.length).toBe(result2.snapshots.length)
  })

  it('partitions correctly when conversation shape params are swept', () => {
    const config = sweepConfig({
      toolCallCycles: {
        kind: 'swept',
        min: 3,
        max: 5,
        steps: 2,
        scale: 'linear',
      },
      compressionRatio: {
        kind: 'swept',
        min: 5,
        max: 10,
        steps: 2,
        scale: 'linear',
      },
    })

    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(4)

    const groups = partitionByShape(expanded)
    // toolCallCycles is a conversation shape param → 2 groups
    expect(groups.size).toBe(2)

    // Each group has 2 configs (the 2 compressionRatio values)
    for (const group of groups.values()) {
      expect(group).toHaveLength(2)
    }
  })

  it('produces deterministic results for the same config', () => {
    const messages = generateConversationSync(SMALL_CONFIG)
    const result1 = runSimulationWithConversation(SMALL_CONFIG, messages)
    const result2 = runSimulationWithConversation(SMALL_CONFIG, messages)

    expect(result1.summary).toEqual(result2.summary)
  })
})
