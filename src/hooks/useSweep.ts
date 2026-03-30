import { useState, useCallback, useRef } from 'react'
import type { SimulationConfig } from '@/engine/types'
import type { SweepConfig, SweepRunResult } from '@/engine/sweep-types'
import { buildDefaultSweepConfig } from '@/engine/sweep-defaults'
import { expandSweepConfig, expandParamValues, partitionByShape } from '@/engine/sweep'
import type { WorkerBatch, WorkerRun, WorkerOutMessage } from '@/engine/sweep-worker-protocol'
import { generateConversationSync } from '@/engine/sweep-worker-protocol'

const BATCH_SIZE = 50
const DEFAULT_WORKER_COUNT = 4

export interface UseSweepReturn {
  sweepConfig: SweepConfig
  setSweepConfig: React.Dispatch<React.SetStateAction<SweepConfig>>
  results: SweepRunResult[]
  progress: number // 0..1
  isRunning: boolean
  run: (variableOrder: (keyof SimulationConfig)[]) => void
  reorder: (variableOrder: (keyof SimulationConfig)[]) => void
  cancel: () => void
}

export function useSweep(): UseSweepReturn {
  const [sweepConfig, setSweepConfig] = useState<SweepConfig>(buildDefaultSweepConfig)
  const [results, setResults] = useState<SweepRunResult[]>([])
  const [progress, setProgress] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const workersRef = useRef<Worker[]>([])
  const cancelledRef = useRef(false)

  const cancel = useCallback(() => {
    cancelledRef.current = true
    for (const w of workersRef.current) {
      w.terminate()
    }
    workersRef.current = []
    setIsRunning(false)
  }, [])

  const run = useCallback(
    (variableOrder: (keyof SimulationConfig)[]) => {
      // Cancel any in-flight sweep
      for (const w of workersRef.current) {
        w.terminate()
      }
      workersRef.current = []
      cancelledRef.current = false

      setIsRunning(true)
      setProgress(0)
      setResults([])

      // Reorder sweep config keys so variableOrder keys come first
      const allKeys = Object.keys(sweepConfig) as (keyof SimulationConfig)[]
      const orderedKeys = [
        ...variableOrder,
        ...allKeys.filter((k) => !variableOrder.includes(k)),
      ]
      const reorderedConfig = Object.fromEntries(
        orderedKeys.map((k) => [k, sweepConfig[k]]),
      ) as SweepConfig

      // Expand to full cartesian product
      const expanded = expandSweepConfig(reorderedConfig)
      const totalRuns = expanded.length

      if (totalRuns === 0) {
        setIsRunning(false)
        return
      }

      // Partition by conversation shape and generate conversations
      const groups = partitionByShape(expanded)
      const runs: WorkerRun[] = []

      // Build flat run list with pre-generated conversations
      // Track original indices so results end up in cartesian-product order
      const configToIndex = new Map<SimulationConfig, number>()
      expanded.forEach((cfg, i) => configToIndex.set(cfg, i))

      for (const groupConfigs of groups.values()) {
        // All configs in a group share conversation-shape params — use the first to generate
        const messages = generateConversationSync(groupConfigs[0])
        for (const config of groupConfigs) {
          runs.push({ config, messages: [...messages] })
        }
      }

      // Sort runs back into cartesian-product index order
      runs.sort((a, b) => (configToIndex.get(a.config) ?? 0) - (configToIndex.get(b.config) ?? 0))

      // Distribute into batches
      const batches: WorkerBatch[] = []
      for (let i = 0; i < runs.length; i += BATCH_SIZE) {
        batches.push({
          kind: 'batch',
          runs: runs.slice(i, i + BATCH_SIZE),
          batchOffset: i,
        })
      }

      // Spawn workers and distribute batches round-robin
      const workerCount = Math.min(
        navigator.hardwareConcurrency || DEFAULT_WORKER_COUNT,
        batches.length,
      )

      const collectedResults: SweepRunResult[] = new Array(totalRuns)
      let resultsReceived = 0
      let workersDone = 0

      const workers: Worker[] = []
      // Group batches per worker for round-robin distribution
      const workerBatches: WorkerBatch[][] = Array.from({ length: workerCount }, () => [])
      batches.forEach((batch, i) => {
        workerBatches[i % workerCount].push(batch)
      })

      for (let w = 0; w < workerCount; w++) {
        const worker = new Worker(
          new URL('../engine/sweep-worker.ts', import.meta.url),
          { type: 'module' },
        )
        workers.push(worker)

        let batchIndex = 0

        worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          if (cancelledRef.current) return

          const msg = e.data
          if (msg.kind === 'result') {
            collectedResults[msg.result.index] = msg.result
            resultsReceived++
            setProgress(Math.min(resultsReceived / totalRuns, 1))
          } else if (msg.kind === 'done') {
            // Send next batch to this worker
            batchIndex++
            if (batchIndex < workerBatches[w].length) {
              worker.postMessage(workerBatches[w][batchIndex])
            } else {
              workersDone++
              worker.terminate()
              if (workersDone === workerCount) {
                workersRef.current = []
                if (!cancelledRef.current) {
                  setResults([...collectedResults])
                  setProgress(1)
                  setIsRunning(false)
                }
              }
            }
          }
        }

        // Start the first batch for this worker
        if (workerBatches[w].length > 0) {
          worker.postMessage(workerBatches[w][0])
        }
      }

      workersRef.current = workers
    },
    [sweepConfig],
  )

  const reorder = useCallback(
    (variableOrder: (keyof SimulationConfig)[]) => {
      if (results.length === 0) return

      // Build the key order: variableOrder first, then remaining keys
      const allKeys = Object.keys(sweepConfig) as (keyof SimulationConfig)[]
      const orderedKeys = [
        ...variableOrder,
        ...allKeys.filter((k) => !variableOrder.includes(k)),
      ]

      // For each key, get the expanded values in order so we can map config values to indices
      const paramArrays = orderedKeys.map((key) => ({
        key,
        values: expandParamValues(key, sweepConfig[key]),
      }))

      // Compute a sort key for each result: its position in the new cartesian product order
      const sortKey = (r: SweepRunResult): number => {
        let index = 0
        for (const { key, values } of paramArrays) {
          const configValue = r.config[key]
          // Find closest value index (handles floating point from log scale)
          let valueIndex = values.findIndex((v) => v === configValue)
          if (valueIndex === -1) {
            // Fallback: find closest numeric match
            valueIndex = values.reduce<number>(
              (best, v, i) =>
                Math.abs(Number(v) - Number(configValue)) <
                Math.abs(Number(values[best] as number) - Number(configValue))
                  ? i
                  : best,
              0,
            )
          }
          index = index * values.length + valueIndex
        }
        return index
      }

      const sorted = [...results]
        .sort((a, b) => sortKey(a) - sortKey(b))
        .map((r, i) => ({ ...r, index: i }))
      setResults(sorted)
    },
    [results, sweepConfig],
  )

  return { sweepConfig, setSweepConfig, results, progress, isRunning, run, reorder, cancel }
}
