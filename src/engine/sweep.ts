import type { SimulationConfig } from './types'
import { DEFAULT_CONFIG } from './types'
import type {
  SweepConfig,
  SweepParameterDef,
  NumericSweepRange,
  StrategySweepRange,
} from './sweep-types'
import { PARAM_META, getConversationShapeKeys } from './sweep-defaults'

/**
 * Generate evenly-spaced values on a linear scale.
 * Returns `steps` values from `min` to `max` inclusive.
 */
export function generateLinearValues(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [min]
  return Array.from({ length: steps }, (_, i) => min + (max - min) * (i / (steps - 1)))
}

/**
 * Generate evenly-spaced values on a logarithmic scale.
 * Returns `steps` values from `min` to `max` inclusive, spaced in log-space.
 */
export function generateLogValues(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [min]
  const logMin = Math.log(Math.max(min, 1e-12))
  const logMax = Math.log(Math.max(max, 1e-12))
  return Array.from({ length: steps }, (_, i) =>
    Math.exp(logMin + (logMax - logMin) * (i / (steps - 1))),
  )
}

/**
 * Expand a single parameter definition into its array of concrete values.
 */
export function expandParamValues(key: keyof SimulationConfig, def: SweepParameterDef): unknown[] {
  if (def.kind === 'fixed') return [def.value]
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') {
    return (def as StrategySweepRange).values
  }
  if (meta.paramKind === 'boolean') {
    return [false, true]
  }
  // Numeric: explicit values array
  if ('values' in def) {
    return (def as { values: number[] }).values
  }
  const numDef = def as NumericSweepRange
  return numDef.scale === 'log'
    ? generateLogValues(numDef.min, numDef.max, numDef.steps)
    : generateLinearValues(numDef.min, numDef.max, numDef.steps)
}

/**
 * Expand a SweepConfig into the full cartesian product of SimulationConfig objects.
 *
 * The order of the returned array follows the cartesian product with parameters
 * iterated in their natural key order (Object.keys of SimulationConfig).
 * The last parameter varies fastest (row-major).
 */
export function expandSweepConfig(config: SweepConfig): SimulationConfig[] {
  const keys = Object.keys(config) as (keyof SimulationConfig)[]
  const paramValues = keys.map((key) => ({
    key,
    values: expandParamValues(key, config[key]),
  }))

  const total = paramValues.reduce((acc, p) => acc * p.values.length, 1)
  if (total === 0) return []

  const results: SimulationConfig[] = []

  for (let i = 0; i < total; i++) {
    const configObj = { ...DEFAULT_CONFIG } as Record<string, unknown>
    let remainder = i
    for (let p = paramValues.length - 1; p >= 0; p--) {
      const pv = paramValues[p]
      const idx = remainder % pv.values.length
      remainder = Math.floor(remainder / pv.values.length)
      configObj[pv.key] = pv.values[idx]
    }
    results.push(configObj as unknown as SimulationConfig)
  }

  return results
}

/**
 * Partition an array of SimulationConfig objects into groups that share
 * the same conversation-shape parameter values. Configs in the same group
 * can reuse a single generated conversation.
 *
 * Returns a Map keyed by a stable string representation of the shape values,
 * with each value being the array of configs sharing that shape.
 */
export function partitionByShape(
  configs: SimulationConfig[],
): Map<string, SimulationConfig[]> {
  const shapeKeys = getConversationShapeKeys()
  const groups = new Map<string, SimulationConfig[]>()

  for (const config of configs) {
    const shapeKey = shapeKeys
      .map((k) => `${k}=${config[k]}`)
      .join('|')

    const group = groups.get(shapeKey)
    if (group) {
      group.push(config)
    } else {
      groups.set(shapeKey, [config])
    }
  }

  return groups
}
