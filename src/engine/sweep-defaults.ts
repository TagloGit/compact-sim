import type { SimulationConfig } from './types'
import { DEFAULT_CONFIG } from './types'
import type { ParamScale, SweepConfig } from './sweep-types'

// --- Parameter metadata ---

export type ParamGroup =
  | 'strategy'
  | 'conversation-shape'
  | 'context-compaction'
  | 'incremental'
  | 'tool-compression'
  | 'lossless-retrieval'
  | 'pricing'

export type ParamKind = 'numeric' | 'strategy' | 'boolean'

interface BaseParamMeta {
  readonly displayName: string
  readonly group: ParamGroup
  readonly isConversationShape: boolean
}

export interface NumericParamMeta extends BaseParamMeta {
  readonly paramKind: 'numeric'
  readonly defaultMin: number
  readonly defaultMax: number
  readonly defaultSteps: number
  readonly defaultScale: ParamScale
}

export interface StrategyParamMeta extends BaseParamMeta {
  readonly paramKind: 'strategy'
}

export interface BooleanParamMeta extends BaseParamMeta {
  readonly paramKind: 'boolean'
}

export type ParamMeta = NumericParamMeta | StrategyParamMeta | BooleanParamMeta

export type ParamMetaRegistry = {
  readonly [K in keyof SimulationConfig]: ParamMeta
}

