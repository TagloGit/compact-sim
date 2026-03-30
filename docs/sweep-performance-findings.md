# Sweep Performance Findings

Benchmark run: 2026-03-30
Environment: Windows 11, Node.js (Vitest), single-threaded execution

## Single-thread throughput

| Runs | Wall-clock time | Throughput |
|------|----------------|------------|
| 100 | 280ms | 386 runs/s |
| 1,000 | 2.9s | 375 runs/s |
| 10,000 | 33s | 302 runs/s |
| 50,000 | 122s | 415 runs/s |

Per-run baseline (DEFAULT_CONFIG, 100 tool-call cycles): **2.2ms / 455 runs/s**

Average single-threaded throughput: **~350 runs/s** in Node.js. In the browser, worker message serialisation and React state updates add ~2x overhead, giving an effective **~175 runs/s** per thread. The UI estimate uses the browser-calibrated figure.

## Conversation generation cost

Negligible. Even with 71 shape groups, conversation generation took <3ms total. The bottleneck is purely `extractMetrics` (the simulation loop).

## Shape-sweep overhead

Sweeping conversation-shape parameters (e.g. `toolCallCycles`) doesn't significantly change per-run throughput — it just requires generating more conversations, which is near-free.

| Runs | Shape groups | Total time | Throughput |
|------|-------------|------------|------------|
| 100 | 10 | 299ms | 334 runs/s |
| 1,000 | 32 | 3.3s | 298 runs/s |
| 5,000 | 71 | 14.9s | 333 runs/s |

## Projected browser times (with web workers)

Workers scale throughput roughly linearly:

| Cores | Effective throughput | 1,000 runs | 10,000 runs | 50,000 runs |
|-------|---------------------|-----------|-------------|-------------|
| 4 | ~1,400/s | 0.7s | 7s | 36s |
| 8 | ~2,800/s | 0.4s | 4s | 18s |
| 16 | ~5,600/s | 0.2s | 2s | 9s |

## Decisions

### Warning threshold: 50,000 -> 10,000

The previous 50,000 threshold was a placeholder. At 50,000 runs, a 4-core machine waits ~36s before seeing any warning. Lowering to 10,000 ensures users get a heads-up at the ~4-7s mark (depending on cores), which is the point where a wait becomes noticeable.

The warning now includes an estimated completion time based on `navigator.hardwareConcurrency`.

### Batch size: kept at 50

At ~2.2ms/run, a batch of 50 completes in ~110ms. This provides:
- Smooth progress updates (~9 per second per worker)
- Fast cancellation response (<110ms)
- Negligible message-passing overhead relative to computation

No change needed.

### Worker count: kept at `navigator.hardwareConcurrency`

The current approach (cap at available cores, minimum 4) is correct. No change needed.

## Benchmark test

The benchmark lives at `src/engine/__tests__/sweep-benchmark.test.ts`. It's excluded from the normal test suite due to its long runtime (~3 minutes). Run manually:

```
npm test -- sweep-benchmark --reporter=verbose
```
