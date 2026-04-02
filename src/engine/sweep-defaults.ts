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

export type ParamKind = 'numeric' | 'strategy' | 'boolean' | 'enum'

interface BaseParamMeta {
  readonly displayName: string
  readonly group: ParamGroup
  readonly isConversationShape: boolean
}

export interface NumericParamMeta extends BaseParamMeta {
  readonly paramKind: 'numeric'
  // UI bounds (in display units — after displayMultiplier applied)
  readonly uiMin: number
  readonly uiMax: number
  readonly uiStep: number
  // Config value × displayMultiplier = display value (default 1)
  readonly displayMultiplier: number
  // Default sweep range (in config units, not display units)
  readonly defaultSweepMin: number
  readonly defaultSweepMax: number
  readonly defaultSweepSteps: number
  readonly defaultSweepScale: ParamScale
}

export interface StrategyParamMeta extends BaseParamMeta {
  readonly paramKind: 'strategy'
}

export interface BooleanParamMeta extends BaseParamMeta {
  readonly paramKind: 'boolean'
}

export interface EnumParamMeta extends BaseParamMeta {
  readonly paramKind: 'enum'
  readonly options: readonly { readonly value: string; readonly label: string }[]
}

export type ParamMeta = NumericParamMeta | StrategyParamMeta | BooleanParamMeta | EnumParamMeta

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
    uiMin: 1,
    uiMax: 500,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 20,
    defaultSweepMax: 200,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  toolCallSize: {
    paramKind: 'numeric',
    displayName: 'Tool call size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 10,
    uiMax: 2_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 50,
    defaultSweepMax: 500,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  toolResultSize: {
    paramKind: 'numeric',
    displayName: 'Tool result size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 100,
    uiMax: 50_000,
    uiStep: 100,
    displayMultiplier: 1,
    defaultSweepMin: 500,
    defaultSweepMax: 10_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
  },
  assistantMessageSize: {
    paramKind: 'numeric',
    displayName: 'Assistant message size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 10,
    uiMax: 5_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 100,
    defaultSweepMax: 1_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  reasoningOutputSize: {
    paramKind: 'numeric',
    displayName: 'Reasoning output size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 0,
    uiMax: 10_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 100,
    defaultSweepMax: 2_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  userMessageFrequency: {
    paramKind: 'numeric',
    displayName: 'User msg frequency (every N cycles)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 1,
    uiMax: 100,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 3,
    defaultSweepMax: 20,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  userMessageSize: {
    paramKind: 'numeric',
    displayName: 'User message size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 10,
    uiMax: 5_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 50,
    defaultSweepMax: 500,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  systemPromptSize: {
    paramKind: 'numeric',
    displayName: 'System prompt size (tokens)',
    group: 'conversation-shape',
    isConversationShape: true,
    uiMin: 100,
    uiMax: 50_000,
    uiStep: 100,
    displayMultiplier: 1,
    defaultSweepMin: 1_000,
    defaultSweepMax: 10_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
  },

  // Context & compaction
  contextWindow: {
    paramKind: 'numeric',
    displayName: 'Context window (tokens)',
    group: 'context-compaction',
    isConversationShape: false,
    uiMin: 10_000,
    uiMax: 2_000_000,
    uiStep: 10_000,
    displayMultiplier: 1,
    defaultSweepMin: 50_000,
    defaultSweepMax: 200_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  compactionThreshold: {
    paramKind: 'numeric',
    displayName: 'Compaction threshold (%)',
    group: 'context-compaction',
    isConversationShape: false,
    uiMin: 50,
    uiMax: 99,
    uiStep: 1,
    displayMultiplier: 100,
    defaultSweepMin: 0.6,
    defaultSweepMax: 0.95,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  compressionRatio: {
    paramKind: 'numeric',
    displayName: 'Compression ratio (X:1)',
    group: 'context-compaction',
    isConversationShape: false,
    uiMin: 1.1,
    uiMax: 50,
    uiStep: 0.1,
    displayMultiplier: 1,
    defaultSweepMin: 3,
    defaultSweepMax: 20,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },

  // Cache reliability
  cacheReliability: {
    paramKind: 'numeric',
    displayName: 'Cache reliability',
    group: 'context-compaction',
    isConversationShape: false,
    uiMin: 0,
    uiMax: 1,
    uiStep: 0.01,
    displayMultiplier: 1,
    defaultSweepMin: 0.5,
    defaultSweepMax: 1.0,
    defaultSweepSteps: 6,
    defaultSweepScale: 'linear',
  },

  // Summary growth
  summaryGrowthModel: {
    paramKind: 'enum',
    displayName: 'Summary growth model',
    group: 'context-compaction',
    isConversationShape: false,
    options: [
      { value: 'fixed', label: 'Fixed (convergence)' },
      { value: 'logarithmic', label: 'Logarithmic (growing)' },
    ],
  },
  summaryGrowthCoefficient: {
    paramKind: 'numeric',
    displayName: 'Summary growth coefficient',
    group: 'context-compaction',
    isConversationShape: false,
    uiMin: 100,
    uiMax: 5000,
    uiStep: 100,
    displayMultiplier: 1,
    defaultSweepMin: 200,
    defaultSweepMax: 3000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },

  // Strategy 2 — Incremental compaction
  incrementalInterval: {
    paramKind: 'numeric',
    displayName: 'Incremental interval (tokens)',
    group: 'incremental',
    isConversationShape: false,
    uiMin: 5_000,
    uiMax: 100_000,
    uiStep: 1_000,
    displayMultiplier: 1,
    defaultSweepMin: 10_000,
    defaultSweepMax: 60_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  summaryAccumulationThreshold: {
    paramKind: 'numeric',
    displayName: 'Summary accumulation threshold (tokens)',
    group: 'incremental',
    isConversationShape: false,
    uiMin: 10_000,
    uiMax: 200_000,
    uiStep: 5_000,
    displayMultiplier: 1,
    defaultSweepMin: 20_000,
    defaultSweepMax: 100_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },

  // Strategy 3 — Tool result compression
  toolCompressionEnabled: {
    paramKind: 'boolean',
    displayName: 'Tool result compression',
    group: 'tool-compression',
    isConversationShape: false,
  },
  toolCompressionRatio: {
    paramKind: 'numeric',
    displayName: 'Tool compression ratio (X:1)',
    group: 'tool-compression',
    isConversationShape: false,
    uiMin: 2,
    uiMax: 20,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 2,
    defaultSweepMax: 10,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },

  // Strategy 4 — Lossless with retrieval
  retrievalQueryTokens: {
    paramKind: 'numeric',
    displayName: 'Retrieval query tokens',
    group: 'lossless-retrieval',
    isConversationShape: false,
    uiMin: 100,
    uiMax: 5_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 100,
    defaultSweepMax: 1_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  retrievalResponseTokens: {
    paramKind: 'numeric',
    displayName: 'Retrieval response tokens',
    group: 'lossless-retrieval',
    isConversationShape: false,
    uiMin: 100,
    uiMax: 5_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 100,
    defaultSweepMax: 1_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  pRetrieveMax: {
    paramKind: 'numeric',
    displayName: 'pRetrieve max',
    group: 'lossless-retrieval',
    isConversationShape: false,
    uiMin: 0,
    uiMax: 1,
    uiStep: 0.01,
    displayMultiplier: 1,
    defaultSweepMin: 0.05,
    defaultSweepMax: 0.5,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  compressedTokensCap: {
    paramKind: 'numeric',
    displayName: 'Compressed tokens cap',
    group: 'lossless-retrieval',
    isConversationShape: false,
    uiMin: 10_000,
    uiMax: 500_000,
    uiStep: 10_000,
    displayMultiplier: 1,
    defaultSweepMin: 20_000,
    defaultSweepMax: 200_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
  },
  lcmGrepRatio: {
    paramKind: 'numeric',
    displayName: 'LCM grep ratio',
    group: 'lossless-retrieval',
    isConversationShape: false,
    uiMin: 0,
    uiMax: 1,
    uiStep: 0.01,
    displayMultiplier: 1,
    defaultSweepMin: 0.3,
    defaultSweepMax: 0.9,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  lcmGrepResponseTokens: {
    paramKind: 'numeric',
    displayName: 'LCM grep response tokens',
    group: 'lossless-retrieval',
    isConversationShape: false,
    uiMin: 10,
    uiMax: 2_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 50,
    defaultSweepMax: 500,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },

  // Pricing (config stores per-token; UI displays $/M via displayMultiplier)
  baseInputPrice: {
    paramKind: 'numeric',
    displayName: 'Base input price ($/M)',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 0.01,
    uiMax: 100,
    uiStep: 0.01,
    displayMultiplier: 1_000_000,
    defaultSweepMin: 1.0 / 1_000_000,
    defaultSweepMax: 10.0 / 1_000_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
  },
  outputPrice: {
    paramKind: 'numeric',
    displayName: 'Output price ($/M)',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 0.01,
    uiMax: 200,
    uiStep: 0.01,
    displayMultiplier: 1_000_000,
    defaultSweepMin: 5.0 / 1_000_000,
    defaultSweepMax: 50.0 / 1_000_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
  },
  cacheWriteMultiplier: {
    paramKind: 'numeric',
    displayName: 'Cache write multiplier',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 1.0,
    uiMax: 5.0,
    uiStep: 0.01,
    displayMultiplier: 1,
    defaultSweepMin: 1.0,
    defaultSweepMax: 2.0,
    defaultSweepSteps: 3,
    defaultSweepScale: 'linear',
  },
  cacheHitMultiplier: {
    paramKind: 'numeric',
    displayName: 'Cache hit multiplier',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 0.01,
    uiMax: 1.0,
    uiStep: 0.01,
    displayMultiplier: 1,
    defaultSweepMin: 0.05,
    defaultSweepMax: 0.25,
    defaultSweepSteps: 5,
    defaultSweepScale: 'linear',
  },
  minCacheableTokens: {
    paramKind: 'numeric',
    displayName: 'Min cacheable tokens',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 0,
    uiMax: 50_000,
    uiStep: 1,
    displayMultiplier: 1,
    defaultSweepMin: 1_024,
    defaultSweepMax: 8_192,
    defaultSweepSteps: 4,
    defaultSweepScale: 'log',
  },
  compactionInputPrice: {
    paramKind: 'numeric',
    displayName: 'Compaction input price ($/M)',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 0.01,
    uiMax: 50,
    uiStep: 0.01,
    displayMultiplier: 1_000_000,
    defaultSweepMin: 0.40 / 1_000_000,
    defaultSweepMax: 2.0 / 1_000_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
  },
  compactionOutputPrice: {
    paramKind: 'numeric',
    displayName: 'Compaction output price ($/M)',
    group: 'pricing',
    isConversationShape: false,
    uiMin: 0.01,
    uiMax: 100,
    uiStep: 0.01,
    displayMultiplier: 1_000_000,
    defaultSweepMin: 2.0 / 1_000_000,
    defaultSweepMax: 10.0 / 1_000_000,
    defaultSweepSteps: 5,
    defaultSweepScale: 'log',
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
