import { describe, it, expect } from 'vitest'
import { strategy1, getStrategy } from '../strategy'
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

describe('strategy1', () => {
  const config: SimulationConfig = {
    ...DEFAULT_CONFIG,
    contextWindow: 10_000,
    compactionThreshold: 0.8, // fires at > 8000 tokens
    compressionRatio: 10,
  }

  it('does NOT compact when context is below threshold', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    // 4500 tokens, threshold = 8000
    const result = strategy1.evaluate(context, config)
    expect(result.shouldCompact).toBe(false)
    expect(result.newContext).toBeUndefined()
  })

  it('compacts when context exceeds threshold', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 2_000),
    ])
    // 8400 tokens > 8000 threshold
    const result = strategy1.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
  })

  it('after compaction, context contains only system + summary', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 2_000),
    ])
    const result = strategy1.evaluate(context, config)
    expect(result.newContext).toBeDefined()
    expect(result.newContext!.messages.length).toBe(2)
    expect(result.newContext!.messages[0].type).toBe('system')
    expect(result.newContext!.messages[1].type).toBe('summary')
  })

  it('summary tokens = compacted tokens / compression ratio', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 2_000),
    ])
    // Non-system tokens: 200 + 2000 + 200 + 2000 = 4400
    // Summary = ceil(4400 / 10) = 440
    const result = strategy1.evaluate(context, config)
    expect(result.summaryMessage!.tokens).toBe(440)
    // Total context after: 4000 + 440 = 4440
    expect(result.newContext!.totalTokens).toBe(4_440)
  })

  it('compacts at exactly the threshold boundary', () => {
    // Threshold is 8000 — context at exactly 8000 should NOT compact (<=)
    const atThreshold = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('a1', 'assistant', 4_000),
    ])
    expect(strategy1.evaluate(atThreshold, config).shouldCompact).toBe(false)

    // One token over should compact
    const overThreshold = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('a1', 'assistant', 4_001),
    ])
    expect(strategy1.evaluate(overThreshold, config).shouldCompact).toBe(true)
  })

  it('returns compacted message IDs excluding system', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 4_200),
    ])
    const result = strategy1.evaluate(context, config)
    expect(result.compactedMessageIds).toEqual(['u1', 'a1'])
  })
})

describe('getStrategy', () => {
  it('returns a valid strategy for full-compaction', () => {
    const strategy = getStrategy('full-compaction')
    expect(strategy).toBeDefined()
    expect(typeof strategy.evaluate).toBe('function')
  })

  it('returns a valid strategy for incremental', () => {
    const strategy = getStrategy('incremental')
    expect(strategy).toBeDefined()
    expect(typeof strategy.evaluate).toBe('function')
  })

  it('full-compaction strategy behaves like strategy1', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      contextWindow: 10_000,
      compactionThreshold: 0.8,
      compressionRatio: 10,
    }
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('a1', 'assistant', 5_000),
    ])
    const fromRegistry = getStrategy('full-compaction').evaluate(context, config)
    const fromDirect = strategy1.evaluate(context, config)
    expect(fromRegistry.shouldCompact).toBe(fromDirect.shouldCompact)
  })
})
