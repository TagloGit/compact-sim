export type MessageType =
  | 'system'
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'summary'

export type StrategyType = 'full-compaction' | 'incremental'

export interface Message {
  readonly id: string
  readonly type: MessageType
  readonly tokens: number
  readonly compacted: boolean
  readonly compactedInto?: string
}

export interface SimulationConfig {
  // Strategy selection
  readonly selectedStrategy: StrategyType

  // Conversation shape
  readonly toolCallCycles: number
  readonly toolCallSize: number
  readonly toolResultSize: number
  readonly assistantMessageSize: number
  readonly reasoningOutputSize: number
  readonly userMessageFrequency: number
  readonly userMessageSize: number
  readonly systemPromptSize: number

  // Context & compaction
  readonly contextWindow: number
  readonly compactionThreshold: number
  readonly compressionRatio: number

  // Strategy 2 — Incremental compaction
  readonly incrementalInterval: number
  readonly summaryAccumulationThreshold: number

  // Strategy 3 — Tool result compression (orthogonal)
  readonly toolCompressionEnabled: boolean
  readonly toolCompressionRatio: number

  // Pricing (per token, not per million)
  readonly baseInputPrice: number
  readonly outputPrice: number
  readonly cacheWriteMultiplier: number
  readonly cacheHitMultiplier: number
  readonly minCacheableTokens: number
  readonly compactionInputPrice: number
  readonly compactionOutputPrice: number
}

export interface ContextState {
  readonly messages: readonly Message[]
  readonly totalTokens: number
}

export interface CacheState {
  readonly cachedPrefixTokens: number
  readonly cacheHitTokens: number
  readonly cacheWriteTokens: number
  readonly uncachedTokens: number
  readonly hitRate: number
}

export interface StepCost {
  readonly cachedInput: number
  readonly cacheWrite: number
  readonly uncachedInput: number
  readonly output: number
  readonly compactionInput: number
  readonly compactionOutput: number
  readonly total: number
}

export interface ExternalStoreEntry {
  readonly id: string
  readonly originalMessageIds: readonly string[]
  readonly tokens: number
  readonly level: number
}

export interface ExternalStore {
  readonly entries: readonly ExternalStoreEntry[]
  readonly totalTokens: number
}

export const EMPTY_EXTERNAL_STORE: ExternalStore = {
  entries: [],
  totalTokens: 0,
}

export interface SimulationSnapshot {
  readonly stepIndex: number
  readonly message: Message
  readonly conversation: readonly Message[]
  readonly context: ContextState
  readonly cache: CacheState
  readonly cost: StepCost
  readonly cumulativeCost: StepCost
  readonly compactionEvent: boolean
  readonly externalStore: ExternalStore
  readonly retrievalEvent: boolean
}

export interface SimulationResult {
  readonly config: SimulationConfig
  readonly snapshots: readonly SimulationSnapshot[]
  readonly summary: {
    readonly totalCost: number
    readonly totalTokensGenerated: number
    readonly compactionEvents: number
    readonly averageCacheHitRate: number
    readonly peakContextSize: number
  }
}

export const DEFAULT_CONFIG: SimulationConfig = {
  // Strategy selection
  selectedStrategy: 'full-compaction',

  // Conversation shape
  toolCallCycles: 100,
  toolCallSize: 200,
  toolResultSize: 2_000,
  assistantMessageSize: 300,
  reasoningOutputSize: 500,
  userMessageFrequency: 10,
  userMessageSize: 200,
  systemPromptSize: 4_000,

  // Context & compaction
  contextWindow: 200_000,
  compactionThreshold: 0.85,
  compressionRatio: 10,

  // Pricing (per token)
  baseInputPrice: 5.0 / 1_000_000,
  outputPrice: 25.0 / 1_000_000,
  cacheWriteMultiplier: 1.25,
  cacheHitMultiplier: 0.10,
  minCacheableTokens: 4_096,
  compactionInputPrice: 0.80 / 1_000_000,
  compactionOutputPrice: 4.0 / 1_000_000,

  // Strategy 2 — Incremental compaction
  incrementalInterval: 30_000,
  summaryAccumulationThreshold: 50_000,

  // Strategy 3 — Tool result compression
  toolCompressionEnabled: false,
  toolCompressionRatio: 5,
}