export const PARAM_META: ParamMetaRegistry = {
  // Strategy selection
  selectedStrategy: {
    paramKind: 'strategy',
    displayName: 'Strategy',
    group: 'strategy',
    isConversationShape: false,
  },

  // Conversation shape
  toolCallCycles: {
    paramKind: 'numeric',
    displayName: 'Tool call cycles',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 20,
    defaultMax: 200,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  toolCallSize: {
    paramKind: 'numeric',
    displayName: 'Tool call size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 50,
    defaultMax: 500,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  toolResultSize: {
    paramKind: 'numeric',
    displayName: 'Tool result size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 500,
    defaultMax: 10_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },
  assistantMessageSize: {
    paramKind: 'numeric',
    displayName: 'Assistant message size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 100,
    defaultMax: 1_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  reasoningOutputSize: {
    paramKind: 'numeric',
    displayName: 'Reasoning output size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 100,
    defaultMax: 2_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  userMessageFrequency: {
    paramKind: 'numeric',
    displayName: 'User message frequency (every N cycles)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 3,
    defaultMax: 20,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  userMessageSize: {
    paramKind: 'numeric',
    displayName: 'User message size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 50,
    defaultMax: 500,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  systemPromptSize: {
    paramKind: 'numeric',
    displayName: 'System prompt size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    defaultMin: 1_000,
    defaultMax: 10_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },

  // Context & compaction
  contextWindow: {
    paramKind: 'numeric',
    displayName: 'Context window (tokens)',
    group: 'context-compaction',
    isConversationShape: false,
    defaultMin: 50_000,
    defaultMax: 200_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  compactionThreshold: {
    paramKind: 'numeric',
    displayName: 'Compaction threshold (%)',
    group: 'context-compaction',
    isConversationShape: false,
    defaultMin: 0.6,
    defaultMax: 0.95,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  compressionRatio: {
    paramKind: 'numeric',
    displayName: 'Compression ratio',
    group: 'context-compaction',
    isConversationShape: false,
    defaultMin: 3,
    defaultMax: 20,
    defaultSteps: 5,
    defaultScale: 'linear',
  },

  // Strategy 2 — Incremental compaction
  incrementalInterval: {
    paramKind: 'numeric',
    displayName: 'Incremental interval (tokens)',
    group: 'incremental',
    isConversationShape: false,
    defaultMin: 10_000,
    defaultMax: 60_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  summaryAccumulationThreshold: {
    paramKind: 'numeric',
    displayName: 'Summary accumulation threshold (tokens)',
    group: 'incremental',
    isConversationShape: false,
    defaultMin: 20_000,
    defaultMax: 100_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },

  // Strategy 3 — Tool result compression
  toolCompressionEnabled: {
    paramKind: 'boolean',
    displayName: 'Tool compression enabled',
    group: 'tool-compression',
    isConversationShape: false,
  },
  toolCompressionRatio: {
    paramKind: 'numeric',
    displayName: 'Tool compression ratio',
    group: 'tool-compression',
    isConversationShape: false,
    defaultMin: 2,
    defaultMax: 10,
    defaultSteps: 5,
    defaultScale: 'linear',
  },

  // Strategy 4 — Lossless with retrieval
  retrievalQueryTokens: {
    paramKind: 'numeric',
    displayName: 'Retrieval query tokens',
    group: 'lossless-retrieval',
    isConversationShape: false,
    defaultMin: 100,
    defaultMax: 1_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  retrievalResponseTokens: {
    paramKind: 'numeric',
    displayName: 'Retrieval response tokens',
    group: 'lossless-retrieval',
    isConversationShape: false,
    defaultMin: 100,
    defaultMax: 1_000,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  pRetrieveMax: {
    paramKind: 'numeric',
    displayName: 'Max retrieval probability',
    group: 'lossless-retrieval',
    isConversationShape: false,
    defaultMin: 0.05,
    defaultMax: 0.5,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  compressedTokensCap: {
    paramKind: 'numeric',
    displayName: 'Compressed tokens cap',
    group: 'lossless-retrieval',
    isConversationShape: false,
    defaultMin: 20_000,
    defaultMax: 200_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },
  lcmGrepRatio: {
    paramKind: 'numeric',
    displayName: 'LCM grep ratio',
    group: 'lossless-retrieval',
    isConversationShape: false,
    defaultMin: 0.3,
    defaultMax: 0.9,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  lcmGrepResponseTokens: {
    paramKind: 'numeric',
    displayName: 'LCM grep response tokens',
    group: 'lossless-retrieval',
    isConversationShape: false,
    defaultMin: 50,
    defaultMax: 500,
    defaultSteps: 5,
    defaultScale: 'linear',
  },

  // Pricing
  baseInputPrice: {
    paramKind: 'numeric',
    displayName: 'Base input price (per token)',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 1.0 / 1_000_000,
    defaultMax: 10.0 / 1_000_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },
  outputPrice: {
    paramKind: 'numeric',
    displayName: 'Output price (per token)',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 5.0 / 1_000_000,
    defaultMax: 50.0 / 1_000_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },
  cacheWriteMultiplier: {
    paramKind: 'numeric',
    displayName: 'Cache write multiplier',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 1.0,
    defaultMax: 2.0,
    defaultSteps: 3,
    defaultScale: 'linear',
  },
  cacheHitMultiplier: {
    paramKind: 'numeric',
    displayName: 'Cache hit multiplier',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 0.05,
    defaultMax: 0.25,
    defaultSteps: 5,
    defaultScale: 'linear',
  },
  minCacheableTokens: {
    paramKind: 'numeric',
    displayName: 'Min cacheable tokens',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 1_024,
    defaultMax: 8_192,
    defaultSteps: 4,
    defaultScale: 'log',
  },
  compactionInputPrice: {
    paramKind: 'numeric',
    displayName: 'Compaction input price (per token)',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 0.40 / 1_000_000,
    defaultMax: 2.0 / 1_000_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },
  compactionOutputPrice: {
    paramKind: 'numeric',
    displayName: 'Compaction output price (per token)',
    group: 'pricing',
    isConversationShape: false,
    defaultMin: 2.0 / 1_000_000,
    defaultMax: 10.0 / 1_000_000,
    defaultSteps: 5,
    defaultScale: 'log',
  },
}

/**
 * Build a default SweepConfig where every parameter is fixed at its DEFAULT_CONFIG value.
 */
export function buildDefaultSweepConfig(): SweepConfig {
  const entries = Object.keys(DEFAULT_CONFIG).map((key) => {
    const k = key as keyof SimulationConfig
    return [k, { kind: 'fixed' as const, value: DEFAULT_CONFIG[k] }]
  })
  return Object.fromEntries(entries) as SweepConfig
}

/**
 * Get the list of conversation-shape parameter keys.
 */
export function getConversationShapeKeys(): (keyof SimulationConfig)[] {
  return (Object.keys(PARAM_META) as (keyof SimulationConfig)[]).filter(
    (k) => PARAM_META[k].isConversationShape,
  )
}
