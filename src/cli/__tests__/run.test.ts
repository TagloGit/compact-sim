import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runSimCommand, runSweepCommand, runInfoCommand } from '../run'
import { DEFAULT_CONFIG } from '@/engine/types'
import { buildDefaultSweepConfig } from '@/engine/sweep-defaults'

describe('CLI subcommands', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('sim', () => {
    it('produces a SimulationResult with expected shape', () => {
      const configPath = join(tempDir, 'config.json')
      const outputPath = join(tempDir, 'output.json')
      writeFileSync(configPath, JSON.stringify({ toolCallCycles: 5 }))

      runSimCommand(configPath, outputPath)

      const result = JSON.parse(
        readFileSync(outputPath, 'utf-8'),
      )
      expect(result.config).toBeDefined()
      expect(result.config.toolCallCycles).toBe(5)
      expect(result.config.contextWindow).toBe(DEFAULT_CONFIG.contextWindow)
      expect(result.snapshots).toBeInstanceOf(Array)
      expect(result.snapshots.length).toBeGreaterThan(0)
      expect(result.summary).toBeDefined()
      expect(typeof result.summary.totalCost).toBe('number')
      expect(typeof result.summary.compactionEvents).toBe('number')
      expect(typeof result.summary.averageCacheHitRate).toBe('number')
      expect(typeof result.summary.peakContextSize).toBe('number')
    })

    it('merges partial config with defaults', () => {
      const configPath = join(tempDir, 'config.json')
      const outputPath = join(tempDir, 'output.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          selectedStrategy: 'incremental',
          compactionThreshold: 0.5,
        }),
      )

      runSimCommand(configPath, outputPath)

      const result = JSON.parse(
        readFileSync(outputPath, 'utf-8'),
      )
      expect(result.config.selectedStrategy).toBe('incremental')
      expect(result.config.compactionThreshold).toBe(0.5)
      expect(result.config.toolCallCycles).toBe(DEFAULT_CONFIG.toolCallCycles)
    })
  })

  describe('sweep', () => {
    it('produces an array of SweepRunResult with expected shape', () => {
      const sweepConfig = buildDefaultSweepConfig()
      // Sweep over 2 strategies × default fixed params = 2 runs
      ;(sweepConfig as Record<string, unknown>).selectedStrategy = {
        kind: 'swept',
        values: ['full-compaction', 'incremental'],
      }
      // Keep it small
      ;(sweepConfig as Record<string, unknown>).toolCallCycles = {
        kind: 'fixed',
        value: 5,
      }

      const configPath = join(tempDir, 'sweep.json')
      const outputPath = join(tempDir, 'sweep-out.json')
      writeFileSync(configPath, JSON.stringify(sweepConfig))

      runSweepCommand(configPath, outputPath)

      const results = JSON.parse(
        readFileSync(outputPath, 'utf-8'),
      )
      expect(results).toBeInstanceOf(Array)
      expect(results.length).toBe(2)
      for (const r of results) {
        expect(r.config).toBeDefined()
        expect(r.metrics).toBeDefined()
        expect(typeof r.metrics.totalCost).toBe('number')
        expect(typeof r.metrics.peakContextSize).toBe('number')
        expect(typeof r.metrics.compactionEvents).toBe('number')
        expect(typeof r.metrics.averageCacheHitRate).toBe('number')
        expect(typeof r.metrics.externalStoreSize).toBe('number')
        expect(typeof r.metrics.totalRetrievalCost).toBe('number')
        expect(typeof r.index).toBe('number')
      }
    })
  })

  describe('info', () => {
    it('outputs JSON with strategies, paramMeta, and defaultConfig', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

      runInfoCommand()

      expect(spy).toHaveBeenCalledOnce()
      const output = JSON.parse(spy.mock.calls[0][0])

      expect(output.strategies).toBeDefined()
      expect(output.strategies['full-compaction']).toBeDefined()
      expect(output.strategies['incremental']).toBeDefined()
      expect(output.strategies['lcm-subagent']).toBeDefined()

      expect(output.paramMeta).toBeDefined()
      expect(output.paramMeta.toolCallCycles).toBeDefined()

      expect(output.defaultConfig).toBeDefined()
      expect(output.defaultConfig.contextWindow).toBe(
        DEFAULT_CONFIG.contextWindow,
      )

      spy.mockRestore()
    })
  })
})
