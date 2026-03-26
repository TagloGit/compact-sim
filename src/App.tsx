import { useSimulation } from '@/hooks/useSimulation'
import { AppLayout } from '@/components/layout/AppLayout'
import { ParameterPanel } from '@/components/controls/ParameterPanel'
import { PlaybackControls } from '@/components/controls/PlaybackControls'
import { ContextStack } from '@/components/visualisations/ContextStack'

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
            Strategy 1 — Full compaction at threshold
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
