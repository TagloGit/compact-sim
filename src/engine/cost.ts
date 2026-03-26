import { Context } from 'effect'
import type { CacheState, SimulationConfig, StepCost } from './types'

export interface CostCalculator {
  readonly calculate: (
    cache: CacheState,
    outputTokens: number,
    compaction: { fired: boolean; tokensCompacted: number; summaryTokens: number },
    config: SimulationConfig,
  ) => StepCost
  readonly calculateCompactionCost: (
    tokensCompacted: number,
    summaryTokens: number,
    config: SimulationConfig,
  ) => StepCost
}

export class Cost extends Context.Tag('Cost')<Cost, CostCalculator>() {}

export const ZERO_COST: StepCost = {
  cachedInput: 0,
  cacheWrite: 0,
  uncachedInput: 0,
  output: 0,
  compactionInput: 0,
  compactionOutput: 0,
  total: 0,
}

/**
 * Calculate the cost breakdown for a single simulation step.
 *
 * Input cost components come from the cache state.
 * Output cost is for assistant + reasoning tokens produced this step.
 * Compaction cost only applies when compaction fired this step.
 */
export const defaultCostCalculator: CostCalculator = {
  calculate(cache, outputTokens, compaction, config) {
    const cachedInput =
      cache.cacheHitTokens * config.baseInputPrice * config.cacheHitMultiplier
    const cacheWrite =
      cache.cacheWriteTokens *
      config.baseInputPrice *
      config.cacheWriteMultiplier
    const uncachedInput = cache.uncachedTokens * config.baseInputPrice
    const output = outputTokens * config.outputPrice

    let compactionInput = 0
    let compactionOutput = 0
    if (compaction.fired) {
      compactionInput =
        compaction.tokensCompacted * config.compactionInputPrice
      compactionOutput =
        compaction.summaryTokens * config.compactionOutputPrice
    }

    const total =
      cachedInput +
      cacheWrite +
      uncachedInput +
      output +
      compactionInput +
      compactionOutput

    return {
      cachedInput,
      cacheWrite,
      uncachedInput,
      output,
      compactionInput,
      compactionOutput,
      total,
    }
  },

  calculateCompactionCost(tokensCompacted, summaryTokens, config) {
    const compactionInput = tokensCompacted * config.compactionInputPrice
    const compactionOutput = summaryTokens * config.compactionOutputPrice
    return {
      ...ZERO_COST,
      compactionInput,
      compactionOutput,
      total: compactionInput + compactionOutput,
    }
  },
}

export function addCosts(a: StepCost, b: StepCost): StepCost {
  return {
    cachedInput: a.cachedInput + b.cachedInput,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    uncachedInput: a.uncachedInput + b.uncachedInput,
    output: a.output + b.output,
    compactionInput: a.compactionInput + b.compactionInput,
    compactionOutput: a.compactionOutput + b.compactionOutput,
    total: a.total + b.total,
  }
}
