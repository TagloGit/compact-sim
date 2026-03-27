import { useSimulation } from '@/hooks/useSimulation'
import { AppLayout } from '@/components/layout/AppLayout'
import { ParameterPanel } from '@/components/controls/ParameterPanel'
import { PlaybackControls } from '@/components/controls/PlaybackControls'
import { ContextStack } from '@/components/visualisations/ContextStack'
import { ContextSizeChart } from '@/components/visualisations/ContextSizeChart'
import { CostChart } from '@/components/visualisations/CostChart'
import { CacheHitRate } from '@/components/visualisations/CacheHitRate'
import { CostPerStepChart } from '@/components/visualisations/CostPerStepChart'
import { ExternalStore } from '@/components/visualisations/ExternalStore'

function formatCost(dollars: number): string {
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`
  return `$${dollars.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

function App() {
  const { config, updateConfig, result, currentStep, setCurrentStep, currentSnapshot } = useSimulation()

  return (
    <AppLayout
      sidebar={<ParameterPanel config={config} onUpdate={updateConfig} />}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Compaction Simulator</h1>
          <p className="text-sm text-muted-foreground">
            {config.selectedStrategy === 'full-compaction' && 'Strategy 1 — Full compaction at threshold'}
            {config.selectedStrategy === 'incremental' && 'Strategy 2 — Incremental compaction at intervals'}
            {config.selectedStrategy === 'lossless-append' && 'Strategy 4a — Lossless append-only with external retrieval'}
            {config.selectedStrategy === 'lossless-tool-results' && 'Strategy 4c — Tool-results-only lossless with external retrieval'}
            {config.toolCompressionEnabled && ' + tool result compression'}
          </p>
        </div>

        {result && currentSnapshot ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Step"
              value={`${currentStep + 1} / ${result.snapshots.length}`}
            />
            <StatCard
              label="Context Size"
              value={formatTokens(currentSnapshot.context.totalTokens)}
              sub={`${Math.round((currentSnapshot.context.totalTokens / config.contextWindow) * 100)}% of window`}
            />
            <StatCard
              label="Total Cost"
              value={formatCost(currentSnapshot.cumulativeCost.total)}
            />
            <StatCard
              label="Compaction Events"
              value={String(result.summary.compactionEvents)}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Running simulation...</p>
        )}

        {result && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Peak Context"
              value={formatTokens(result.summary.peakContextSize)}
            />
            <StatCard
              label="Avg Cache Hit Rate"
              value={`${(result.summary.averageCacheHitRate * 100).toFixed(1)}%`}
            />
            <StatCard
              label="Total Tokens Generated"
              value={formatTokens(result.summary.totalTokensGenerated)}
            />
            <StatCard
              label="Final Cost"
              value={formatCost(result.summary.totalCost)}
            />
            {(config.selectedStrategy === 'lossless-append' || config.selectedStrategy === 'lossless-tool-results') && (
              <>
                <StatCard
                  label="External Store"
                  value={formatTokens(result.snapshots[result.snapshots.length - 1].externalStore.totalTokens)}
                  sub={`${result.snapshots[result.snapshots.length - 1].externalStore.entries.length} entries`}
                />
                <StatCard
                  label="Retrieval Events"
                  value={String(result.snapshots.filter((s) => s.retrievalEvent).length)}
                />
              </>
            )}
          </div>
        )}

        {/* Playback controls */}
        {result && (
          <PlaybackControls
            currentStep={currentStep}
            totalSteps={result.snapshots.length}
            onStepChange={setCurrentStep}
          />
        )}

        {/* Context stack visualisation */}
        {currentSnapshot && (
          <ContextStack
            snapshot={currentSnapshot}
            contextWindow={config.contextWindow}
          />
        )}

        {/* External store visualisation (4x strategies only) */}
        {currentSnapshot && (config.selectedStrategy === 'lossless-append' || config.selectedStrategy === 'lossless-tool-results') && (
          <ExternalStore
            snapshot={currentSnapshot}
            contextWindow={config.contextWindow}
          />
        )}

        {/* Charts: context size + cache left, cumulative cost + per-step cost right */}
        {result && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <ContextSizeChart
                snapshots={result.snapshots}
                currentStep={currentStep}
                contextWindow={config.contextWindow}
                compactionThreshold={config.compactionThreshold}
              />
              <CacheHitRate
                snapshots={result.snapshots}
                currentStep={currentStep}
              />
            </div>
            <div className="flex flex-col gap-4">
              <CostChart
                snapshots={result.snapshots}
                currentStep={currentStep}
              />
              <CostPerStepChart
                snapshots={result.snapshots}
                currentStep={currentStep}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default App
