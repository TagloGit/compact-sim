import { Context } from 'effect'
import type { ContextState, Message, SimulationConfig, StrategyType } from './types'

export interface ExternalStoreInput {
  readonly originalMessageIds: readonly string[]
  readonly tokens: number
  readonly level: number
}

export interface CompactionResult {
  readonly shouldCompact: boolean
  readonly newContext?: ContextState
  readonly compactedMessageIds?: readonly string[]
  readonly summaryMessage?: Message
  readonly externalStoreEntries?: readonly ExternalStoreInput[]
  /** When set, only this many tokens count toward retrieval probability (instead of all compacted tokens). */
  readonly retrievalCompressedTokens?: number
}

export interface CompactionStrategy {
  readonly evaluate: (
    context: ContextState,
    config: SimulationConfig,
    compressedTokens?: number,
  ) => CompactionResult
}

/**
 * Apply summary growth floor based on the configured growth model.
 *
 * - 'fixed': no change (returns computedTokens as-is)
 * - 'logarithmic': floor = coefficient × ln(1 + totalCompressedTokens / 1000)
 *
 * The floor ensures summaries grow sublinearly with total compressed content,
 * preventing convergence to a fixed ceiling in long sessions.
 */
export function applySummaryFloor(
  computedTokens: number,
  totalCompressedTokens: number,
  config: SimulationConfig,
): number {
  if (config.summaryGrowthModel === 'fixed') return computedTokens
  const floor = config.summaryGrowthCoefficient * Math.log(1 + totalCompressedTokens / 1000)
  return Math.max(computedTokens, Math.ceil(floor))
}

export class Strategy extends Context.Tag('Strategy')<
  Strategy,
  CompactionStrategy
>() {}

/**
 * Strategy 1 — Full compaction at threshold.
 *
 * When context exceeds `compactionThreshold * contextWindow`, all messages
 * except the system prompt are replaced with a single summary message.
 * Summary size = compacted tokens / compression ratio.
 */
export const strategy1: CompactionStrategy = {
  evaluate(context, config, compressedTokens = 0) {
    const threshold = config.compactionThreshold * config.contextWindow
    if (context.totalTokens <= threshold) {
      return { shouldCompact: false }
    }

    const systemMessage = context.messages.find((m) => m.type === 'system')
    const nonSystemMessages = context.messages.filter(
      (m) => m.type !== 'system',
    )

    const compactedTokens = nonSystemMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )
    const summaryTokens = applySummaryFloor(
      Math.ceil(compactedTokens / config.compressionRatio),
      compressedTokens + compactedTokens,
      config,
    )

    const summaryMessage: Message = {
      id: `summary-${Date.now()}`,
      type: 'summary',
      tokens: summaryTokens,
      compacted: false,
    }

    const newMessages: Message[] = systemMessage
      ? [systemMessage, summaryMessage]
      : [summaryMessage]

    const newContext: ContextState = {
      messages: newMessages,
      totalTokens: newMessages.reduce((sum, m) => sum + m.tokens, 0),
    }

    return {
      shouldCompact: true,
      newContext,
      compactedMessageIds: nonSystemMessages.map((m) => m.id),
      summaryMessage,
    }
  },
}

/**
 * Strategy 2 — Incremental compaction at intervals.
 *
 * Tracks new content since the last summary message (or system prompt).
 * When new content exceeds `incrementalInterval`, only the new content
 * is compacted into a summary that is appended to the summaries section.
 *
 * When accumulated summary tokens exceed `summaryAccumulationThreshold`,
 * all summaries are re-compacted into one ("meta-compaction").
 *
 * Context shape: [system] [summary_1] ... [summary_N] [recent raw content]
 */
