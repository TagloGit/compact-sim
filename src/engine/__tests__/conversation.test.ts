import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { generateConversation } from '../conversation'
import { DEFAULT_CONFIG } from '../types'
import type { SimulationConfig, MessageType } from '../types'

function run(config: SimulationConfig) {
  return Effect.runSync(generateConversation(config))
}

describe('generateConversation', () => {
  it('produces the expected number of messages with default config', () => {
    const messages = run(DEFAULT_CONFIG)

    // 1 system + 1 initial user
    // 50 cycles, each: assistant + reasoning + tool_call + tool_result = 4 per cycle
    // User messages: at cycles where (cycle > 1 && cycle % 10 === 1): cycles 11, 21, 31, 41 = 4 extra user messages
    // Total: 2 + (50 * 4) + 4 = 206
    expect(messages.length).toBe(206)
  })

  it('starts with system then user message', () => {
    const messages = run(DEFAULT_CONFIG)
    expect(messages[0].type).toBe('system')
    expect(messages[1].type).toBe('user')
  })

  it('produces correct cycle ordering: assistant, reasoning, tool_call, tool_result', () => {
    const messages = run(DEFAULT_CONFIG)
    // First cycle starts at index 2
    expect(messages[2].type).toBe('assistant')
    expect(messages[3].type).toBe('reasoning')
    expect(messages[4].type).toBe('tool_call')
    expect(messages[5].type).toBe('tool_result')
  })

  it('assigns token sizes matching config values', () => {
    const messages = run(DEFAULT_CONFIG)
    expect(messages[0].tokens).toBe(DEFAULT_CONFIG.systemPromptSize)
    expect(messages[1].tokens).toBe(DEFAULT_CONFIG.userMessageSize)
    expect(messages[2].tokens).toBe(DEFAULT_CONFIG.assistantMessageSize)
    expect(messages[3].tokens).toBe(DEFAULT_CONFIG.reasoningOutputSize)
    expect(messages[4].tokens).toBe(DEFAULT_CONFIG.toolCallSize)
    expect(messages[5].tokens).toBe(DEFAULT_CONFIG.toolResultSize)
  })

  it('inserts user messages at the configured frequency', () => {
    const messages = run(DEFAULT_CONFIG)
    const userMessages = messages.filter((m) => m.type === 'user')
    // Initial user + one at cycles 11, 21, 31, 41 = 5 total
    expect(userMessages.length).toBe(5)
  })

  it('skips reasoning messages when reasoningOutputSize is 0', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      reasoningOutputSize: 0,
    }
    const messages = run(config)
    const reasoning = messages.filter((m) => m.type === 'reasoning')
    expect(reasoning.length).toBe(0)

    // Without reasoning: 2 + (50 * 3) + 4 = 156
    expect(messages.length).toBe(156)
  })

  it('assigns unique IDs to all messages', () => {
    const messages = run(DEFAULT_CONFIG)
    const ids = new Set(messages.map((m) => m.id))
    expect(ids.size).toBe(messages.length)
  })

  it('all messages start with compacted: false', () => {
    const messages = run(DEFAULT_CONFIG)
    expect(messages.every((m) => m.compacted === false)).toBe(true)
  })

  it('handles 1 cycle with no reasoning', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 1,
      reasoningOutputSize: 0,
      userMessageFrequency: 10,
    }
    const messages = run(config)
    // system + user + assistant + tool_call + tool_result = 5
    expect(messages.length).toBe(5)
    const types: MessageType[] = messages.map((m) => m.type)
    expect(types).toEqual(['system', 'user', 'assistant', 'tool_call', 'tool_result'])
  })

  it('inserts user message every cycle when frequency is 1', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      toolCallCycles: 5,
      userMessageFrequency: 1,
    }
    const messages = run(config)
    const userMessages = messages.filter((m) => m.type === 'user')
    // Initial user + every cycle where (cycle > 1 && cycle % 1 === 1) = cycles 2,3,4,5 = 4 extra
    // Total: 1 + 4 = 5
    expect(userMessages.length).toBe(5)
  })
})
