import { Effect } from 'effect'
import type { Message, MessageType, SimulationConfig } from './types'

function makeMessage(index: number, type: MessageType, tokens: number): Message {
  const id = `msg-${String(index).padStart(3, '0')}`
  return { id, type, tokens, compacted: false }
}

/**
 * Generate a conversation message sequence from simulation config.
 *
 * Message order per the spec:
 *   [system] [user] [assistant] [reasoning?] [tool_call] [tool_result]
 *                   [assistant] [reasoning?] [tool_call] [tool_result]
 *                   ...
 *   [user]  ← every userMessageFrequency cycles
 *                   [assistant] [reasoning?] [tool_call] [tool_result]
 *                   ...
 */
export const generateConversation = (
  config: SimulationConfig,
): Effect.Effect<readonly Message[]> =>
  Effect.sync(() => {
    const messages: Message[] = []
    let idx = 0

    const push = (type: MessageType, tokens: number) => {
      messages.push(makeMessage(idx, type, tokens))
      idx++
    }

    // Always starts with system + user
    push('system', config.systemPromptSize)
    push('user', config.userMessageSize)

    for (let cycle = 1; cycle <= config.toolCallCycles; cycle++) {
      // User message at configured frequency (cycle 1 doesn't get one — we already have the initial user message)
      if (cycle > 1 && (cycle - 1) % config.userMessageFrequency === 0) {
        push('user', config.userMessageSize)
      }

      push('assistant', config.assistantMessageSize)

      if (
        config.reasoningOutputSize > 0 &&
        config.reasoningFrequency > 0 &&
        Math.floor(cycle * config.reasoningFrequency) >
          Math.floor((cycle - 1) * config.reasoningFrequency)
      ) {
        push('reasoning', config.reasoningOutputSize)
      }

      push('tool_call', config.toolCallSize)
      push('tool_result', config.toolResultSize)
    }

    return messages
  })
