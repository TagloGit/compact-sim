import { describe, it, expect } from 'vitest'
import type { StepState } from '../simulation'
import {
  ingestMessage,
  buildContext,
  evaluateCompaction,
  updateExternalStore,
  calculateCache,
  rollRetrieval,
  calculateCost,
  buildSnapshot,
} from '../simulation'
import type { Message, SimulationConfig } from '../types'
import { DEFAULT_CONFIG, EMPTY_EXTERNAL_STORE } from '../types'
import { ZERO_COST } from '../cost'
import { ZERO_CACHE } from '../cache'

function makeState(overrides?: Partial<StepState>): StepState {
  return {
    conversation: [],
    context: { messages: [], totalTokens: 0 },
    previousContext: null,
    externalStore: EMPTY_EXTERNAL_STORE,
    compressedTokens: 0,
    summaryCounter: 0,
    cumulativeCost: ZERO_COST,
    peakContextSize: 0,
    rng: () => 0.5,
    compactionEvent: false,
    retrievalEvent: false,
    tokensCompacted: 0,
    summaryTokens: 0,
    cache: ZERO_CACHE,
    stepCost: ZERO_COST,
    ...overrides,
  }
}

function makeMessage(
  id: string,
  type: Message['type'],
  tokens: number,
): Message {
  return { id, type, tokens, compacted: false }
}

const config: SimulationConfig = {
  ...DEFAULT_CONFIG,
  toolCompressionEnabled: false,
}

