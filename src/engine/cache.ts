import { Context } from 'effect'
import type { CacheState, ContextState, SimulationConfig } from './types'

export interface CacheModel {
  readonly calculate: (
    previous: ContextState | null,
    current: ContextState,
    config: SimulationConfig,
  ) => CacheState
}

export class Cache extends Context.Tag('Cache')<Cache, CacheModel>() {}

export const ZERO_CACHE: CacheState = {
  cachedPrefixTokens: 0,
  cacheHitTokens: 0,
  cacheWriteTokens: 0,
  uncachedTokens: 0,
  hitRate: 0,
}

/**
 * Prefix-based cache model.
 *
 * Compares the current context to the previous context message-by-message
 * from the start. Identical messages (same id) are cache hits. The first
 * differing message is the cache break point.
 *
 * Cache write tokens: miss tokens that will form part of the new prefix
 * (everything except the very latest message).
 *
 * If the stable prefix is below minCacheableTokens, nothing is cached.
 */
export const prefixCacheModel: CacheModel = {
  calculate(previous, current, config) {
    if (!previous) {
      // First step: no previous context, everything is a cache write
      // (except the latest message which hasn't been "seen twice")
      const totalTokens = current.totalTokens
      if (totalTokens < config.minCacheableTokens) {
        return { ...ZERO_CACHE, uncachedTokens: totalTokens }
      }
      // All tokens except the last message are cache writes
      const lastMessage = current.messages[current.messages.length - 1]
      const lastTokens = lastMessage ? lastMessage.tokens : 0
      const writeTokens = totalTokens - lastTokens
      return {
        cachedPrefixTokens: 0,
        cacheHitTokens: 0,
        cacheWriteTokens: writeTokens,
        uncachedTokens: lastTokens,
        hitRate: 0,
      }
    }

    // Find the cache break point: compare message IDs from the start
    const prevMessages = previous.messages
    const currMessages = current.messages
    let cacheHitTokens = 0
    const minLen = Math.min(prevMessages.length, currMessages.length)

    let breakIndex = 0
    for (let i = 0; i < minLen; i++) {
      if (prevMessages[i].id === currMessages[i].id) {
        cacheHitTokens += currMessages[i].tokens
        breakIndex = i + 1
      } else {
        break
      }
    }

    // If stable prefix is below minimum, treat everything as uncached
    if (cacheHitTokens < config.minCacheableTokens) {
      return {
        cachedPrefixTokens: 0,
        cacheHitTokens: 0,
        cacheWriteTokens: 0,
        uncachedTokens: current.totalTokens,
        hitRate: 0,
      }
    }

    // Miss tokens: everything after the break point
    const missMessages = currMessages.slice(breakIndex)
    const missTokens = missMessages.reduce((sum, m) => sum + m.tokens, 0)

    // Cache write: miss tokens that will form part of the new prefix
    // (everything except the very latest message)
    const lastMessage = currMessages[currMessages.length - 1]
    const lastTokens = lastMessage ? lastMessage.tokens : 0

    // If all miss tokens belong to the last message, write = 0
    // Otherwise, write = missTokens - lastTokens
    const cacheWriteTokens =
      breakIndex < currMessages.length - 1
        ? missTokens - lastTokens
        : 0

    const uncachedTokens = lastTokens

    const totalInput = current.totalTokens
    const hitRate = totalInput > 0 ? cacheHitTokens / totalInput : 0

    return {
      cachedPrefixTokens: cacheHitTokens,
      cacheHitTokens,
      cacheWriteTokens,
      uncachedTokens,
      hitRate,
    }
  },
}
