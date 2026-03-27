import { describe, it, expect } from 'vitest'
import { strategy1, strategy2, strategy4a, strategy4c, getStrategy } from '../strategy'
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

describe('strategy2', () => {
  const config: SimulationConfig = {
    ...DEFAULT_CONFIG,
    incrementalInterval: 5_000,
    summaryAccumulationThreshold: 10_000,
    compressionRatio: 10,
  }

  it('does NOT compact when new content is below incrementalInterval', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    // New content: 200 + 300 = 500, interval = 5000
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(false)
  })

  it('compacts when new content exceeds incrementalInterval', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    // New content: 200 + 2000 + 200 + 3000 = 5400 > 5000
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
  })

  it('only compacts new content after the last summary', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 500), // existing summary
      makeMsg('u2', 'user', 200),
      makeMsg('a2', 'assistant', 2_000),
      makeMsg('tc2', 'tool_call', 200),
      makeMsg('tr2', 'tool_result', 3_000),
    ])
    // New content (after s1): 200 + 2000 + 200 + 3000 = 5400 > 5000
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    // Summary = ceil(5400 / 10) = 540
    expect(result.summaryMessage!.tokens).toBe(540)
    // Compacted IDs should NOT include the existing summary or system
    expect(result.compactedMessageIds).toContain('u2')
    expect(result.compactedMessageIds).toContain('a2')
    expect(result.compactedMessageIds).toContain('tc2')
    expect(result.compactedMessageIds).toContain('tr2')
    expect(result.compactedMessageIds).not.toContain('sys')
    expect(result.compactedMessageIds).not.toContain('s1')
  })

  it('accumulates multiple summaries in context', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 500),
      makeMsg('u2', 'user', 200),
      makeMsg('a2', 'assistant', 3_000),
      makeMsg('tc2', 'tool_call', 200),
      makeMsg('tr2', 'tool_result', 2_000),
    ])
    // New content: 200 + 3000 + 200 + 2000 = 5400 > 5000
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    // New context: [system, s1, new_summary]
    expect(result.newContext!.messages.length).toBe(3)
    expect(result.newContext!.messages[0].type).toBe('system')
    expect(result.newContext!.messages[1].id).toBe('s1')
    expect(result.newContext!.messages[2].type).toBe('summary')
  })

  it('triggers meta-compaction when summaries exceed threshold', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 4_000),
      makeMsg('s2', 'summary', 4_000),
      makeMsg('u3', 'user', 200),
      makeMsg('a3', 'assistant', 3_000),
      makeMsg('tc3', 'tool_call', 200),
      makeMsg('tr3', 'tool_result', 2_000),
    ])
    // New content: 200 + 3000 + 200 + 2000 = 5400 > 5000
    // New summary = ceil(5400 / 10) = 540
    // Total summaries: 4000 + 4000 + 540 = 8540 < 10000 → no meta-compaction
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    // Should have 3 summaries, no meta-compaction
    expect(result.newContext!.messages.length).toBe(4) // sys + 3 summaries
  })

  it('meta-compacts when accumulated summaries exceed threshold', () => {
    const metaConfig: SimulationConfig = {
      ...config,
      summaryAccumulationThreshold: 5_000,
    }
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 3_000),
      makeMsg('s2', 'summary', 3_000),
      makeMsg('u3', 'user', 200),
      makeMsg('a3', 'assistant', 3_000),
      makeMsg('tc3', 'tool_call', 200),
      makeMsg('tr3', 'tool_result', 2_000),
    ])
    // New content: 5400 > 5000 → compact
    // New summary: ceil(5400 / 10) = 540
    // Total summaries: 3000 + 3000 + 540 = 6540 > 5000 → meta-compact
    // Meta summary: ceil(6540 / 10) = 654
    const result = strategy2.evaluate(context, metaConfig)
    expect(result.shouldCompact).toBe(true)
    // After meta-compaction: [system, meta_summary]
    expect(result.newContext!.messages.length).toBe(2)
    expect(result.newContext!.messages[1].tokens).toBe(654)
    // Compacted IDs should include new content AND old summaries
    expect(result.compactedMessageIds).toContain('s1')
    expect(result.compactedMessageIds).toContain('s2')
    expect(result.compactedMessageIds).toContain('u3')
  })

  it('compaction cost is based on new content only (not full context)', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 500),
      makeMsg('u2', 'user', 200),
      makeMsg('a2', 'assistant', 5_000),
    ])
    // New content: 200 + 5000 = 5200 > 5000
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    // Only new content messages are in compactedMessageIds
    const compactedIds = result.compactedMessageIds!
    expect(compactedIds).toEqual(['u2', 'a2'])
    // The existing summary s1 is NOT compacted (no meta-compaction needed)
    expect(compactedIds).not.toContain('s1')
  })

  it('does not compact at exactly the interval boundary', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('a1', 'assistant', 5_000),
    ])
    // New content: 5000, interval = 5000 → should NOT compact (<=)
    expect(strategy2.evaluate(context, config).shouldCompact).toBe(false)

    const overContext = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('a1', 'assistant', 5_001),
    ])
    expect(strategy2.evaluate(overContext, config).shouldCompact).toBe(true)
  })

  it('preserves cache prefix for earlier summaries', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 500),
      makeMsg('u2', 'user', 200),
      makeMsg('a2', 'assistant', 5_000),
    ])
    const result = strategy2.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    // After compaction: [system, s1, new_summary]
    // s1 should be the exact same object — ID preserved
    expect(result.newContext!.messages[1].id).toBe('s1')
    expect(result.newContext!.messages[1].tokens).toBe(500)
  })
})

