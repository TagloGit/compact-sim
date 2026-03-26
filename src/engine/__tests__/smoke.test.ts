import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'

describe('smoke test', () => {
  it('should pass a trivial assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('should run a trivial Effect', () => {
    const result = Effect.runSync(Effect.succeed('hello'))
    expect(result).toBe('hello')
  })
})
