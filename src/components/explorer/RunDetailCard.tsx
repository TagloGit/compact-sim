import { ExternalLink } from 'lucide-react'
import type { SweepRunResult, SweepMetrics } from '@/engine/sweep-types'
import type { SimulationConfig } from '@/engine/types'
import { PARAM_META, type ParamGroup } from '@/engine/sweep-defaults'
import type { MetricKey } from '@/components/explorer/SweepControls'
import { Button } from '@/components/ui/button'

const METRIC_INFO: { key: MetricKey; label: string; format: (v: number) => string }[] = [
  { key: 'totalCost', label: 'Total Cost', format: (v) => `$${v.toFixed(4)}` },
  { key: 'peakContextSize', label: 'Peak Context', format: formatTokens },
  { key: 'compactionEvents', label: 'Compactions', format: (v) => `${v}` },
  { key: 'averageCacheHitRate', label: 'Avg Cache Hit', format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'externalStoreSize', label: 'External Store', format: formatTokens },
  { key: 'totalRetrievalCost', label: 'Retrieval Cost', format: (v) => `$${v.toFixed(4)}` },
]

function formatTokens(v: number): string {
  if (v === 0) return '0'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return `${v}`
}

const GROUP_ORDER: ParamGroup[] = [
  'strategy',
  'conversation-shape',
  'context-compaction',
  'incremental',
  'tool-compression',
  'lossless-retrieval',
  'pricing',
]

const GROUP_LABELS: Record<ParamGroup, string> = {
  strategy: 'Strategy',
  'conversation-shape': 'Conversation Shape',
  'context-compaction': 'Context & Compaction',
  incremental: 'Incremental',
  'tool-compression': 'Tool Compression',
  'lossless-retrieval': 'Lossless & Retrieval',
  pricing: 'Pricing',
}

interface RunDetailCardProps {
  result: SweepRunResult
  onOpenInSimulator: (config: SimulationConfig) => void
}

export function RunDetailCard({ result, onOpenInSimulator }: RunDetailCardProps) {
  const { config, metrics } = result

  // Group params
  const grouped = new Map<ParamGroup, { key: keyof SimulationConfig; label: string; value: string }[]>()
  for (const [key, meta] of Object.entries(PARAM_META) as [keyof SimulationConfig, (typeof PARAM_META)[keyof SimulationConfig]][]) {
    const group = meta.group
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push({
      key,
      label: meta.displayName,
      value: formatConfigValue(key, config[key], meta),
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium">Run #{result.index + 1}</span>
        <Button size="sm" variant="outline" onClick={() => onOpenInSimulator(config)}>
          <ExternalLink className="size-3.5 mr-1.5" />
          Open in Simulator
        </Button>
      </div>

      {/* Metrics summary */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        {METRIC_INFO.map(({ key, label, format }) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums font-medium">{format(metrics[key as keyof SweepMetrics])}</span>
          </div>
        ))}
      </div>

      {/* Config parameters grouped */}
      <div className="max-h-64 overflow-y-auto px-4 py-2 space-y-2">
        {GROUP_ORDER.map((group) => {
          const params = grouped.get(group)
          if (!params) return null
          return (
            <div key={group}>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
                {GROUP_LABELS[group]}
              </div>
              {params.map(({ key, label, value }) => (
                <div key={key} className="flex justify-between text-xs py-px">
                  <span className="text-muted-foreground truncate mr-2">{label}</span>
                  <span className="tabular-nums shrink-0">{value}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatConfigValue(
  _key: keyof SimulationConfig,
  value: SimulationConfig[keyof SimulationConfig],
  meta: (typeof PARAM_META)[keyof SimulationConfig],
): string {
  if (meta.paramKind === 'strategy') return String(value)
  if (meta.paramKind === 'summaryGrowth') return String(value)
  if (meta.paramKind === 'boolean') return value ? 'On' : 'Off'
  const displayVal = (value as number) * meta.displayMultiplier
  if (Number.isInteger(displayVal)) return displayVal.toLocaleString()
  return displayVal.toFixed(2)
}
