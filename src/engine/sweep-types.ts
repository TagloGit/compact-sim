import type { SimulationConfig, StrategyType, SummaryGrowthModel } from './types'

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

export interface SummaryGrowthSweepRange {
  readonly kind: 'swept'
  readonly values: SummaryGrowthModel[]
}

export interface BooleanSweepRange {
  readonly kind: 'swept'
}

export type SweepParameterDef =
  | FixedValue<number>
  | FixedValue<StrategyType>
  | FixedValue<SummaryGrowthModel>
  | FixedValue<boolean>
  | NumericSweepRange
  | NumericValuesRange
  | StrategySweepRange
  | SummaryGrowthSweepRange
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
