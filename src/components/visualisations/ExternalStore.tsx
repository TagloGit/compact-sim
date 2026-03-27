import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
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
  const [open, setOpen] = useState(false)
  const { externalStore } = snapshot

  const isEmpty = externalStore.entries.length === 0
  const summaryText = isEmpty
    ? 'empty'
    : `${formatTokens(externalStore.totalTokens)} tokens \u00b7 ${externalStore.entries.length} ${externalStore.entries.length === 1 ? 'entry' : 'entries'}`

  // Header — always visible, acts as toggle
  const header = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex w-full items-center justify-between text-sm cursor-pointer"
    >
      <span className="flex items-center gap-1.5 font-medium">
        <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        External Store
      </span>
      <span className="tabular-nums text-muted-foreground">{summaryText}</span>
    </button>
  )

  if (isEmpty || !open) {
    return <div className="space-y-1.5">{header}</div>
  }

  // Use the same scale as context window for visual alignment
  const totalWidthTokens = contextWindow

  // Indigo shade varies by level: deeper levels get darker shades
  const levelColors: Record<number, string> = {
    0: 'bg-indigo-400 dark:bg-indigo-500',
    1: 'bg-indigo-600 dark:bg-indigo-700',
    2: 'bg-indigo-800 dark:bg-indigo-900',
  }
  function colorForLevel(level: number): string {
    return levelColors[level] ?? levelColors[2]
  }

  const hasLevels = externalStore.entries.some((e) => e.level > 0)

  // Group entries into rows — each row holds entries up to contextWindow tokens wide
  const rows: { id: string; tokens: number; level: number; originalMessageIds: readonly string[] }[][] = [[]]
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
      {header}

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
                className={`${colorForLevel(entry.level)} h-full shrink-0 border-r border-background/30 last:border-r-0`}
                style={{ width: `${widthPct}%` }}
                title={`${entry.id}: ${entry.tokens.toLocaleString()} tokens (${entry.originalMessageIds.length} messages)${entry.level > 0 ? ` — level ${entry.level}` : ''}`}
              />
            )
          })}
        </div>
      ))}

      <div className="flex items-center gap-1">
        {hasLevels ? (
          <>
            <div className="bg-indigo-400 dark:bg-indigo-500 size-2.5 rounded-sm" />
            <span className="text-xs text-muted-foreground">Level 0</span>
            <div className="bg-indigo-600 dark:bg-indigo-700 size-2.5 rounded-sm ml-2" />
            <span className="text-xs text-muted-foreground">Level 1</span>
          </>
        ) : (
          <>
            <div className="bg-indigo-400 dark:bg-indigo-500 size-2.5 rounded-sm" />
            <span className="text-xs text-muted-foreground">Stored content</span>
          </>
        )}
        {snapshot.retrievalEvent && (
          <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            — retrieval
          </span>
        )}
      </div>
    </div>
  )
}
