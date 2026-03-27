import { Effect } from 'effect'
import type {
  CacheState,
  ContextState,
  ExternalStore,
  ExternalStoreEntry,
  Message,
  SimulationConfig,
  SimulationResult,
  SimulationSnapshot,
  StepCost,
} from './types'
import { EMPTY_EXTERNAL_STORE } from './types'
import { generateConversation } from './conversation'
import { getStrategy, type ExternalStoreInput } from './strategy'
import { prefixCacheModel, ZERO_CACHE } from './cache'
import { defaultCostCalculator, ZERO_COST, addCosts } from './cost'
import {
  createRng,
  retrievalProbability,
  retrievalCost,
  type Rng,
} from './retrieval'

// ---------------------------------------------------------------------------
// StepState — immutable state threaded through the pipeline
// ---------------------------------------------------------------------------

export interface StepState {
  readonly conversation: readonly Message[]
  readonly context: ContextState
  readonly previousContext: ContextState | null
  readonly externalStore: ExternalStore
  readonly compressedTokens: number
  readonly summaryCounter: number
  readonly cumulativeCost: StepCost
  readonly peakContextSize: number
  readonly rng: Rng
  // Per-step transient fields (reset each iteration)
  readonly compactionEvent: boolean
  readonly retrievalEvent: boolean
  readonly tokensCompacted: number
  readonly summaryTokens: number
  readonly pendingStoreEntries: readonly ExternalStoreInput[]
  readonly cache: CacheState
  readonly stepCost: StepCost
}

// ---------------------------------------------------------------------------
// Helper — LLM call detection
// ---------------------------------------------------------------------------

function getOutputTokens(message: Message): number {
  if (message.type === 'assistant' || message.type === 'reasoning') {
    return message.tokens
  }
  return 0
}

function isLlmCallStep(message: Message): boolean {
  return message.type === 'assistant' || message.type === 'reasoning'
}

// ---------------------------------------------------------------------------
// Pipeline stage 1: ingestMessage
// ---------------------------------------------------------------------------

