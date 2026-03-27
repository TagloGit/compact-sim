import type { SimulationConfig, StepCost } from './types'
import { ZERO_COST } from './cost'

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------

export type Rng = () => number

/**
 * Create a seeded PRNG (mulberry32). Returns a function that produces
 * deterministic floats in [0, 1) on each call.
 */
export function createRng(seed: number): Rng {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Retrieval probability model
// ---------------------------------------------------------------------------

/**
 * Calculate the probability of a retrieval event this step.
 *
 * Linear from 0% to pRetrieveMax as compressedTokens goes from 0 to
 * compressedTokensCap, then flat at pRetrieveMax.
 */
export function retrievalProbability(
  compressedTokens: number,
  config: SimulationConfig,
): number {
  if (config.compressedTokensCap <= 0 || config.pRetrieveMax <= 0) return 0
  const ratio = Math.min(compressedTokens / config.compressedTokensCap, 1.0)
  return ratio * config.pRetrieveMax
}

// ---------------------------------------------------------------------------
// Retrieval cost calculator
// ---------------------------------------------------------------------------

/**
 * Calculate the cost of a single retrieval event.
 *
 * The retrieval is modelled as an additional LLM call:
 * - Input: retrievalQueryTokens at base input price
 * - Output: retrievalResponseTokens at output price
 *
 * For hierarchical stores (4b), cost is multiplied by `(averageLevel + 1)`
 * to model the extra traversal cost of deeper store levels.
 */
export function retrievalCost(
  config: SimulationConfig,
  averageLevel: number = 0,
): StepCost {
  const levelMultiplier = averageLevel + 1
  const retrievalInput =
    config.retrievalQueryTokens * config.baseInputPrice * levelMultiplier
  const retrievalOutput =
    config.retrievalResponseTokens * config.outputPrice * levelMultiplier
  return {
    ...ZERO_COST,
    retrievalInput,
    retrievalOutput,
    total: retrievalInput + retrievalOutput,
  }
}

/**
 * Compute the token-weighted average level of entries in an external store.
 * Returns 0 when the store is empty.
 */
export function averageStoreLevel(
  entries: readonly { readonly tokens: number; readonly level: number }[],
): number {
  if (entries.length === 0) return 0
  const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0)
  if (totalTokens === 0) return 0
  const weightedSum = entries.reduce(
    (sum, e) => sum + e.level * e.tokens,
    0,
  )
  return weightedSum / totalTokens
}
