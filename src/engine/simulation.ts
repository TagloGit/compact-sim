import { Effect } from 'effect'
import type {
  ContextState,
  Message,
  SimulationConfig,
  SimulationResult,
  SimulationSnapshot,
} from './types'
import { generateConversation } from './conversation'
import { getStrategy } from './strategy'
import { prefixCacheModel, ZERO_CACHE } from './cache'
import { defaultCostCalculator, ZERO_COST, addCosts } from './cost'

/**
 * Determine the output tokens for a step.
 *
 * An LLM call happens when the assistant produces output — on `assistant`
 * and `reasoning` steps. `tool_result`, `tool_call`, `user`, and `system`
 * messages just get appended to context without triggering an LLM call.
 *
 * Output tokens = the message's own token count (the assistant/reasoning
 * tokens that the model generated).
 */
function getOutputTokens(message: Message): number {
  if (message.type === 'assistant' || message.type === 'reasoning') {
    return message.tokens
  }
  return 0
}

/**
 * Returns true if this step triggers an LLM call.
 *
 * LLM calls happen on assistant messages. Reasoning messages are part of
 * the same LLM call as the preceding assistant message (extended thinking),
 * but for cost modelling we treat them as producing output tokens on the
 * same call context.
 *
 * tool_result messages just get appended — no LLM call.
 */
function isLlmCallStep(message: Message): boolean {
  return message.type === 'assistant' || message.type === 'reasoning'
}

export const runSimulation = (
  config: SimulationConfig,
): Effect.Effect<SimulationResult> =>
  Effect.flatMap(generateConversation(config), (allMessages) =>
    Effect.sync(() => {
      const snapshots: SimulationSnapshot[] = []
      const conversation: Message[] = []
      let previousContext: ContextState | null = null
      let cumulativeCost = ZERO_COST
      let compactionEvents = 0
      let peakContextSize = 0
      let totalTokensGenerated = 0
      let summaryCounter = 0

      const strategy = getStrategy(config.selectedStrategy)

      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i]
        conversation.push(message)
        totalTokensGenerated += message.tokens

        // Build current context: all non-compacted messages
        let context: ContextState = buildContext(conversation)

        // Check strategy: does compaction fire?
        let compactionEvent = false
        let tokensCompacted = 0
        let summaryTokens = 0
        let summaryMessage: Message | undefined

        const result = strategy.evaluate(context, config)
        if (result.shouldCompact && result.newContext && result.summaryMessage) {
          compactionEvent = true
          compactionEvents++

          // Generate a deterministic summary ID
          summaryCounter++
          summaryMessage = {
            ...result.summaryMessage,
            id: `summary-${summaryCounter}`,
          }

          // Calculate compaction cost inputs
          tokensCompacted = context.totalTokens - (
            context.messages.find((m) => m.type === 'system')?.tokens ?? 0
          )
          summaryTokens = summaryMessage.tokens

          // Mark compacted messages in conversation
          const compactedIds = new Set(result.compactedMessageIds)
          for (let j = 0; j < conversation.length; j++) {
            if (compactedIds.has(conversation[j].id)) {
              conversation[j] = {
                ...conversation[j],
                compacted: true,
                compactedInto: summaryMessage.id,
              }
            }
          }

          // Add summary to conversation
          conversation.push(summaryMessage)

          // Update context with the new post-compaction state
          const systemMsg = context.messages.find((m) => m.type === 'system')
          context = {
            messages: systemMsg
              ? [systemMsg, summaryMessage]
              : [summaryMessage],
            totalTokens: (systemMsg?.tokens ?? 0) + summaryMessage.tokens,
          }
        }

        if (context.totalTokens > peakContextSize) {
          peakContextSize = context.totalTokens
        }

        // Calculate cache and cost only on LLM call steps
        let cache = ZERO_CACHE
        let stepCost = ZERO_COST

        if (isLlmCallStep(message)) {
          cache = prefixCacheModel.calculate(
            previousContext,
            context,
            config,
          )

          const outputTokens = getOutputTokens(message)
          stepCost = defaultCostCalculator.calculate(
            cache,
            outputTokens,
            { fired: compactionEvent, tokensCompacted, summaryTokens },
            config,
          )

          previousContext = context
        }

        cumulativeCost = addCosts(cumulativeCost, stepCost)

        snapshots.push({
          stepIndex: i,
          message,
          conversation: [...conversation],
          context,
          cache,
          cost: stepCost,
          cumulativeCost: { ...cumulativeCost },
          compactionEvent,
        })
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
          totalCost: cumulativeCost.total,
          totalTokensGenerated,
          compactionEvents,
          averageCacheHitRate,
          peakContextSize,
        },
      }
    }),
  )

function buildContext(conversation: readonly Message[]): ContextState {
  const active = conversation.filter((m) => !m.compacted)
  const totalTokens = active.reduce((sum, m) => sum + m.tokens, 0)
  return { messages: active, totalTokens }
}
