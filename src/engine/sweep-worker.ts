import type { WorkerBatch, WorkerResultMessage, WorkerProgressMessage, WorkerDoneMessage } from './sweep-worker-protocol'
import { extractMetrics } from './sweep-worker-protocol'

const PROGRESS_INTERVAL = 10 // post progress every N runs

function handleBatch(batch: WorkerBatch): void {
  let completed = 0
  for (let i = 0; i < batch.runs.length; i++) {
    const run = batch.runs[i]
    const metrics = extractMetrics(run.config, run.messages)
    const resultMsg: WorkerResultMessage = {
      kind: 'result',
      result: {
        index: batch.batchOffset + i,
        config: run.config,
        metrics,
      },
    }
    self.postMessage(resultMsg)

    completed++
    if (completed % PROGRESS_INTERVAL === 0) {
      const progressMsg: WorkerProgressMessage = {
        kind: 'progress',
        completed,
      }
      self.postMessage(progressMsg)
    }
  }

  // Final progress + done
  const progressMsg: WorkerProgressMessage = { kind: 'progress', completed }
  self.postMessage(progressMsg)
  const doneMsg: WorkerDoneMessage = { kind: 'done' }
  self.postMessage(doneMsg)
}

self.onmessage = (e: MessageEvent<WorkerBatch>) => {
  if (e.data.kind === 'batch') {
    handleBatch(e.data)
  }
}