export const strategy2: CompactionStrategy = {
  evaluate(context, config, compressedTokens = 0) {
    const systemMessage = context.messages.find((m) => m.type === 'system')
    const nonSystemMessages = context.messages.filter(
      (m) => m.type !== 'system',
    )

    // Find the last summary message — everything after it is "new content"
    let lastSummaryIndex = -1
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      if (nonSystemMessages[i].type === 'summary') {
        lastSummaryIndex = i
        break
      }
    }

    const newContentMessages = nonSystemMessages.slice(lastSummaryIndex + 1)
    const newContentTokens = newContentMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )

    const threshold = config.compactionThreshold * config.contextWindow
    const thresholdExceeded = context.totalTokens > threshold

    if (newContentTokens <= config.incrementalInterval && !thresholdExceeded) {
      return { shouldCompact: false }
    }

    // Compact new content into a summary
    const summaryTokens = applySummaryFloor(
      Math.ceil(newContentTokens / config.compressionRatio),
      compressedTokens + newContentTokens,
      config,
    )
    const newSummary: Message = {
      id: `summary-${Date.now()}`,
      type: 'summary',
      tokens: summaryTokens,
      compacted: false,
    }

    // Gather all existing summaries + new one
    const existingSummaries = nonSystemMessages.filter(
      (m) => m.type === 'summary',
    )
    let allSummaries = [...existingSummaries, newSummary]
    const totalSummaryTokens = allSummaries.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )

    // Meta-compaction: if accumulated summaries exceed threshold, re-compact
    let metaCompactionSummary: Message | undefined
    if (totalSummaryTokens > config.summaryAccumulationThreshold) {
      const metaSummaryTokens = applySummaryFloor(
        Math.ceil(totalSummaryTokens / config.compressionRatio),
        compressedTokens + newContentTokens,
        config,
      )
      metaCompactionSummary = {
        id: `summary-meta-${Date.now()}`,
        type: 'summary',
        tokens: metaSummaryTokens,
        compacted: false,
      }
      allSummaries = [metaCompactionSummary]
    }

    // Build new context: [system] [summaries...] (no recent content — it was compacted)
    const newMessages: Message[] = []
    if (systemMessage) newMessages.push(systemMessage)
    newMessages.push(...allSummaries)

    const newContext: ContextState = {
      messages: newMessages,
      totalTokens: newMessages.reduce((sum, m) => sum + m.tokens, 0),
    }

    // IDs of compacted messages: the new content messages + any meta-compacted summaries
    const compactedIds = newContentMessages.map((m) => m.id)
    if (metaCompactionSummary) {
      compactedIds.push(...existingSummaries.map((m) => m.id))
    }

    return {
      shouldCompact: true,
      newContext,
      compactedMessageIds: compactedIds,
      summaryMessage: metaCompactionSummary ?? newSummary,
    }
  },
}

/**
 * Strategy 4a — Lossless append-only compaction.
 *
 * Same compaction triggers and scope as Strategy 2 (incremental interval +
 * main threshold, compact only new content since last summary). On compaction,
 * original content is stored in the external store before being replaced by
 * a summary, enabling later retrieval.
 */
export const strategy4a: CompactionStrategy = {
  evaluate(context, config, compressedTokens = 0) {
    const result = strategy2.evaluate(context, config, compressedTokens)
    if (!result.shouldCompact || !result.compactedMessageIds) {
      return result
    }

    // Build external store entries from the compacted messages
    const compactedIds = new Set(result.compactedMessageIds)
    const compactedMessages = context.messages.filter((m) =>
      compactedIds.has(m.id),
    )
    const tokens = compactedMessages.reduce((sum, m) => sum + m.tokens, 0)

    const externalStoreEntries: ExternalStoreInput[] = [
      {
        originalMessageIds: result.compactedMessageIds,
        tokens,
        level: 0,
      },
    ]

    return { ...result, externalStoreEntries }
  },
}

/**
 * Strategy 4b — Lossless hierarchical compaction.
 *
 * Same triggers as Strategy 2 (incremental interval on new content + main
 * threshold), but every compaction replaces ALL non-system content with a
 * single summary. The previous summary + new content are stored in the
 * external store at an increasing level each time.
 *
 * Context is always: [system] [single_summary]
 *
 * Store hierarchy:
 * - First compaction:  raw content → store level 0, context = [system] [sum0]
 * - Second compaction: sum0 + new → store level 1, context = [system] [sum1]
 * - Third compaction:  sum1 + new → store level 2, context = [system] [sum2]
 *
 * Retrieving deep content requires traversing the chain:
 *   sum2 → sum1 → sum0 → original. Cost scales by (level + 1).
 */
export const strategy4b: CompactionStrategy = {
  evaluate(context, config, compressedTokens = 0) {
    const systemMessage = context.messages.find((m) => m.type === 'system')
    const nonSystemMessages = context.messages.filter(
      (m) => m.type !== 'system',
    )

    // Find the last summary — everything after it is "new content"
    let lastSummaryIndex = -1
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      if (nonSystemMessages[i].type === 'summary') {
        lastSummaryIndex = i
        break
      }
    }

    const newContentMessages = nonSystemMessages.slice(lastSummaryIndex + 1)
    const newContentTokens = newContentMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )

    const threshold = config.compactionThreshold * config.contextWindow
    const thresholdExceeded = context.totalTokens > threshold

    if (newContentTokens <= config.incrementalInterval && !thresholdExceeded) {
      return { shouldCompact: false }
    }

    // Compact ALL non-system content (including previous summaries) into one summary
    const allNonSystemTokens = nonSystemMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )
    const summaryTokens = applySummaryFloor(
      Math.ceil(allNonSystemTokens / config.compressionRatio),
      compressedTokens + allNonSystemTokens,
      config,
    )
    const summaryMessage: Message = {
      id: `summary-${Date.now()}`,
      type: 'summary',
      tokens: summaryTokens,
      compacted: false,
    }

    // Store all compacted content as one entry.
    // Level is set to 0 here — the pipeline's updateExternalStore assigns the
    // correct hierarchical level based on the current store depth.
    const externalStoreEntries: ExternalStoreInput[] = [
      {
        originalMessageIds: nonSystemMessages.map((m) => m.id),
        tokens: allNonSystemTokens,
        level: 0,
      },
    ]

    // Build new context: [system] [single_summary]
    const newMessages: Message[] = []
    if (systemMessage) newMessages.push(systemMessage)
    newMessages.push(summaryMessage)

    const newContext: ContextState = {
      messages: newMessages,
      totalTokens: newMessages.reduce((sum, m) => sum + m.tokens, 0),
    }

    return {
      shouldCompact: true,
      newContext,
      compactedMessageIds: nonSystemMessages.map((m) => m.id),
      summaryMessage,
      externalStoreEntries,
    }
  },
}