describe('pipeline stages', () => {
  describe('ingestMessage', () => {
    it('adds the message to conversation', () => {
      const state = makeState()
      const msg = makeMessage('m1', 'user', 200)
      const next = ingestMessage(state, msg, config)
      expect(next.conversation).toHaveLength(1)
      expect(next.conversation[0].id).toBe('m1')
    })

    it('applies tool compression when enabled', () => {
      const compConfig = { ...config, toolCompressionEnabled: true, toolCompressionRatio: 5 }
      const state = makeState()
      const msg = makeMessage('m1', 'tool_result', 1000)
      const next = ingestMessage(state, msg, compConfig)
      expect(next.conversation[0].tokens).toBe(200)
    })

    it('does not mutate original state', () => {
      const state = makeState()
      const msg = makeMessage('m1', 'user', 200)
      const conversationBefore = state.conversation
      ingestMessage(state, msg, config)
      expect(state.conversation).toBe(conversationBefore)
      expect(state.conversation).toHaveLength(0)
    })

    it('resets per-step transient fields', () => {
      const state = makeState({
        compactionEvent: true,
        tokensCompacted: 500,
        summaryTokens: 50,
      })
      const msg = makeMessage('m1', 'user', 200)
      const next = ingestMessage(state, msg, config)
      expect(next.compactionEvent).toBe(false)
      expect(next.tokensCompacted).toBe(0)
      expect(next.summaryTokens).toBe(0)
    })
  })

  describe('buildContext', () => {
    it('filters out compacted messages', () => {
      const state = makeState({
        conversation: [
          makeMessage('m1', 'system', 1000),
          { ...makeMessage('m2', 'user', 200), compacted: true, compactedInto: 's1' },
          makeMessage('s1', 'summary', 50),
          makeMessage('m3', 'assistant', 300),
        ],
      })
      const next = buildContext(state)
      expect(next.context.messages).toHaveLength(3)
      expect(next.context.messages.map((m) => m.id)).toEqual(['m1', 's1', 'm3'])
      expect(next.context.totalTokens).toBe(1350)
    })

    it('does not mutate original state', () => {
      const state = makeState({
        conversation: [makeMessage('m1', 'system', 1000)],
      })
      const contextBefore = state.context
      buildContext(state)
      expect(state.context).toBe(contextBefore)
    })
  })

  describe('evaluateCompaction', () => {
    it('returns state unchanged when compaction does not fire', () => {
      const state = makeState({
        conversation: [
          makeMessage('m1', 'system', 1000),
          makeMessage('m2', 'user', 200),
        ],
        context: {
          messages: [
            makeMessage('m1', 'system', 1000),
            makeMessage('m2', 'user', 200),
          ],
          totalTokens: 1200,
        },
      })
      const bigWindowConfig = { ...config, contextWindow: 200_000, compactionThreshold: 0.85 }
      const next = evaluateCompaction(state, bigWindowConfig)
      expect(next.compactionEvent).toBe(false)
      expect(next.conversation).toBe(state.conversation)
    })

    it('fires compaction and produces new state when threshold exceeded', () => {
      const messages = [
        makeMessage('m1', 'system', 1000),
        makeMessage('m2', 'user', 5000),
        makeMessage('m3', 'assistant', 5000),
      ]
      const state = makeState({
        conversation: messages,
        context: { messages, totalTokens: 11000 },
      })
      const smallConfig = {
        ...config,
        contextWindow: 10_000,
        compactionThreshold: 0.8,
        compressionRatio: 10,
      }
      const next = evaluateCompaction(state, smallConfig)
      expect(next.compactionEvent).toBe(true)
      expect(next.tokensCompacted).toBeGreaterThan(0)
      expect(next.summaryCounter).toBeGreaterThan(0)
    })

    it('does not mutate original state', () => {
      const messages = [
        makeMessage('m1', 'system', 1000),
        makeMessage('m2', 'user', 5000),
        makeMessage('m3', 'assistant', 5000),
      ]
      const state = makeState({
        conversation: messages,
        context: { messages, totalTokens: 11000 },
      })
      const smallConfig = {
        ...config,
        contextWindow: 10_000,
        compactionThreshold: 0.8,
        compressionRatio: 10,
      }
      const convBefore = state.conversation
      const ctxBefore = state.context
      evaluateCompaction(state, smallConfig)
      expect(state.conversation).toBe(convBefore)
      expect(state.context).toBe(ctxBefore)
      expect(state.compactionEvent).toBe(false)
      expect(state.summaryCounter).toBe(0)
    })
  })

  describe('updateExternalStore', () => {
    it('is a no-op when no compaction event', () => {
      const state = makeState()
      const next = updateExternalStore(state)
      expect(next).toBe(state)
    })

    it('stores compacted messages in external store when compaction fires', () => {
      const state = makeState({
        compactionEvent: true,
        conversation: [
          makeMessage('m1', 'system', 1000),
          { ...makeMessage('m2', 'user', 5000), compacted: true, compactedInto: 'summary-1' },
          { ...makeMessage('m3', 'assistant', 5000), compacted: true, compactedInto: 'summary-1' },
          makeMessage('summary-1', 'summary', 500),
        ],
      })
      const next = updateExternalStore(state)
      expect(next.externalStore.entries).toHaveLength(1)
      expect(next.externalStore.entries[0].originalMessageIds).toEqual(['m2', 'm3'])
      expect(next.externalStore.entries[0].tokens).toBe(10000)
      expect(next.externalStore.totalTokens).toBe(10000)
    })
  })

  describe('calculateCache', () => {
    it('returns state unchanged for non-LLM steps', () => {
      const state = makeState({
        context: {
          messages: [makeMessage('m1', 'system', 1000)],
          totalTokens: 1000,
        },
      })
      const msg = makeMessage('m1', 'tool_result', 500)
      const next = calculateCache(state, msg, config)
      expect(next.cache).toBe(state.cache)
      expect(next.previousContext).toBeNull()
    })

    it('calculates cache for LLM call steps', () => {
      const messages = [
        makeMessage('m1', 'system', 4000),
        makeMessage('m2', 'user', 200),
        makeMessage('m3', 'assistant', 300),
      ]
      const state = makeState({
        context: { messages, totalTokens: 4500 },
        previousContext: null,
      })
      const msg = makeMessage('m3', 'assistant', 300)
      const next = calculateCache(state, msg, config)
      // First LLM call — no previous, so cache writes expected
      expect(next.cache.cacheWriteTokens).toBeGreaterThan(0)
      expect(next.previousContext).toBe(state.context)
    })
  })

  describe('rollRetrieval', () => {
    it('is a no-op when external store is empty', () => {
      const state = makeState({ compressedTokens: 50_000 })
      const msg = makeMessage('m1', 'assistant', 300)
      const next = rollRetrieval(state, msg, config)
      expect(next).toBe(state)
    })

    it('is a no-op for non-LLM steps', () => {
      const state = makeState({
        externalStore: {
          entries: [{ id: 'ext-1', originalMessageIds: ['m1'], tokens: 1000, level: 0 }],
          totalTokens: 1000,
        },
        compressedTokens: 50_000,
      })
      const msg = makeMessage('m1', 'tool_result', 500)
      const next = rollRetrieval(state, msg, config)
      expect(next).toBe(state)
    })

    it('fires retrieval when roll is below probability', () => {
      const state = makeState({
        rng: () => 0.01, // always low
        externalStore: {
          entries: [{ id: 'ext-1', originalMessageIds: ['m1'], tokens: 1000, level: 0 }],
          totalTokens: 1000,
        },
        compressedTokens: 100_000,
      })
      const msg = makeMessage('m1', 'assistant', 300)
      const next = rollRetrieval(state, msg, config)
      expect(next.retrievalEvent).toBe(true)
    })

    it('does not fire when roll exceeds probability', () => {
      const state = makeState({
        rng: () => 0.99, // always high
        externalStore: {
          entries: [{ id: 'ext-1', originalMessageIds: ['m1'], tokens: 1000, level: 0 }],
          totalTokens: 1000,
        },
        compressedTokens: 100_000,
      })
      const msg = makeMessage('m1', 'assistant', 300)
      const next = rollRetrieval(state, msg, config)
      expect(next).toBe(state)
    })
  })

  describe('calculateCost', () => {
    it('returns zero cost for non-LLM steps without compaction', () => {
      const state = makeState({
        context: {
          messages: [makeMessage('m1', 'system', 1000)],
          totalTokens: 1000,
        },
      })
      const msg = makeMessage('m1', 'tool_result', 500)
      const next = calculateCost(state, msg, config)
      expect(next.stepCost.total).toBe(0)
    })

    it('calculates compaction cost even on non-LLM steps', () => {
      const state = makeState({
        compactionEvent: true,
        tokensCompacted: 5000,
        summaryTokens: 500,
        context: {
          messages: [makeMessage('m1', 'system', 1000)],
          totalTokens: 1000,
        },
      })
      const msg = makeMessage('m1', 'tool_result', 500)
      const next = calculateCost(state, msg, config)
      expect(next.stepCost.compactionInput).toBeGreaterThan(0)
      expect(next.stepCost.compactionOutput).toBeGreaterThan(0)
    })

    it('updates peakContextSize', () => {
      const state = makeState({
        peakContextSize: 500,
        context: {
          messages: [makeMessage('m1', 'system', 1000)],
          totalTokens: 1000,
        },
      })
      const msg = makeMessage('m1', 'user', 200)
      const next = calculateCost(state, msg, config)
      expect(next.peakContextSize).toBe(1000)
    })

    it('does not lower peakContextSize', () => {
      const state = makeState({
        peakContextSize: 5000,
        context: {
          messages: [makeMessage('m1', 'system', 1000)],
          totalTokens: 1000,
        },
      })
      const msg = makeMessage('m1', 'user', 200)
      const next = calculateCost(state, msg, config)
      expect(next.peakContextSize).toBe(5000)
    })
  })

  describe('buildSnapshot', () => {
    it('creates a snapshot with correct fields', () => {
      const state = makeState({
        conversation: [makeMessage('m1', 'system', 1000)],
        context: {
          messages: [makeMessage('m1', 'system', 1000)],
          totalTokens: 1000,
        },
        cumulativeCost: { ...ZERO_COST, total: 0.05 },
        compactionEvent: true,
      })
      const msg = makeMessage('m1', 'system', 1000)
      const snapshot = buildSnapshot(state, msg, 0)
      expect(snapshot.stepIndex).toBe(0)
      expect(snapshot.message.id).toBe('m1')
      expect(snapshot.compactionEvent).toBe(true)
      expect(snapshot.externalStore).toBe(EMPTY_EXTERNAL_STORE)
      expect(snapshot.retrievalEvent).toBe(false)
    })

    it('creates a copy of conversation (not a reference)', () => {
      const conv = [makeMessage('m1', 'system', 1000)]
      const state = makeState({ conversation: conv })
      const msg = makeMessage('m1', 'system', 1000)
      const snapshot = buildSnapshot(state, msg, 0)
      expect(snapshot.conversation).not.toBe(conv)
      expect(snapshot.conversation).toEqual(conv)
    })
  })
})
