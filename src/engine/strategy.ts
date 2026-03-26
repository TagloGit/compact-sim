import { Context } from 'effect'
import type { ContextState, Message, SimulationConfig, StrategyType } from './types'

export interface CompactionResult {
  readonly shouldCompact: boolean
  readonly newContext?: ContextState
  readonly compactedMessageIds?: readonly string[]
  readonly summaryMessage?: Message
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
 * Strategy registry — returns the compaction strategy for a given type.
 */
export function getStrategy(type: StrategyType): CompactionStrategy {
  switch (type) {
    case 'full-compaction':
      return strategy1
    case 'incremental':
      return strategy2
  }
}
