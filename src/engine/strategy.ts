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
  ) => CompactionResult
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
  evaluate(context, config) {
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
    const summaryTokens = Math.ceil(compactedTokens / config.compressionRatio)

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
  evaluate(context, config) {
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
    const summaryTokens = Math.ceil(
      newContentTokens / config.compressionRatio,
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
      const metaSummaryTokens = Math.ceil(
        totalSummaryTokens / config.compressionRatio,
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
  evaluate(context, config) {
    const result = strategy2.evaluate(context, config)
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
 * Extends 4a with hierarchical storage. Same compaction triggers as Strategy 2.
 * On compaction, original content is stored at level 0. When accumulated
 * summaries exceed `summaryAccumulationThreshold`, summaries are meta-compacted
 * and stored at level 1. Retrieval cost scales with `(level + 1)`.
 */
export const strategy4b: CompactionStrategy = {
  evaluate(context, config) {
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

    // Compact new content into a summary
    const summaryTokens = Math.ceil(
      newContentTokens / config.compressionRatio,
    )
    const newSummary: Message = {
      id: `summary-${Date.now()}`,
      type: 'summary',
      tokens: summaryTokens,
      compacted: false,
    }

    // Store new content at level 0
    const newContentTokensTotal = newContentMessages.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )
    const externalStoreEntries: ExternalStoreInput[] = [
      {
        originalMessageIds: newContentMessages.map((m) => m.id),
        tokens: newContentTokensTotal,
        level: 0,
      },
    ]

    // Gather all existing summaries + new one
    const existingSummaries = nonSystemMessages.filter(
      (m) => m.type === 'summary',
    )
    let allSummaries = [...existingSummaries, newSummary]
    const totalSummaryTokens = allSummaries.reduce(
      (sum, m) => sum + m.tokens,
      0,
    )

    // IDs of compacted messages start with new content
    const compactedIds = newContentMessages.map((m) => m.id)

    // Meta-compaction: if accumulated summaries exceed threshold, store them at level 1
    let primarySummary = newSummary
    if (totalSummaryTokens > config.summaryAccumulationThreshold) {
      const metaSummaryTokens = Math.ceil(
        totalSummaryTokens / config.compressionRatio,
      )
      const metaSummary: Message = {
        id: `summary-meta-${Date.now()}`,
        type: 'summary',
        tokens: metaSummaryTokens,
        compacted: false,
      }

      // Store old summaries at level 1
      const summaryTokensTotal = existingSummaries.reduce(
        (sum, m) => sum + m.tokens,
        0,
      )
      if (summaryTokensTotal > 0) {
        externalStoreEntries.push({
          originalMessageIds: existingSummaries.map((m) => m.id),
          tokens: summaryTokensTotal,
          level: 1,
        })
      }

      compactedIds.push(...existingSummaries.map((m) => m.id))
      allSummaries = [metaSummary]
      primarySummary = metaSummary
    }

    // Build new context: [system] [summaries...]
    const newMessages: Message[] = []
    if (systemMessage) newMessages.push(systemMessage)
    newMessages.push(...allSummaries)

    const newContext: ContextState = {
      messages: newMessages,
      totalTokens: newMessages.reduce((sum, m) => sum + m.tokens, 0),
    }

    return {
      shouldCompact: true,
      newContext,
      compactedMessageIds: compactedIds,
      summaryMessage: primarySummary,
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
  evaluate(context, config) {
    const result = strategy2.evaluate(context, config)
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
  }
}
