import type { SimulationSnapshot } from '@/engine/types'

interface ExternalStoreProps {
  snapshot: SimulationSnapshot
  contextWindow: number
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

export function ExternalStore({ snapshot, contextWindow }: ExternalStoreProps) {
  const { externalStore } = snapshot

  if (externalStore.entries.length === 0) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">External Store</span>
          <span className="tabular-nums text-muted-foreground">empty</span>
        </div>
        <div className="relative h-6 w-full rounded bg-muted overflow-hidden" />
      </div>
    )
  }

  // Use the same scale as context window for visual alignment
  const totalWidthTokens = contextWindow

  // Group entries into rows — each row holds entries up to contextWindow tokens wide
  const rows: { id: string; tokens: number; originalMessageIds: readonly string[] }[][] = [[]]
  let currentRowTokens = 0
  for (const entry of externalStore.entries) {
    if (currentRowTokens + entry.tokens > totalWidthTokens && currentRowTokens > 0) {
      rows.push([])
      currentRowTokens = 0
    }
    rows[rows.length - 1].push(entry)
    currentRowTokens += entry.tokens
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">External Store</span>
        <span className="tabular-nums text-muted-foreground">
          {formatTokens(externalStore.totalTokens)} tokens &middot; {externalStore.entries.length} {externalStore.entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="relative h-6 w-full rounded bg-muted overflow-hidden flex"
        >
          {row.map((entry) => {
            const widthPct = (entry.tokens / totalWidthTokens) * 100
            return (
              <div
                key={entry.id}
                className="bg-indigo-400 dark:bg-indigo-500 h-full shrink-0 border-r border-background/30 last:border-r-0"
                style={{ width: `${widthPct}%` }}
                title={`${entry.id}: ${entry.tokens.toLocaleString()} tokens (${entry.originalMessageIds.length} messages)`}
              />
            )
          })}
        </div>
      ))}

      <div className="flex items-center gap-1">
        <div className="bg-indigo-400 dark:bg-indigo-500 size-2.5 rounded-sm" />
        <span className="text-xs text-muted-foreground">Stored content</span>
        {snapshot.retrievalEvent && (
          <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            — retrieval
          </span>
        )}
      </div>
    </div>
  )
}
