import { describe, it, expect } from 'vitest'
import { defaultCostCalculator, addCosts, ZERO_COST } from '../cost'
import type { CacheState, SimulationConfig } from '../types'
import { DEFAULT_CONFIG } from '../types'

const config: SimulationConfig = DEFAULT_CONFIG

describe('defaultCostCalculator', () => {
  it('hand-calculated example: known token counts produce correct dollar amounts', () => {
    const cache: CacheState = {
      cachedPrefixTokens: 4_000,
      cacheHitTokens: 4_000,
      cacheWriteTokens: 500,
      uncachedTokens: 300,
      hitRate: 83.3,
    }

    const result = defaultCostCalculator.calculate(
      cache,
      300, // output tokens (assistant)
      { fired: false, tokensCompacted: 0, summaryTokens: 0 },
      config,
    )

    // cachedInput = 4000 * (5/1M) * 0.10 = 0.002
    expect(result.cachedInput).toBeCloseTo(0.002, 6)
    // cacheWrite = 500 * (5/1M) * 1.25 = 0.003125
    expect(result.cacheWrite).toBeCloseTo(0.003125, 6)
    // uncachedInput = 300 * (5/1M) = 0.0015
    expect(result.uncachedInput).toBeCloseTo(0.0015, 6)
    // output = 300 * (25/1M) = 0.0075
    expect(result.output).toBeCloseTo(0.0075, 6)
    // compaction = 0
    expect(result.compactionInput).toBe(0)
    expect(result.compactionOutput).toBe(0)
    // total = 0.002 + 0.003125 + 0.0015 + 0.0075 = 0.014125
    expect(result.total).toBeCloseTo(0.014125, 6)
  })

  it('compaction cost only appears when compaction fires', () => {
    const cache: CacheState = {
      cachedPrefixTokens: 4_000,
      cacheHitTokens: 4_000,
      cacheWriteTokens: 0,
      uncachedTokens: 50,
      hitRate: 98.8,
    }

    const noCompaction = defaultCostCalculator.calculate(
      cache,
      0,
      { fired: false, tokensCompacted: 0, summaryTokens: 0 },
      config,
    )
    expect(noCompaction.compactionInput).toBe(0)
    expect(noCompaction.compactionOutput).toBe(0)

    const withCompaction = defaultCostCalculator.calculate(
      cache,
      0,
      { fired: true, tokensCompacted: 100_000, summaryTokens: 10_000 },
      config,
    )
    // compactionInput = 100000 * (0.8/1M) = 0.08
    expect(withCompaction.compactionInput).toBeCloseTo(0.08, 6)
    // compactionOutput = 10000 * (4/1M) = 0.04
    expect(withCompaction.compactionOutput).toBeCloseTo(0.04, 6)
  })

  it('zero cache state produces only uncached input + output cost', () => {
    const cache: CacheState = {
      cachedPrefixTokens: 0,
      cacheHitTokens: 0,
      cacheWriteTokens: 0,
      uncachedTokens: 10_000,
      hitRate: 0,
    }
    const result = defaultCostCalculator.calculate(
      cache,
      500,
      { fired: false, tokensCompacted: 0, summaryTokens: 0 },
      config,
    )
    expect(result.cachedInput).toBe(0)
    expect(result.cacheWrite).toBe(0)
    expect(result.uncachedInput).toBeCloseTo(0.05, 6) // 10000 * 5/1M
    expect(result.output).toBeCloseTo(0.0125, 6) // 500 * 25/1M
  })
})

describe('addCosts', () => {
  it('sums all cost components', () => {
    const a = { ...ZERO_COST, cachedInput: 0.01, output: 0.05, total: 0.06 }
    const b = { ...ZERO_COST, cachedInput: 0.02, output: 0.03, total: 0.05 }
    const sum = addCosts(a, b)
    expect(sum.cachedInput).toBeCloseTo(0.03, 6)
    expect(sum.output).toBeCloseTo(0.08, 6)
    expect(sum.total).toBeCloseTo(0.11, 6)
  })
})