describe('strategy4a', () => {
  const config: SimulationConfig = {
    ...DEFAULT_CONFIG,
    contextWindow: 10_000,
    compactionThreshold: 0.8,
    incrementalInterval: 5_000,
    summaryAccumulationThreshold: 10_000,
    compressionRatio: 10,
  }

  it('does NOT compact when below both thresholds', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    const result = strategy4a.evaluate(context, config)
    expect(result.shouldCompact).toBe(false)
    expect(result.externalStoreEntries).toBeUndefined()
  })

  it('compacts when new content exceeds incrementalInterval', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    // New content: 200 + 2000 + 200 + 3000 = 5400 > 5000
    const result = strategy4a.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
  })

  it('compacts when main threshold exceeded before incremental interval', () => {
    const thresholdConfig: SimulationConfig = {
      ...config,
      incrementalInterval: 100_000, // very high — won't trigger
    }
    const context = makeContext([
      makeMsg('sys', 'system', 1_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 3_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 5_000),
    ])
    // 9400 tokens > 8000 threshold
    const result = strategy4a.evaluate(context, thresholdConfig)
    expect(result.shouldCompact).toBe(true)
  })

  it('produces externalStoreEntries on compaction', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    const result = strategy4a.evaluate(context, config)
    expect(result.externalStoreEntries).toBeDefined()
    expect(result.externalStoreEntries!.length).toBe(1)

    const entry = result.externalStoreEntries![0]
    expect(entry.level).toBe(0)
    expect(entry.originalMessageIds).toEqual(['u1', 'a1', 'tc1', 'tr1'])
    // Tokens should equal the sum of compacted messages
    expect(entry.tokens).toBe(200 + 2_000 + 200 + 3_000)
  })

  it('external store entries match compactedMessageIds', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 500),
      makeMsg('u2', 'user', 200),
      makeMsg('a2', 'assistant', 2_000),
      makeMsg('tc2', 'tool_call', 200),
      makeMsg('tr2', 'tool_result', 3_000),
    ])
    const result = strategy4a.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    const entryIds = result.externalStoreEntries![0].originalMessageIds
    expect(entryIds).toEqual(result.compactedMessageIds)
  })

  it('compaction result context matches strategy2', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    const result4a = strategy4a.evaluate(context, config)
    const result2 = strategy2.evaluate(context, config)
    expect(result4a.shouldCompact).toBe(result2.shouldCompact)
    expect(result4a.newContext!.totalTokens).toBe(result2.newContext!.totalTokens)
    expect(result4a.compactedMessageIds).toEqual(result2.compactedMessageIds)
  })

  it('meta-compaction includes old summaries in external store entries', () => {
    const metaConfig: SimulationConfig = {
      ...config,
      summaryAccumulationThreshold: 5_000,
    }
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('s1', 'summary', 3_000),
      makeMsg('s2', 'summary', 3_000),
      makeMsg('u3', 'user', 200),
      makeMsg('a3', 'assistant', 3_000),
      makeMsg('tc3', 'tool_call', 200),
      makeMsg('tr3', 'tool_result', 2_000),
    ])
    const result = strategy4a.evaluate(context, metaConfig)
    expect(result.shouldCompact).toBe(true)
    expect(result.externalStoreEntries).toBeDefined()

    const entryIds = result.externalStoreEntries![0].originalMessageIds
    // Should include new content AND old summaries (meta-compacted)
    expect(entryIds).toContain('s1')
    expect(entryIds).toContain('s2')
    expect(entryIds).toContain('u3')
  })
})

