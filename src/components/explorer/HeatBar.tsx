import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import type { SweepRunResult } from '@/engine/sweep-types'
import type { SimulationConfig } from '@/engine/types'
import type { MetricKey } from '@/components/explorer/SweepControls'
import { PARAM_META } from '@/engine/sweep-defaults'

// --- Colour scale ---

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Interpolate between green (low) → yellow (mid) → red (high) */
function metricToColor(normalised: number): string {
  const n = Math.max(0, Math.min(1, normalised))
  let r: number, g: number, b: number
  if (n < 0.5) {
    const t = n / 0.5
    // green → yellow
    r = lerp(34, 250, t)
    g = lerp(197, 204, t)
    b = lerp(94, 21, t)
  } else {
    const t = (n - 0.5) / 0.5
    // yellow → red
    r = lerp(250, 239, t)
    g = lerp(204, 68, t)
    b = lerp(21, 68, t)
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

// --- Formatting helpers ---

const METRIC_LABELS: Record<MetricKey, string> = {
  totalCost: 'Total Cost',
  peakContextSize: 'Peak Context',
  compactionEvents: 'Compactions',
  averageCacheHitRate: 'Avg Cache Hit',
  externalStoreSize: 'External Store',
  totalRetrievalCost: 'Retrieval Cost',
}

function formatMetricValue(key: MetricKey, value: number): string {
  switch (key) {
    case 'totalCost':
    case 'totalRetrievalCost':
      return `$${value.toFixed(4)}`
    case 'peakContextSize':
    case 'externalStoreSize':
      return value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M`
        : value >= 1_000
          ? `${(value / 1_000).toFixed(1)}k`
          : `${value}`
    case 'averageCacheHitRate':
      return `${(value * 100).toFixed(1)}%`
    case 'compactionEvents':
      return `${value}`
  }
}

// --- Props ---

interface HeatBarProps {
  results: SweepRunResult[]
  selectedMetric: MetricKey
  selectedIndex: number | null
  onSelect: (index: number) => void
  sweptKeys: (keyof SimulationConfig)[]
}

export function HeatBar({ results, selectedMetric, selectedIndex, onSelect, sweptKeys }: HeatBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom state: [start, end] as fractions 0..1
  const [viewRange, setViewRange] = useState<[number, number]>([0, 1])
  // Drag-to-zoom state
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragCurrent, setDragCurrent] = useState<number | null>(null)
  // Hover state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Compute metric range for normalisation
  const { minVal, maxVal } = useMemo(() => {
    if (results.length === 0) return { minVal: 0, maxVal: 1 }
    const values = results.map((r) => r.metrics[selectedMetric])
    return { minVal: Math.min(...values), maxVal: Math.max(...values) }
  }, [results, selectedMetric])

  const normalise = useCallback(
    (value: number) => {
      if (maxVal === minVal) return 0.5
      return (value - minVal) / (maxVal - minVal)
    },
    [minVal, maxVal],
  )

  // Visible results based on zoom
  const visibleRange = useMemo(() => {
    const total = results.length
    const start = Math.floor(viewRange[0] * total)
    const end = Math.ceil(viewRange[1] * total)
    return { start, end, count: end - start }
  }, [results.length, viewRange])

  // Draw the heat bar
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || results.length === 0) return

    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = 48

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const { start, count } = visibleRange
    if (count === 0) return

    const segmentWidth = width / count

    for (let i = 0; i < count; i++) {
      const result = results[start + i]
      const val = normalise(result.metrics[selectedMetric])
      ctx.fillStyle = metricToColor(val)
      const x = Math.floor(i * segmentWidth)
      const w = Math.ceil((i + 1) * segmentWidth) - x
      ctx.fillRect(x, 0, w, height)
    }

    // Draw selection indicator
    if (selectedIndex !== null && selectedIndex >= start && selectedIndex < start + count) {
      const i = selectedIndex - start
      const x = Math.floor(i * segmentWidth)
      const w = Math.ceil((i + 1) * segmentWidth) - x
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, 1, w - 2, height - 2)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1
      ctx.strokeRect(x, 0, w, height)
    }

    // Draw drag selection overlay
    if (dragStart !== null && dragCurrent !== null) {
      const left = Math.min(dragStart, dragCurrent)
      const right = Math.max(dragStart, dragCurrent)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'
      ctx.fillRect(left, 0, right - left, height)
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(left, 0, right - left, height)
    }
  }, [results, selectedMetric, selectedIndex, visibleRange, normalise, dragStart, dragCurrent])

  // Pixel position → result index
  const pixelToIndex = useCallback(
    (clientX: number): number | null => {
      const canvas = canvasRef.current
      if (!canvas || results.length === 0) return null
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const width = rect.width
      const { start, count } = visibleRange
      const i = Math.floor((x / width) * count)
      if (i < 0 || i >= count) return null
      return start + i
    },
    [results.length, visibleRange],
  )

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const idx = pixelToIndex(e.clientX)
      setHoverIndex(idx)
      setTooltipPos({ x: e.clientX, y: e.clientY })

      if (dragStart !== null) {
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          setDragCurrent(e.clientX - rect.left)
        }
      }
    },
    [pixelToIndex, dragStart],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      setDragStart(e.clientX - rect.left)
      setDragCurrent(e.clientX - rect.left)
    },
    [],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas || dragStart === null) return
      const rect = canvas.getBoundingClientRect()
      const end = e.clientX - rect.left
      const width = rect.width

      const startFrac = Math.min(dragStart, end) / width
      const endFrac = Math.max(dragStart, end) / width

      // If drag is very small, treat as click
      if (Math.abs(dragStart - end) < 3) {
        const idx = pixelToIndex(e.clientX)
        if (idx !== null) onSelect(idx)
      } else {
        // Zoom into the dragged range
        const [vStart, vEnd] = viewRange
        const span = vEnd - vStart
        setViewRange([vStart + startFrac * span, vStart + endFrac * span])
      }

      setDragStart(null)
      setDragCurrent(null)
    },
    [dragStart, pixelToIndex, onSelect, viewRange],
  )

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null)
    if (dragStart !== null) {
      setDragStart(null)
      setDragCurrent(null)
    }
  }, [dragStart])

  // Scroll wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mouseX = (e.clientX - rect.left) / rect.width // 0..1 within canvas

      const [vStart, vEnd] = viewRange
      const span = vEnd - vStart
      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8 // scroll down = zoom out

      const newSpan = Math.min(1, Math.max(0.01, span * zoomFactor))
      // Keep the mouse position anchored
      let newStart = vStart + mouseX * (span - newSpan)
      let newEnd = newStart + newSpan
      // Clamp
      if (newStart < 0) {
        newStart = 0
        newEnd = newSpan
      }
      if (newEnd > 1) {
        newEnd = 1
        newStart = 1 - newSpan
      }
      setViewRange([newStart, newEnd])
    },
    [viewRange],
  )

  // Reset zoom
  const handleDoubleClick = useCallback(() => {
    setViewRange([0, 1])
  }, [])

  // Tooltip content
  const hoveredResult = hoverIndex !== null ? results[hoverIndex] : null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{results.length.toLocaleString()} runs</span>
        {viewRange[0] > 0 || viewRange[1] < 1 ? (
          <button
            onClick={() => setViewRange([0, 1])}
            className="text-blue-500 hover:text-blue-400 underline"
          >
            Reset zoom
          </button>
        ) : (
          <span>Drag to zoom · Scroll to zoom · Double-click to reset</span>
        )}
      </div>
      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair rounded"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        />

        {/* Tooltip */}
        {hoveredResult && (
          <div
            className="pointer-events-none fixed z-50 rounded border border-border bg-card px-3 py-2 text-xs shadow-lg"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 8,
            }}
          >
            <div className="font-medium mb-1">
              Run #{hoveredResult.index + 1}
            </div>
            {/* Show swept param values */}
            {sweptKeys.map((key) => (
              <div key={key} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{PARAM_META[key].displayName}:</span>
                <span className="tabular-nums">{formatParamValue(key, hoveredResult.config[key])}</span>
              </div>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              {(Object.keys(hoveredResult.metrics) as MetricKey[]).map((mk) => (
                <div key={mk} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{METRIC_LABELS[mk]}:</span>
                  <span className="tabular-nums font-medium">{formatMetricValue(mk, hoveredResult.metrics[mk])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Colour scale legend */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatMetricValue(selectedMetric, minVal)}</span>
        <div className="flex-1 h-2 rounded" style={{
          background: 'linear-gradient(to right, rgb(34,197,94), rgb(250,204,21), rgb(239,68,68))',
        }} />
        <span>{formatMetricValue(selectedMetric, maxVal)}</span>
      </div>
    </div>
  )
}

function formatParamValue(key: keyof SimulationConfig, value: SimulationConfig[keyof SimulationConfig]): string {
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') return String(value)
  if (meta.paramKind === 'summaryGrowth') return String(value)
  if (meta.paramKind === 'boolean') return value ? 'On' : 'Off'
  const numMeta = meta
  const displayVal = (value as number) * numMeta.displayMultiplier
  if (Number.isInteger(displayVal)) return displayVal.toLocaleString()
  return displayVal.toFixed(2)
}
