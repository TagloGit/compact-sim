import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../types'
import type { SweepConfig } from '../sweep-types'
import { buildDefaultSweepConfig } from '../sweep-defaults'
import {
  generateLinearValues,
  generateLogValues,
  expandSweepConfig,
  partitionByShape,
} from '../sweep'

/** Helper: build a SweepConfig with overrides on top of all-fixed defaults */
function sweepConfig(
  overrides: Partial<SweepConfig>,
): SweepConfig {
  return { ...buildDefaultSweepConfig(), ...overrides }
}

describe('generateLinearValues', () => {
  it('produces correct values for a simple range', () => {
    const values = generateLinearValues(0, 10, 6)
    expect(values).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('returns [min] for steps=1', () => {
    expect(generateLinearValues(5, 100, 1)).toEqual([5])
  })

  it('handles min=max', () => {
    const values = generateLinearValues(7, 7, 3)
    expect(values).toEqual([7, 7, 7])
  })
})

describe('generateLogValues', () => {
  it('produces geometrically spaced values', () => {
    const values = generateLogValues(1, 1000, 4)
    expect(values).toHaveLength(4)
    expect(values[0]).toBeCloseTo(1, 5)
    expect(values[3]).toBeCloseTo(1000, 5)
    // Middle values should be geometrically spaced: 10, 100
    expect(values[1]).toBeCloseTo(10, 0)
    expect(values[2]).toBeCloseTo(100, 0)
  })

  it('returns [min] for steps=1', () => {
    expect(generateLogValues(42, 999, 1)).toEqual([42])
  })
})

describe('expandSweepConfig', () => {
  it('returns a single config when nothing is swept', () => {
    const config = buildDefaultSweepConfig()
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(1)
    expect(expanded[0]).toEqual(DEFAULT_CONFIG)
  })

  it('produces correct cartesian product count for multiple swept params', () => {
    const config = sweepConfig({
      toolCallCycles: { kind: 'swept', min: 10, max: 50, steps: 3, scale: 'linear' },
      toolResultSize: { kind: 'swept', min: 500, max: 5000, steps: 4, scale: 'linear' },
      compressionRatio: { kind: 'swept', min: 2, max: 20, steps: 5, scale: 'linear' },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(3 * 4 * 5) // 60
  })

  it('applies swept values correctly to each config', () => {
    const config = sweepConfig({
      toolCallCycles: { kind: 'swept', min: 10, max: 30, steps: 3, scale: 'linear' },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(3)
    expect(expanded[0].toolCallCycles).toBe(10)
    expect(expanded[1].toolCallCycles).toBe(20)
    expect(expanded[2].toolCallCycles).toBe(30)
    // Non-swept params should remain at defaults
    expect(expanded[0].contextWindow).toBe(DEFAULT_CONFIG.contextWindow)
  })

  it('handles strategy sweep', () => {
    const config = sweepConfig({
      selectedStrategy: {
        kind: 'swept',
        values: ['full-compaction', 'incremental', 'lossless-append'],
      },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(3)
    expect(expanded[0].selectedStrategy).toBe('full-compaction')
    expect(expanded[1].selectedStrategy).toBe('incremental')
    expect(expanded[2].selectedStrategy).toBe('lossless-append')
  })

  it('handles boolean sweep', () => {
    const config = sweepConfig({
      toolCompressionEnabled: { kind: 'swept' },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(2)
    expect(expanded[0].toolCompressionEnabled).toBe(false)
    expect(expanded[1].toolCompressionEnabled).toBe(true)
  })

  it('handles single-step numeric sweep (edge case)', () => {
    const config = sweepConfig({
      toolCallCycles: { kind: 'swept', min: 50, max: 100, steps: 1, scale: 'linear' },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(1)
    expect(expanded[0].toolCallCycles).toBe(50) // single step returns min
  })

  it('uses logarithmic scale when specified', () => {
    const config = sweepConfig({
      toolResultSize: { kind: 'swept', min: 100, max: 10000, steps: 3, scale: 'log' },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(3)
    expect(expanded[0].toolResultSize).toBeCloseTo(100, 0)
    expect(expanded[1].toolResultSize).toBeCloseTo(1000, 0) // geometric mean
    expect(expanded[2].toolResultSize).toBeCloseTo(10000, 0)
  })

  it('produces full cartesian product across mixed param types', () => {
    const config = sweepConfig({
      selectedStrategy: {
        kind: 'swept',
        values: ['full-compaction', 'incremental'],
      },
      toolCompressionEnabled: { kind: 'swept' },
      toolCallCycles: { kind: 'swept', min: 10, max: 20, steps: 3, scale: 'linear' },
    })
    const expanded = expandSweepConfig(config)
    // 2 strategies × 2 booleans × 3 numeric = 12
    expect(expanded).toHaveLength(12)

    // Verify all combinations exist
    const combos = expanded.map((c) => `${c.selectedStrategy}-${c.toolCompressionEnabled}-${c.toolCallCycles}`)
    const unique = new Set(combos)
    expect(unique.size).toBe(12)
  })
})

describe('partitionByShape', () => {
  it('groups configs with identical conversation-shape values', () => {
    const config = sweepConfig({
      // Shape param — varies → different groups
      toolCallCycles: { kind: 'swept', min: 10, max: 20, steps: 2, scale: 'linear' },
      // Non-shape param — varies but should NOT split groups
      compressionRatio: { kind: 'swept', min: 5, max: 15, steps: 3, scale: 'linear' },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(6) // 2 × 3

    const groups = partitionByShape(expanded)
    // toolCallCycles is a shape param with 2 values → 2 groups
    expect(groups.size).toBe(2)

    // Each group should have 3 configs (varying compressionRatio)
    for (const group of groups.values()) {
      expect(group).toHaveLength(3)
      // All configs in a group share the same toolCallCycles
      const cycles = new Set(group.map((c) => c.toolCallCycles))
      expect(cycles.size).toBe(1)
    }
  })

  it('puts all configs in one group when only non-shape params vary', () => {
    const config = sweepConfig({
      compressionRatio: { kind: 'swept', min: 2, max: 20, steps: 5, scale: 'linear' },
      selectedStrategy: {
        kind: 'swept',
        values: ['full-compaction', 'incremental'],
      },
    })
    const expanded = expandSweepConfig(config)
    expect(expanded).toHaveLength(10)

    const groups = partitionByShape(expanded)
    expect(groups.size).toBe(1)
    const [group] = groups.values()
    expect(group).toHaveLength(10)
  })

  it('handles empty input', () => {
    const groups = partitionByShape([])
    expect(groups.size).toBe(0)
  })
})