describe('strategy4c', () => {
  const config: SimulationConfig = {
    ...DEFAULT_CONFIG,
    contextWindow: 10_000,
    compactionThreshold: 0.8,
    incrementalInterval: 5_000,
    summaryAccumulationThreshold: 10_000,
    compressionRatio: 10,
  }

  it('does NOT compact when below thresholds', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 300),
    ])
    const result = strategy4c.evaluate(context, config)
    expect(result.shouldCompact).toBe(false)
    expect(result.externalStoreEntries).toBeUndefined()
  })

  it('only stores tool_result messages in external store', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    const result = strategy4c.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    expect(result.externalStoreEntries).toBeDefined()
    expect(result.externalStoreEntries!.length).toBe(1)

    const entry = result.externalStoreEntries![0]
    // Only tool_result messages in external store
    expect(entry.originalMessageIds).toEqual(['tr1'])
    expect(entry.tokens).toBe(3_000)
  })

  it('non-tool-result messages are compacted normally (lossy)', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    const result = strategy4c.evaluate(context, config)
    // Compacted IDs include ALL non-system messages (same as strategy 2)
    expect(result.compactedMessageIds).toContain('u1')
    expect(result.compactedMessageIds).toContain('a1')
    expect(result.compactedMessageIds).toContain('tc1')
    expect(result.compactedMessageIds).toContain('tr1')
  })

  it('retrieval compressed tokens only counts tool_result tokens', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    const result = strategy4c.evaluate(context, config)
    expect(result.retrievalCompressedTokens).toBe(3_000)
  })

  it('compaction context matches strategy2', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 2_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 3_000),
    ])
    const result4c = strategy4c.evaluate(context, config)
    const result2 = strategy2.evaluate(context, config)
    expect(result4c.newContext!.totalTokens).toBe(result2.newContext!.totalTokens)
    expect(result4c.compactedMessageIds).toEqual(result2.compactedMessageIds)
  })

  it('stores multiple tool_results in a single external store entry', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 1_000),
      makeMsg('tc1', 'tool_call', 200),
      makeMsg('tr1', 'tool_result', 2_000),
      makeMsg('a1', 'assistant', 300),
      makeMsg('tc2', 'tool_call', 200),
      makeMsg('tr2', 'tool_result', 2_500),
    ])
    // New content: 200 + 2000 + 300 + 200 + 2500 = 5200 > 5000
    const result = strategy4c.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    const entry = result.externalStoreEntries![0]
    expect(entry.originalMessageIds).toEqual(['tr1', 'tr2'])
    expect(entry.tokens).toBe(4_500)
  })

  it('returns retrievalCompressedTokens=0 when no tool_results are compacted', () => {
    const context = makeContext([
      makeMsg('sys', 'system', 4_000),
      makeMsg('u1', 'user', 200),
      makeMsg('a1', 'assistant', 5_000),
    ])
    // New content: 200 + 5000 = 5200 > 5000, but no tool_results
    const result = strategy4c.evaluate(context, config)
    expect(result.shouldCompact).toBe(true)
    expect(result.externalStoreEntries).toBeUndefined()
    expect(result.retrievalCompressedTokens).toBe(0)
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

  it('returns a valid strategy for lossless-append', () => {
    const strategy = getStrategy('lossless-append')
    expect(strategy).toBeDefined()
    expect(typeof strategy.evaluate).toBe('function')
  })

  it('returns a valid strategy for lossless-tool-results', () => {
    const strategy = getStrategy('lossless-tool-results')
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
