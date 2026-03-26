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
 * Strategy registry — returns the compaction strategy for a given type.
 *
 * Both types currently return strategy1 as a placeholder.
 * Strategy 2 implementation will be added in a follow-up issue.
 */
export function getStrategy(type: StrategyType): CompactionStrategy {
  switch (type) {
    case 'full-compaction':
      return strategy1
    case 'incremental':
      // Placeholder — will be replaced with strategy2 implementation
      return strategy1
  }
}
