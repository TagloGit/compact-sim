import type { SimulationSnapshot, MessageType, Message } from '@/engine/types'

interface ContextStackProps {
  snapshot: SimulationSnapshot
  contextWindow: number
}

const MESSAGE_COLOURS: Record<MessageType, { bg: string; text: string }> = {
  system:      { bg: 'bg-slate-200 dark:bg-slate-700',   text: 'text-slate-700 dark:text-slate-200' },
  user:        { bg: 'bg-blue-200 dark:bg-blue-800',     text: 'text-blue-800 dark:text-blue-100' },
  assistant:   { bg: 'bg-green-200 dark:bg-green-800',   text: 'text-green-800 dark:text-green-100' },
  reasoning:   { bg: 'bg-teal-200 dark:bg-teal-800',     text: 'text-teal-800 dark:text-teal-100' },
  tool_call:   { bg: 'bg-orange-200 dark:bg-orange-800', text: 'text-orange-800 dark:text-orange-100' },
  tool_result: { bg: 'bg-amber-200 dark:bg-amber-800',   text: 'text-amber-800 dark:text-amber-100' },
  summary:     { bg: 'bg-purple-200 dark:bg-purple-800', text: 'text-purple-800 dark:text-purple-100' },
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

function MessageBlock({ message, heightPx }: { message: Message; heightPx: number }) {
  const colours = MESSAGE_COLOURS[message.type]
  const minHeight = 24

  return (
    <div
      className={`${colours.bg} ${colours.text} flex items-center justify-between rounded px-2 text-xs shrink-0 overflow-hidden`}
      style={{ height: Math.max(minHeight, heightPx) }}
      title={`${message.type}: ${message.tokens.toLocaleString()} tokens`}
    >
      <span className="truncate font-medium">{message.type}</span>
      <span className="tabular-nums ml-2 shrink-0">{formatTokens(message.tokens)}</span>
    </div>
  )
}

function CompactedGroup({ messages }: { messages: readonly Message[] }) {
  const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0)
  return (
    <div
      className="flex items-center justify-between rounded px-2 text-xs bg-muted/50 text-muted-foreground opacity-40 shrink-0"
      style={{ height: 20 }}
      title={`${messages.length} compacted messages (${totalTokens.toLocaleString()} original tokens)`}
    >
      <span className="truncate">{messages.length} compacted</span>
      <span className="tabular-nums ml-2 shrink-0">{formatTokens(totalTokens)}</span>
    </div>
  )
}

export function ContextStack({ snapshot, contextWindow }: ContextStackProps) {
  const { context, conversation } = snapshot
  const utilisationPct = Math.round((context.totalTokens / contextWindow) * 100)

  // Build the active context message ids for quick lookup
  const activeIds = new Set(context.messages.map((m) => m.id))

  // Compacted messages: in conversation with compacted=true and NOT in active context
  const compactedMessages = conversation.filter(
    (m) => m.compacted && !activeIds.has(m.id),
  )

  // Calculate proportional heights: allocate available space proportionally to token counts
  // Use a maximum available height and scale to fit
  const maxStackHeight = 500
  const totalContextTokens = context.totalTokens || 1
  const scale = maxStackHeight / totalContextTokens

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Context Window</span>
          <span className="tabular-nums text-muted-foreground">
            {formatTokens(context.totalTokens)} / {formatTokens(contextWindow)}
          </span>
        </div>

        {/* Utilisation bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              utilisationPct > 90
                ? 'bg-red-500'
                : utilisationPct > 70
                  ? 'bg-amber-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(100, utilisationPct)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{utilisationPct}% utilised</span>
          <span>{context.messages.length} messages in context</span>
        </div>
      </div>

      {/* Stack */}
      <div className="flex flex-col-reverse gap-0.5 overflow-y-auto" style={{ maxHeight: maxStackHeight + 40 }}>
        {/* Compacted messages (shown collapsed at bottom) */}
        {compactedMessages.length > 0 && (
          <CompactedGroup messages={compactedMessages} />
        )}

        {/* Active context messages (bottom = first/oldest, top = newest) */}
        {context.messages.map((msg) => (
          <MessageBlock
            key={msg.id}
            message={msg}
            heightPx={Math.round(msg.tokens * scale)}
          />
        ))}
      </div>

      {/* Compaction indicator */}
      {snapshot.compactionEvent && (
        <div className="rounded border border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950 px-2 py-1 text-xs text-purple-700 dark:text-purple-300">
          Compaction occurred on this step
        </div>
      )}
    </div>
  )
}
