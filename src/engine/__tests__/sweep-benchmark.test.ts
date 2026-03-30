import { describe, it } from 'vitest'
import { DEFAULT_CONFIG } from '../types'
import type { SimulationConfig } from '../types'
import type { SweepConfig, NumericSweepRange } from '../sweep-types'
import { buildDefaultSweepConfig } from '../sweep-defaults'
import { expandSweepConfig, partitionByShape } from '../sweep'
import { generateConversationSync, extractMetrics } from '../sweep-worker-protocol'

/**
 * Performance benchmark for sweep execution.
 *
 * Measures wall-clock time for the core simulation loop at various scales.
 * Web workers add minimal overhead (message passing) — the bottleneck is
 * extractMetrics, which this benchmark exercises directly.
 *
 * Run with: npm test -- sweep-benchmark --reporter=verbose
 */

/** Build a sweep config that produces approximately `targetCount` combinations */
function buildSweepForSize(targetCount: number): SweepConfig {
  const base = buildDefaultSweepConfig()

  // Sweep non-shape params to maximise conversation reuse.
  // Use compactionThreshold, compressionRatio, contextWindow, and
  // incrementalInterval — all non-shape, so one conversation per shape group.

  // Find step counts that multiply to ~targetCount
  // We'll use 4 params. Fourth root gives steps per param.
  const stepsPerParam = Math.max(2, Math.round(Math.pow(targetCount, 1 / 4)))

  // Adjust last param to hit exact target
  const first3 = stepsPerParam
  const last = Math.max(2, Math.round(targetCount / Math.pow(first3, 3)))

  const swept: Partial<Record<keyof SimulationConfig, NumericSweepRange>> = {
    compactionThreshold: {
      kind: 'swept',
      min: 0.6,
      max: 0.95,
      steps: first3,
      scale: 'linear',
    },
    compressionRatio: {
      kind: 'swept',
      min: 3,
      max: 20,
      steps: first3,
      scale: 'linear',
    },
    contextWindow: {
      kind: 'swept',
      min: 50_000,
      max: 200_000,
      steps: first3,
      scale: 'linear',
    },
    incrementalInterval: {
      kind: 'swept',
      min: 10_000,
      max: 60_000,
      steps: last,
      scale: 'linear',
    },
  }

  return { ...base, ...swept } as SweepConfig
}

/** Build a sweep config with shape params swept to test conversation generation cost */
function buildShapeSweepForSize(targetCount: number): SweepConfig {
  const base = buildDefaultSweepConfig()

  // Sweep toolCallCycles (shape param) + compressionRatio (non-shape)
  const stepsPerParam = Math.max(2, Math.round(Math.sqrt(targetCount)))
  const other = Math.max(2, Math.round(targetCount / stepsPerParam))

  const swept: Partial<Record<keyof SimulationConfig, NumericSweepRange>> = {
    toolCallCycles: {
      kind: 'swept',
      min: 20,
      max: 200,
      steps: stepsPerParam,
      scale: 'linear',
    },
    compressionRatio: {
      kind: 'swept',
      min: 3,
      max: 20,
      steps: other,
      scale: 'linear',
    },
  }

  return { ...base, ...swept } as SweepConfig
}

interface BenchmarkResult {
  label: string
  targetRuns: number
  actualRuns: number
  shapeGroups: number
  conversationGenMs: number
  simulationMs: number
  totalMs: number
  runsPerSec: number
}

function runBenchmark(label: string, config: SweepConfig, targetRuns: number): BenchmarkResult {
  const expanded = expandSweepConfig(config)
  const groups = partitionByShape(expanded)

  // Phase 1: Generate conversations (one per shape group)
  const convStart = performance.now()
  const conversations = new Map<string, readonly import('../types').Message[]>()
  for (const [key, groupConfigs] of groups) {
    conversations.set(key, generateConversationSync(groupConfigs[0]))
  }
  const convEnd = performance.now()

  // Phase 2: Run simulations
  const simStart = performance.now()
  for (const [key, groupConfigs] of groups) {
    const messages = conversations.get(key)!
    for (const cfg of groupConfigs) {
      extractMetrics(cfg, messages)
    }
  }
  const simEnd = performance.now()

  const conversationGenMs = convEnd - convStart
  const simulationMs = simEnd - simStart
  const totalMs = conversationGenMs + simulationMs

  return {
    label,
    targetRuns,
    actualRuns: expanded.length,
    shapeGroups: groups.size,
    conversationGenMs: Math.round(conversationGenMs),
    simulationMs: Math.round(simulationMs),
    totalMs: Math.round(totalMs),
    runsPerSec: Math.round(expanded.length / (totalMs / 1000)),
  }
}

function formatResult(r: BenchmarkResult): string {
  return [
    `  ${r.label}`,
    `    Runs: ${r.actualRuns.toLocaleString()} (target: ${r.targetRuns.toLocaleString()})`,
    `    Shape groups: ${r.shapeGroups}`,
    `    Conversation gen: ${r.conversationGenMs.toLocaleString()}ms`,
    `    Simulation: ${r.simulationMs.toLocaleString()}ms`,
    `    Total: ${r.totalMs.toLocaleString()}ms`,
    `    Throughput: ${r.runsPerSec.toLocaleString()} runs/sec`,
  ].join('\n')
}

describe('sweep performance benchmark', () => {
  const sizes = [100, 1_000, 10_000, 50_000]

  it('non-shape sweep (conversation reuse)', () => {
    const results: BenchmarkResult[] = []

    for (const size of sizes) {
      const config = buildSweepForSize(size)
      const result = runBenchmark(`${size.toLocaleString()} runs (non-shape)`, config, size)
      results.push(result)
    }

    console.log('\n=== NON-SHAPE SWEEP (single conversation reused) ===')
    for (const r of results) {
      console.log(formatResult(r))
    }
    console.log()
  }, 300_000)

  it('shape-param sweep (many conversations)', () => {
    const shapeSizes = [100, 1_000, 5_000]

    const results: BenchmarkResult[] = []

    for (const size of shapeSizes) {
      const config = buildShapeSweepForSize(size)
      const result = runBenchmark(`${size.toLocaleString()} runs (shape-swept)`, config, size)
      results.push(result)
    }

    console.log('\n=== SHAPE-PARAM SWEEP (many conversations generated) ===')
    for (const r of results) {
      console.log(formatResult(r))
    }
    console.log()
  }, 300_000)

  it('single-run cost baseline', () => {
    // Measure per-run cost at default config to establish baseline
    const messages = generateConversationSync(DEFAULT_CONFIG)

    const iterations = 1000
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      extractMetrics(DEFAULT_CONFIG, messages)
    }
    const elapsed = performance.now() - start

    const perRunMs = elapsed / iterations
    const runsPerSec = Math.round(1000 / perRunMs)

    console.log('\n=== SINGLE-RUN BASELINE ===')
    console.log(`  ${iterations} iterations of extractMetrics(DEFAULT_CONFIG)`)
    console.log(`  Total: ${Math.round(elapsed)}ms`)
    console.log(`  Per run: ${perRunMs.toFixed(3)}ms`)
    console.log(`  Throughput: ${runsPerSec.toLocaleString()} runs/sec`)
    console.log()
  }, 60_000)
})
