import { Effect } from 'effect'
import type { Message, SimulationConfig } from './types'
import type { SweepMetrics, SweepRunResult } from './sweep-types'
import { generateConversation } from './conversation'
import { runSimulationWithConversation } from './simulation'

// --- Worker message protocol ---

export interface WorkerBatch {
  readonly kind: 'batch'
  readonly runs: readonly WorkerRun[]
  readonly batchOffset: number // global index offset for this batch
}

export interface WorkerRun {
  readonly config: SimulationConfig
  readonly messages: readonly Message[]
}

export interface WorkerResultMessage {
  readonly kind: 'result'
  readonly result: SweepRunResult
}

export interface WorkerProgressMessage {
  readonly kind: 'progress'
  readonly completed: number // cumulative runs completed in this worker
}

export interface WorkerDoneMessage {
  readonly kind: 'done'
}

export type WorkerOutMessage = WorkerResultMessage | WorkerProgressMessage | WorkerDoneMessage

// --- Conversation generation helper (unwraps Effect) ---

export function generateConversationSync(config: SimulationConfig): readonly Message[] {
  return Effect.runSync(generateConversation(config))
}

// --- Metrics extraction from simulation result ---

export function extractMetrics(
  config: SimulationConfig,
  messages: readonly Message[],
): SweepMetrics {
  const result = runSimulationWithConversation(config, messages)
  const lastSnapshot = result.snapshots[result.snapshots.length - 1]
  const externalStoreSize = lastSnapshot ? lastSnapshot.externalStore.totalTokens : 0
  const totalRetrievalCost =
    result.summary.totalCost > 0
      ? lastSnapshot
        ? lastSnapshot.cumulativeCost.retrievalInput + lastSnapshot.cumulativeCost.retrievalOutput
        : 0
      : 0

  return {
    totalCost: result.summary.totalCost,
    peakContextSize: result.summary.peakContextSize,
    compactionEvents: result.summary.compactionEvents,
    averageCacheHitRate: result.summary.averageCacheHitRate,
    externalStoreSize,
    totalRetrievalCost,
  }
}
