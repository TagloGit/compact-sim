import type { SimulationSnapshot, MessageType } from '@/engine/types'

interface ContextStackProps {
  snapshot: SimulationSnapshot
  contextWindow: number
}

const MESSAGE_COLOURS: Record<MessageType, string> = {
  system:      'bg-slate-400 dark:bg-slate-500',
  user:        'bg-blue-400 dark:bg-blue-500',
  assistant:   'bg-green-400 dark:bg-green-500',
  reasoning:   'bg-teal-400 dark:bg-teal-500',
  tool_call:   'bg-orange-400 dark:bg-orange-500',
  tool_result: 'bg-amber-400 dark:bg-amber-500',
  summary:     'bg-purple-400 dark:bg-purple-500',
}

const MESSAGE_LABELS: Record<MessageType, string> = {
  system:      'System',
  user:        'User',
  assistant:   'Assistant',
  reasoning:   'Reasoning',
  tool_call:   'Tool call',
  tool_result: 'Tool result',
  summary:     'Summary',
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

export function ContextStack({ snapshot, contextWindow }: ContextStackProps) {
  const { context } = snapshot
  const utilisationPct = Math.round((context.totalTokens / contextWindow) * 100)

  // Which message types are present (for the legend)
  const presentTypes = new Set(context.messages.map((m) => m.type))

  return (
    <div className="space-y-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Context Window</span>
        <span className="tabular-nums text-muted-foreground">
          {formatTokens(context.totalTokens)} / {formatTokens(contextWindow)} ({utilisationPct}%)
        </span>
      </div>

      {/* Horizontal stacked bar — each segment is (tokens / contextWindow)% wide */}
      <div className="relative h-6 w-full rounded bg-muted overflow-hidden flex">
        {context.messages.map((msg) => {
          const widthPct = (msg.tokens / contextWindow) * 100
          return (
            <div
              key={msg.id}
              className={`${MESSAGE_COLOURS[msg.type]} h-full shrink-0 border-r border-background/30 last:border-r-0`}
              style={{ width: `${widthPct}%` }}
              title={`${MESSAGE_LABELS[msg.type]}: ${msg.tokens.toLocaleString()} tokens`}
            />
          )
        })}
      </div>

      {/* Legend + info row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(Object.keys(MESSAGE_COLOURS) as MessageType[])
            .filter((type) => presentTypes.has(type))
            .map((type) => (
              <div key={type} className="flex items-center gap-1">
                <div className={`${MESSAGE_COLOURS[type]} size-2.5 rounded-sm`} />
                <span className="text-xs text-muted-foreground">{MESSAGE_LABELS[type]}</span>
              </div>
            ))}
        </div>

        <span className="text-xs text-muted-foreground shrink-0">
          {context.messages.length} messages
          {snapshot.compactionEvent && (
            <span className="ml-2 text-purple-600 dark:text-purple-400 font-medium">
              — compaction
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
