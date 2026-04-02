import type { SimulationConfig, StrategyType } from './types'

// --- Sweep parameter definitions ---

export type ParamScale = 'linear' | 'log'

export interface NumericSweepRange {
  readonly kind: 'swept'
  readonly min: number
  readonly max: number
  readonly steps: number
  readonly scale: ParamScale
}

export interface FixedValue<T> {
  readonly kind: 'fixed'
  readonly value: T
}

export interface StrategySweepRange {
  readonly kind: 'swept'
  readonly values: StrategyType[]
}

export interface NumericValuesRange {
  readonly kind: 'swept'
  readonly values: number[]
}

export interface BooleanSweepRange {
  readonly kind: 'swept'
}

export interface EnumSweepRange {
  readonly kind: 'swept'
  readonly values: readonly string[]
}

export type SweepParameterDef =
  | FixedValue<number>
  | FixedValue<string>
  | FixedValue<boolean>
  | NumericSweepRange
  | NumericValuesRange
  | StrategySweepRange
  | EnumSweepRange
  | BooleanSweepRange

// --- Sweep configuration ---

export type SweepConfig = {
  readonly [K in keyof SimulationConfig]: SweepParameterDef
}

// --- Sweep results ---

export interface SweepMetrics {
  readonly totalCost: number
  readonly peakContextSize: number
  readonly compactionEvents: number
  readonly averageCacheHitRate: number
  readonly externalStoreSize: number
  readonly totalRetrievalCost: number
}

export interface SweepRunResult {
  readonly index: number
  readonly config: SimulationConfig
  readonly metrics: SweepMetrics
}

// --- Variable ordering ---

export type SweepVariableOrder = (keyof SimulationConfig)[]
