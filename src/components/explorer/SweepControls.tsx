import { Play, Square } from 'lucide-react'
import type { SweepMetrics } from '@/engine/sweep-types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type MetricKey = keyof SweepMetrics

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: 'totalCost', label: 'Total Cost' },
  { value: 'peakContextSize', label: 'Peak Context Size' },
  { value: 'compactionEvents', label: 'Compaction Events' },
  { value: 'averageCacheHitRate', label: 'Avg Cache Hit Rate' },
  { value: 'externalStoreSize', label: 'External Store Size' },
  { value: 'totalRetrievalCost', label: 'Retrieval Cost' },
]

interface SweepControlsProps {
  totalCombinations: number
  isRunning: boolean
  progress: number // 0..1
  selectedMetric: MetricKey
  onMetricChange: (metric: MetricKey) => void
  onRun: () => void
  onCancel: () => void
}

export function SweepControls({
  totalCombinations,
  isRunning,
  progress,
  selectedMetric,
  onMetricChange,
  onRun,
  onCancel,
}: SweepControlsProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Run / Cancel */}
      {isRunning ? (
        <Button size="sm" variant="destructive" onClick={onCancel}>
          <Square className="size-3.5 mr-1.5" />
          Cancel
        </Button>
      ) : (
        <Button size="sm" onClick={onRun} disabled={totalCombinations === 0}>
          <Play className="size-3.5 mr-1.5" />
          Run {totalCombinations > 0 && `(${totalCombinations.toLocaleString()})`}
        </Button>
      )}

      {/* Progress bar */}
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
        {Math.round(progress * 100)}%
      </span>

      {/* Metric selector */}
      <Select value={selectedMetric} onValueChange={(v) => onMetricChange(v as MetricKey)}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METRIC_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