export function ingestMessage(
  state: StepState,
  rawMessage: Message,
  config: SimulationConfig,
): StepState {
  const message =
    config.toolCompressionEnabled && rawMessage.type === 'tool_result'
      ? {
          ...rawMessage,
          tokens: Math.ceil(rawMessage.tokens / config.toolCompressionRatio),
        }
      : rawMessage

  return {
    ...state,
    conversation: [...state.conversation, message],
    // Reset per-step transient fields
    compactionEvent: false,
    retrievalEvent: false,
    tokensCompacted: 0,
    summaryTokens: 0,
    pendingStoreEntries: [],
    cache: ZERO_CACHE,
    stepCost: ZERO_COST,
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage 2: buildContext
// ---------------------------------------------------------------------------

export function buildContext(state: StepState): StepState {
  const active = state.conversation.filter((m) => !m.compacted)
  const totalTokens = active.reduce((sum, m) => sum + m.tokens, 0)
  return {
    ...state,
    context: { messages: active, totalTokens },
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage 3: evaluateCompaction
// ---------------------------------------------------------------------------

export function evaluateCompaction(
  state: StepState,
  config: SimulationConfig,
): StepState {
  const strategy = getStrategy(config.selectedStrategy)
  const result = strategy.evaluate(state.context, config)

  if (!result.shouldCompact || !result.newContext || !result.summaryMessage) {
    return state
  }

  // Generate deterministic summary IDs for all new summaries
  const newSummaries = result.newContext.messages.filter(
    (m) =>
      m.type === 'summary' &&
      !state.context.messages.some((existing) => existing.id === m.id),
  )
  const summaryIdMap = new Map<string, string>()
  let summaryCounter = state.summaryCounter
  for (const s of newSummaries) {
    summaryCounter++
    summaryIdMap.set(s.id, `summary-${summaryCounter}`)
  }

  // The primary summary message (for cost and compactedInto tracking)
  const primarySummaryId =
    summaryIdMap.get(result.summaryMessage.id) ?? result.summaryMessage.id
  const summaryMessage: Message = {
    ...result.summaryMessage,
    id: primarySummaryId,
  }

  // Calculate compaction metrics
  const compactedIds = new Set(result.compactedMessageIds)
  const tokensCompacted = state.context.messages
    .filter((m) => compactedIds.has(m.id))
    .reduce((sum, m) => sum + m.tokens, 0)

  // Mark compacted messages in conversation
  const updatedConversation = state.conversation.map((m) =>
    compactedIds.has(m.id)
      ? { ...m, compacted: true, compactedInto: summaryMessage.id }
      : m,
  )

  // Add new summary messages to conversation
  const conversationWithSummaries = [
    ...updatedConversation,
    ...newSummaries.map((s) => {
      const remappedId = summaryIdMap.get(s.id) ?? s.id
      return { ...s, id: remappedId }
    }),
  ]

  // Build new context with remapped summary IDs
  const newContext: ContextState = {
    messages: result.newContext.messages.map((m) => {
      const remappedId = summaryIdMap.get(m.id)
      return remappedId ? { ...m, id: remappedId } : m
    }),
    totalTokens: result.newContext.totalTokens,
  }

  return {
    ...state,
    conversation: conversationWithSummaries,
    context: newContext,
    summaryCounter,
    compactionEvent: true,
    tokensCompacted,
    summaryTokens: summaryMessage.tokens,
    pendingStoreEntries: result.externalStoreEntries ?? [],
    compressedTokens: state.compressedTokens + tokensCompacted,
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage 4: updateExternalStore
// ---------------------------------------------------------------------------

/**
 * When compaction fires and the strategy provided external store entries,
 * add them to the store. This is a no-op for strategies that don't use
 * external storage (Strategy 1, 2) or when no compaction occurred.
 */
export function updateExternalStore(state: StepState): StepState {
  if (state.pendingStoreEntries.length === 0) return state

  const newEntries: ExternalStoreEntry[] = state.pendingStoreEntries.map(
    (input, i) => ({
      id: `ext-${state.externalStore.entries.length + 1 + i}`,
      originalMessageIds: input.originalMessageIds,
      tokens: input.tokens,
      level: input.level,
    }),
  )

  const addedTokens = newEntries.reduce((sum, e) => sum + e.tokens, 0)

  return {
    ...state,
    externalStore: {
      entries: [...state.externalStore.entries, ...newEntries],
      totalTokens: state.externalStore.totalTokens + addedTokens,
    },
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage 5: calculateCache
// ---------------------------------------------------------------------------

export function calculateCache(
  state: StepState,
  message: Message,
  config: SimulationConfig,
): StepState {
  if (!isLlmCallStep(message)) {
    return state
  }

  const cache = prefixCacheModel.calculate(
    state.previousContext,
    state.context,
    config,
  )

  return {
    ...state,
    cache,
    previousContext: state.context,
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage 6: rollRetrieval
// ---------------------------------------------------------------------------

/**
 * Roll the dice for a retrieval event. If the external store is empty or the
 * roll fails, this is a no-op. When retrieval fires, the cost is added to
 * the step cost in calculateCost.
 */
export function rollRetrieval(
  state: StepState,
  message: Message,
  config: SimulationConfig,
): StepState {
  // Only roll on LLM call steps when there's something in the store
  if (!isLlmCallStep(message) || state.externalStore.entries.length === 0) {
    return state
  }

  const p = retrievalProbability(state.compressedTokens, config)
  const roll = state.rng()
  if (roll >= p) return state

  return { ...state, retrievalEvent: true }
}

// ---------------------------------------------------------------------------
// Pipeline stage 7: calculateCost
// ---------------------------------------------------------------------------

export function calculateCost(
  state: StepState,
  message: Message,
  config: SimulationConfig,
): StepState {
  let stepCost = ZERO_COST

  if (isLlmCallStep(message)) {
    const outputTokens = getOutputTokens(message)
    stepCost = defaultCostCalculator.calculate(
      state.cache,
      outputTokens,
      { fired: false, tokensCompacted: 0, summaryTokens: 0 },
      config,
    )
  }

  // Compaction cost is independent of LLM call — always add when compaction fires
  if (state.compactionEvent) {
    const compactionCost = defaultCostCalculator.calculateCompactionCost(
      state.tokensCompacted,
      state.summaryTokens,
      config,
    )
    stepCost = addCosts(stepCost, compactionCost)
  }

  // Retrieval cost when a retrieval event fired
  if (state.retrievalEvent) {
    stepCost = addCosts(stepCost, retrievalCost(config))
  }

  return {
    ...state,
    stepCost,
    cumulativeCost: addCosts(state.cumulativeCost, stepCost),
    peakContextSize: Math.max(state.peakContextSize, state.context.totalTokens),
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage 8: buildSnapshot
// ---------------------------------------------------------------------------

export function buildSnapshot(
  state: StepState,
  message: Message,
  stepIndex: number,
): SimulationSnapshot {
  return {
    stepIndex,
    message,
    conversation: [...state.conversation],
    context: state.context,
    cache: state.cache,
    cost: state.stepCost,
    cumulativeCost: { ...state.cumulativeCost },
    compactionEvent: state.compactionEvent,
    externalStore: state.externalStore,
    retrievalEvent: state.retrievalEvent,
  }
}

// ---------------------------------------------------------------------------
// Main simulation runner
// ---------------------------------------------------------------------------

export const runSimulation = (
  config: SimulationConfig,
): Effect.Effect<SimulationResult> =>
  Effect.flatMap(generateConversation(config), (allMessages) =>
    Effect.sync(() => {
      const snapshots: SimulationSnapshot[] = []
      let totalTokensGenerated = 0

      let state: StepState = {
        conversation: [],
        context: { messages: [], totalTokens: 0 },
        previousContext: null,
        externalStore: EMPTY_EXTERNAL_STORE,
        compressedTokens: 0,
        summaryCounter: 0,
        cumulativeCost: ZERO_COST,
        peakContextSize: 0,
        rng: createRng(42),
        // Per-step transient (reset in ingestMessage)
        compactionEvent: false,
        retrievalEvent: false,
        tokensCompacted: 0,
        summaryTokens: 0,
        pendingStoreEntries: [],
        cache: ZERO_CACHE,
        stepCost: ZERO_COST,
      }

      for (let i = 0; i < allMessages.length; i++) {
        state = ingestMessage(state, allMessages[i], config)

        // The processed message (with tool compression applied) is the last in conversation
        const message = state.conversation[state.conversation.length - 1]

        state = buildContext(state)
        state = evaluateCompaction(state, config)
        state = updateExternalStore(state)
        state = calculateCache(state, message, config)
        state = rollRetrieval(state, message, config)
        state = calculateCost(state, message, config)

        totalTokensGenerated += message.tokens

        snapshots.push(buildSnapshot(state, message, i))
      }

      // Calculate average cache hit rate across LLM call steps
      const llmSteps = snapshots.filter((s) => isLlmCallStep(s.message))
      const averageCacheHitRate =
        llmSteps.length > 0
          ? llmSteps.reduce((sum, s) => sum + s.cache.hitRate, 0) /
            llmSteps.length
          : 0

      return {
        config,
        snapshots,
        summary: {
          totalCost: state.cumulativeCost.total,
          totalTokensGenerated,
          compactionEvents: snapshots.filter((s) => s.compactionEvent).length,
          averageCacheHitRate,
          peakContextSize: state.peakContextSize,
        },
      }
    }),
  )