/**
 * Strategy 4c — Tool-results-only lossless compaction.
 *
 * Hybrid approach: general conversation is compacted using Strategy 2 logic
 * (lossy, no external storage), but tool_result messages are stored externally
 * before compaction. Retrieval probability is based only on the tool_result
 * tokens that were compressed, not all compressed tokens.
 */
export const strategy4c: CompactionStrategy = {
  evaluate(context, config, compressedTokens = 0) {
    const result = strategy2.evaluate(context, config, compressedTokens)
    if (!result.shouldCompact || !result.compactedMessageIds) {
      return result
    }

    // Find tool_result messages among those being compacted
    const compactedIds = new Set(result.compactedMessageIds)
    const compactedToolResults = context.messages.filter(
      (m) => compactedIds.has(m.id) && m.type === 'tool_result',
    )

    // Only tool_result messages go to external store
    if (compactedToolResults.length === 0) {
      return { ...result, retrievalCompressedTokens: 0 }
    }

    const toolResultTokens = compactedToolResults.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )

    const externalStoreEntries: ExternalStoreInput[] = [
      {
        originalMessageIds: compactedToolResults.map((m) => m.id),
        tokens: toolResultTokens,
        level: 0,
      },
    ]

    return {
      ...result,
      externalStoreEntries,
      retrievalCompressedTokens: toolResultTokens,
    }
  },
}

/**
 * Strategy 4d — LCM sub-agent retrieval.
 *
 * Same triggers as Strategy 2 (incremental interval + main threshold), but
 * every compaction replaces ALL non-system, non-summary content with a single
 * summary — more aggressive than 4a. All compacted content goes to external
 * store for later retrieval via dual tools (lcm_grep / lcm_expand).
 *
 * Context after compaction: [system] [single_summary]
 *
 * Retrieval cost is handled differently from other 4x strategies — see
 * the `lcmSubagentRetrievalCost` function in retrieval.ts.
 */
export const strategy4d: CompactionStrategy = {
  evaluate(context, config, compressedTokens = 0) {
    const systemMessage = context.messages.find((m) => m.type === 'system')
    const nonSystemMessages = context.messages.filter(
      (m) => m.type !== 'system',
    )

    // Find the last summary — everything after it is "new content"
    let lastSummaryIndex = -1
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      if (nonSystemMessages[i].type === 'summary') {
        lastSummaryIndex = i
        break
      }
    }

    const newContentMessages = nonSystemMessages.slice(lastSummaryIndex + 1)
    const newContentTokens = newContentMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )

    const threshold = config.compactionThreshold * config.contextWindow
    const thresholdExceeded = context.totalTokens > threshold

    if (newContentTokens <= config.incrementalInterval && !thresholdExceeded) {
      return { shouldCompact: false }
    }

    // Compact ALL non-system content (including previous summaries) into one summary
    const allNonSystemTokens = nonSystemMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )
    const summaryTokens = applySummaryFloor(
      Math.ceil(allNonSystemTokens / config.compressionRatio),
      compressedTokens + allNonSystemTokens,
      config,
    )
    const summaryMessage: Message = {
      id: `summary-${Date.now()}`,
      type: 'summary',
      tokens: summaryTokens,
      compacted: false,
    }

    // Store all compacted content in external store
    const externalStoreEntries: ExternalStoreInput[] = [
      {
        originalMessageIds: nonSystemMessages.map((m) => m.id),
        tokens: allNonSystemTokens,
        level: 0,
      },
    ]

    // Build new context: [system] [single_summary]
    const newMessages: Message[] = []
    if (systemMessage) newMessages.push(systemMessage)
    newMessages.push(summaryMessage)

    const newContext: ContextState = {
      messages: newMessages,
      totalTokens: newMessages.reduce((sum, m) => sum + m.tokens, 0),
    }

    return {
      shouldCompact: true,
      newContext,
      compactedMessageIds: nonSystemMessages.map((m) => m.id),
      summaryMessage,
      externalStoreEntries,
    }
  },
}

/**
 * Strategy registry — returns the compaction strategy for a given type.
 */
export function getStrategy(type: StrategyType): CompactionStrategy {
  switch (type) {
    case 'full-compaction':
      return strategy1
    case 'incremental':
      return strategy2
    case 'lossless-append':
      return strategy4a
    case 'lossless-hierarchical':
      return strategy4b
    case 'lossless-tool-results':
      return strategy4c
    case 'lcm-subagent':
      return strategy4d
  }
}
