import { describe, it, expect } from 'vitest'
import { createRng, retrievalProbability, retrievalCost, averageStoreLevel } from '../retrieval'
import { DEFAULT_CONFIG } from '../types'

const config = DEFAULT_CONFIG

describe('retrievalProbability', () => {
  it('returns 0 when compressedTokens is 0', () => {
    expect(retrievalProbability(0, config)).toBe(0)
  })

  it('returns pRetrieveMax when compressedTokens equals cap', () => {
    expect(retrievalProbability(100_000, config)).toBeCloseTo(0.20, 6)
  })

  it('returns pRetrieveMax when compressedTokens exceeds cap', () => {
    expect(retrievalProbability(200_000, config)).toBeCloseTo(0.20, 6)
  })

  it('scales linearly between 0 and cap', () => {
    const half = retrievalProbability(50_000, config)
    expect(half).toBeCloseTo(0.10, 6)

    const quarter = retrievalProbability(25_000, config)
    expect(quarter).toBeCloseTo(0.05, 6)
  })

  it('returns 0 when pRetrieveMax is 0', () => {
    const zeroConfig = { ...config, pRetrieveMax: 0 }
    expect(retrievalProbability(100_000, zeroConfig)).toBe(0)
  })

  it('returns 0 when compressedTokensCap is 0', () => {
    const zeroCapConfig = { ...config, compressedTokensCap: 0 }
    expect(retrievalProbability(50_000, zeroCapConfig)).toBe(0)
  })
})

describe('retrievalCost', () => {
  it('calculates input cost from retrievalQueryTokens', () => {
    const cost = retrievalCost(config)
    // 500 * (5/1M) = 0.0025
    expect(cost.retrievalInput).toBeCloseTo(0.0025, 6)
  })

  it('calculates output cost from retrievalResponseTokens', () => {
    const cost = retrievalCost(config)
    // 300 * (25/1M) = 0.0075
    expect(cost.retrievalOutput).toBeCloseTo(0.0075, 6)
  })

  it('total equals input + output', () => {
    const cost = retrievalCost(config)
    expect(cost.total).toBeCloseTo(cost.retrievalInput + cost.retrievalOutput, 10)
  })

  it('other cost fields are zero', () => {
    const cost = retrievalCost(config)
    expect(cost.cachedInput).toBe(0)
    expect(cost.cacheWrite).toBe(0)
    expect(cost.uncachedInput).toBe(0)
    expect(cost.output).toBe(0)
    expect(cost.compactionInput).toBe(0)
    expect(cost.compactionOutput).toBe(0)
  })

  it('scales cost by (averageLevel + 1)', () => {
    const baseCost = retrievalCost(config, 0)
    const level1Cost = retrievalCost(config, 1)
    // Level 1: multiplier is 2
    expect(level1Cost.retrievalInput).toBeCloseTo(baseCost.retrievalInput * 2, 10)
    expect(level1Cost.retrievalOutput).toBeCloseTo(baseCost.retrievalOutput * 2, 10)
    expect(level1Cost.total).toBeCloseTo(baseCost.total * 2, 10)
  })

  it('handles fractional average levels', () => {
    const cost = retrievalCost(config, 0.5)
    const baseCost = retrievalCost(config, 0)
    // multiplier = 1.5
    expect(cost.total).toBeCloseTo(baseCost.total * 1.5, 10)
  })
})

describe('averageStoreLevel', () => {
  it('returns 0 for empty entries', () => {
    expect(averageStoreLevel([])).toBe(0)
  })

  it('returns 0 for all level-0 entries', () => {
    const entries = [
      { tokens: 1000, level: 0 },
      { tokens: 2000, level: 0 },
    ]
    expect(averageStoreLevel(entries)).toBe(0)
  })

  it('computes token-weighted average', () => {
    const entries = [
      { tokens: 8000, level: 0 },
      { tokens: 2000, level: 1 },
    ]
    // weighted: (8000*0 + 2000*1) / 10000 = 0.2
    expect(averageStoreLevel(entries)).toBeCloseTo(0.2, 6)
  })

  it('returns exact level when all entries are same level', () => {
    const entries = [
      { tokens: 1000, level: 2 },
      { tokens: 3000, level: 2 },
    ]
    expect(averageStoreLevel(entries)).toBe(2)
  })
})

describe('createRng (seeded PRNG)', () => {
  it('produces deterministic results for the same seed', () => {
    const rng1 = createRng(42)
    const rng2 = createRng(42)
    const values1 = Array.from({ length: 10 }, () => rng1())
    const values2 = Array.from({ length: 10 }, () => rng2())
    expect(values1).toEqual(values2)
  })

  it('produces different results for different seeds', () => {
    const rng1 = createRng(42)
    const rng2 = createRng(99)
    const values1 = Array.from({ length: 5 }, () => rng1())
    const values2 = Array.from({ length: 5 }, () => rng2())
    expect(values1).not.toEqual(values2)
  })

  it('produces values in [0, 1)', () => {
    const rng = createRng(123)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
