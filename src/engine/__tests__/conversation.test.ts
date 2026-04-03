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
    // 200 cycles, each: assistant + tool_call + tool_result = 3 per cycle
    // Reasoning: floor(200 * 0.47) = 94 cycles get reasoning
    // User messages: at cycles where (cycle > 1 && cycle % 12 === 1): 16 extra user messages
    // Total: 2 + (200 * 3) + 94 + 16 = 712
    expect(messages.length).toBe(712)
  })

  it('starts with system then user message', () => {
    const messages = run(DEFAULT_CONFIG)
    expect(messages[0].type).toBe('system')
    expect(messages[1].type).toBe('user')
  })

  it('produces correct cycle ordering: assistant, reasoning, tool_call, tool_result', () => {
    const config = { ...DEFAULT_CONFIG, reasoningFrequency: 1.0 }
    const messages = run(config)
    // First cycle starts at index 2
    expect(messages[2].type).toBe('assistant')
    expect(messages[3].type).toBe('reasoning')
    expect(messages[4].type).toBe('tool_call')
    expect(messages[5].type).toBe('tool_result')
  })

  it('assigns token sizes matching config values', () => {
    const config = { ...DEFAULT_CONFIG, reasoningFrequency: 1.0 }
    const messages = run(config)
    expect(messages[0].tokens).toBe(config.systemPromptSize)
    expect(messages[1].tokens).toBe(config.userMessageSize)
    expect(messages[2].tokens).toBe(config.assistantMessageSize)
    expect(messages[3].tokens).toBe(config.reasoningOutputSize)
    expect(messages[4].tokens).toBe(config.toolCallSize)
    expect(messages[5].tokens).toBe(config.toolResultSize)
  })

  it('inserts user messages at the configured frequency', () => {
    const messages = run(DEFAULT_CONFIG)
    const userMessages = messages.filter((m) => m.type === 'user')
    // Initial user + one at cycles 13, 25, 37, ... (every 12 cycles) = 17 total
    expect(userMessages.length).toBe(17)
  })

  it('skips reasoning messages when reasoningOutputSize is 0', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      reasoningOutputSize: 0,
    }
    const messages = run(config)
    const reasoning = messages.filter((m) => m.type === 'reasoning')
    expect(reasoning.length).toBe(0)

    // Without reasoning: 2 + (200 * 3) + 16 = 618
    expect(messages.length).toBe(618)
  })

  it('skips reasoning messages when reasoningFrequency is 0', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      reasoningFrequency: 0,
    }
    const messages = run(config)
    const reasoning = messages.filter((m) => m.type === 'reasoning')
    expect(reasoning.length).toBe(0)
  })

  it('includes reasoning on every cycle when reasoningFrequency is 1', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      reasoningFrequency: 1.0,
      toolCallCycles: 10,
    }
    const messages = run(config)
    const reasoning = messages.filter((m) => m.type === 'reasoning')
    expect(reasoning.length).toBe(10)
  })

  it('distributes reasoning evenly based on reasoningFrequency', () => {
    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      reasoningFrequency: 0.47,
      toolCallCycles: 200,
    }
    const messages = run(config)
    const reasoning = messages.filter((m) => m.type === 'reasoning')
    // floor(200 * 0.47) = 94
    expect(reasoning.length).toBe(94)
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
