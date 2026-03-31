import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import { Effect } from 'effect'
import { DEFAULT_CONFIG, type SimulationConfig } from '@/engine/types'
import { generateConversation } from '@/engine/conversation'
import { runSimulationWithConversation } from '@/engine/simulation'
import { expandSweepConfig, partitionByShape } from '@/engine/sweep'
import { PARAM_META } from '@/engine/sweep-defaults'
import type { SweepConfig, SweepRunResult } from '@/engine/sweep-types'

// ---------------------------------------------------------------------------
// Strategy descriptions (stable, from spec)
// ---------------------------------------------------------------------------

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  'full-compaction':
    'Replace all non-system messages with a single summary when context exceeds threshold.',
  incremental:
    'Compact new content at intervals; meta-compact accumulated summaries when they exceed a secondary threshold.',
  'lossless-append':
    'Incremental compaction with originals stored in an external store for probabilistic retrieval.',
  'lossless-hierarchical':
    'Full replacement each compaction, hierarchical external store with levelled entries.',
  'lossless-tool-results':
    'Hybrid: general content compacted lossy (incremental), tool results stored externally.',
  'lcm-subagent':
    'Full replacement + external store with dual retrieval tools (lcm_grep / lcm_expand).',
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  subcommand: string
  config?: string
  output?: string
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2) // strip node + script
  const subcommand = args[0]
  if (!subcommand || !['sim', 'sweep', 'info'].includes(subcommand)) {
    printUsage()
    process.exit(1)
  }

  let config: string | undefined
  let output: string | undefined

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      config = args[++i]
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i]
    }
  }

  return { subcommand, config, output }
}

function printUsage(): void {
  console.error(`Usage: run.ts <subcommand> [options]

Subcommands:
  sim    --config <path> [--output <path>]   Run a single simulation
  sweep  --config <path> [--output <path>]   Run a parameter sweep
  info                                       Print strategy info, PARAM_META, DEFAULT_CONFIG`)
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

export function runSimCommand(configPath: string, outputPath?: string): void {
  const partial = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<SimulationConfig>
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...partial }

  const messages = Effect.runSync(generateConversation(config))
  const result = runSimulationWithConversation(config, messages)

  const json = JSON.stringify(result, null, 2)
  if (outputPath) {
    writeFileSync(outputPath, json, 'utf-8')
    console.error(`Wrote result to ${outputPath}`)
  } else {
    console.log(json)
  }
}

export function runSweepCommand(configPath: string, outputPath?: string): void {
  const sweepConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as SweepConfig
  const configs = expandSweepConfig(sweepConfig)
  const groups = partitionByShape(configs)

  const results: SweepRunResult[] = []
  let completed = 0

  for (const [, groupConfigs] of groups) {
    const messages = Effect.runSync(generateConversation(groupConfigs[0]))

    for (const cfg of groupConfigs) {
      const simResult = runSimulationWithConversation(cfg, messages)
      const lastSnapshot = simResult.snapshots[simResult.snapshots.length - 1]

      results.push({
        index: completed,
        config: cfg,
        metrics: {
          totalCost: simResult.summary.totalCost,
          peakContextSize: simResult.summary.peakContextSize,
          compactionEvents: simResult.summary.compactionEvents,
          averageCacheHitRate: simResult.summary.averageCacheHitRate,
          externalStoreSize: lastSnapshot ? lastSnapshot.externalStore.totalTokens : 0,
          totalRetrievalCost:
            lastSnapshot
              ? lastSnapshot.cumulativeCost.retrievalInput +
                lastSnapshot.cumulativeCost.retrievalOutput
              : 0,
        },
      })

      completed++
      if (completed % 10 === 0 || completed === configs.length) {
        console.error(`${completed}/${configs.length} configs complete`)
      }
    }
  }

  const json = JSON.stringify(results, null, 2)
  if (outputPath) {
    writeFileSync(outputPath, json, 'utf-8')
    console.error(`Wrote ${results.length} results to ${outputPath}`)
  } else {
    console.log(json)
  }
}

export function runInfoCommand(): void {
  const info = {
    strategies: STRATEGY_DESCRIPTIONS,
    paramMeta: PARAM_META,
    defaultConfig: DEFAULT_CONFIG,
  }
  console.log(JSON.stringify(info, null, 2))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(argv: string[] = process.argv): void {
  const { subcommand, config, output } = parseArgs(argv)

  switch (subcommand) {
    case 'sim':
      if (!config) {
        console.error('Error: sim requires --config <path>')
        process.exit(1)
      }
      runSimCommand(config, output)
      break

    case 'sweep':
      if (!config) {
        console.error('Error: sweep requires --config <path>')
        process.exit(1)
      }
      runSweepCommand(config, output)
      break

    case 'info':
      runInfoCommand()
      break
  }
}

// Run only when invoked directly (not when imported by tests)
const _thisFile = fileURLToPath(import.meta.url)
const _entryFile = process.argv[1] ? resolve(process.argv[1]) : ''

if (_thisFile === _entryFile) {
  main()
}
