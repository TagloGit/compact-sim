import { describe, it, expect } from 'vitest'
import { prefixCacheModel } from '../cache'
import type { ContextState, Message, SimulationConfig } from '../types'
import { DEFAULT_CONFIG } from '../types'

function makeMsg(
  id: string,
  type: Message['type'],
  tokens: number,
): Message {
  return { id, type, tokens, compacted: false }
}

function makeContext(messages: Message[]): ContextState {
  return {
    messages,
    totalTokens: messages.reduce((sum, m) => sum + m.tokens, 0),
  }
}

const config: SimulationConfig = {
  ...DEFAULT_CONFIG,
  minCacheableTokens: 2_048,
}

describe('prefixCacheModel', () => {
  it('first step with no previous context: all tokens except last are cache writes', () => {
    const current = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
    ])
    const result = prefixCacheModel.calculate(null, current, config)
    expect(result.cacheHitTokens).toBe(0)
    expect(result.cacheWriteTokens).toBe(4_000) // sys tokens
    expect(result.uncachedTokens).toBe(200) // latest message
    expect(result.hitRate).toBe(0)
  })

  it('steady state: appending a message → previous prefix is all cache hits', () => {
    const prev = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
    ])
    const current = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    const result = prefixCacheModel.calculate(prev, current, config)
    // sys + u1 = 4200 tokens are cache hits
    expect(result.cacheHitTokens).toBe(4_200)
    // u1→a1 gap: no new messages between break and last, so write = 0
    expect(result.cacheWriteTokens).toBe(0)
    // Last message (a1) is uncached
    expect(result.uncachedTokens).toBe(300)
    expect(result.hitRate).toBeCloseTo(4_200 / 4_500, 4)
  })

  it('after compaction: only system prompt is a cache hit, summary is cache write', () => {
    const prev = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    // After compaction: system + summary
    const current = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('summary-1', 'summary', 50),
    ])
    const result = prefixCacheModel.calculate(prev, current, config)
    // Only system is a hit
    expect(result.cacheHitTokens).toBe(4_000)
    // Summary is the last message after break → uncached
    expect(result.cacheWriteTokens).toBe(0)
    expect(result.uncachedTokens).toBe(50)
  })

  it('min cacheable tokens: if prefix is too small, nothing is cached', () => {
    const prev = makeContext([
      makeMsg('sys', 'system', 500),
      makeMsg('u1', 'user', 200),
    ])
    const current = makeContext([
      makeMsg('sys', 'system', 500),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    // Prefix match = sys + u1 = 700 < minCacheableTokens (2048)
    const result = prefixCacheModel.calculate(prev, current, config)
    expect(result.cacheHitTokens).toBe(0)
    expect(result.cacheWriteTokens).toBe(0)
    expect(result.uncachedTokens).toBe(1_000) // all tokens
    expect(result.hitRate).toBe(0)
  })

  it('first step below min cacheable: everything is uncached', () => {
    const current = makeContext([
      makeMsg('sys', 'system', 500),
      makeMsg('u1', 'user', 200),
    ])
    const result = prefixCacheModel.calculate(null, current, config)
    expect(result.cacheHitTokens).toBe(0)
    expect(result.cacheWriteTokens).toBe(0)
    expect(result.uncachedTokens).toBe(700)
  })

  it('multiple new messages after break point: middle ones are cache writes', () => {
    const prev = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
    ])
    const current = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
      makeMsg('r1', 'reasoning', 500),
      makeMsg('tc1', 'tool_call', 200),
    ])
    const result = prefixCacheModel.calculate(prev, current, config)
    expect(result.cacheHitTokens).toBe(4_200)
    // a1 + r1 = 800 are cache writes (between break and last message)
    expect(result.cacheWriteTokens).toBe(800)
    // tc1 = 200 is uncached (last message)
    expect(result.uncachedTokens).toBe(200)
  })
})
