import { useState, useCallback, useEffect, useRef } from 'react'
import { GripVertical, ChevronDown, Lock, Unlock } from 'lucide-react'
import type { SimulationConfig, StrategyType, SummaryGrowthModel } from '@/engine/types'
import { DEFAULT_CONFIG } from '@/engine/types'
import type { SweepConfig, SweepParameterDef, NumericSweepRange, ParamScale, SummaryGrowthSweepRange } from '@/engine/sweep-types'
import { PARAM_META, type ParamGroup, type NumericParamMeta } from '@/engine/sweep-defaults'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// --- Types ---

interface SweepParameterPanelProps {
  config: SweepConfig
  onChange: (config: SweepConfig) => void
}

// All strategy options
const STRATEGY_OPTIONS: { value: StrategyType; label: string }[] = [
  { value: 'full-compaction', label: '1 — Full compaction' },
  { value: 'incremental', label: '2 — Incremental' },
  { value: 'lossless-append', label: '4a — Lossless append' },
  { value: 'lossless-hierarchical', label: '4b — Lossless hierarchical' },
  { value: 'lossless-tool-results', label: '4c — Tool-results lossless' },
  { value: 'lcm-subagent', label: '4d — LCM sub-agent' },
]

// All summary growth model options
const SUMMARY_GROWTH_OPTIONS: { value: SummaryGrowthModel; label: string }[] = [
  { value: 'fixed', label: 'Fixed (convergent)' },
  { value: 'logarithmic', label: 'Logarithmic growth' },
]

// Group display order and labels
const GROUP_ORDER: { key: ParamGroup; label: string }[] = [
  { key: 'strategy', label: 'Strategy' },
  { key: 'conversation-shape', label: 'Conversation Shape' },
  { key: 'context-compaction', label: 'Context & Compaction' },
  { key: 'incremental', label: 'Incremental' },
  { key: 'tool-compression', label: 'Tool Compression' },
  { key: 'lossless-retrieval', label: 'Lossless Retrieval' },
  { key: 'pricing', label: 'Pricing' },
]

// --- Helpers ---

function getParamsByGroup(bucket: 'fixed' | 'swept', config: SweepConfig): Map<ParamGroup, (keyof SimulationConfig)[]> {
  const result = new Map<ParamGroup, (keyof SimulationConfig)[]>()
  for (const [key, def] of Object.entries(config) as [keyof SimulationConfig, SweepParameterDef][]) {
    const meta = PARAM_META[key]
    const inBucket = bucket === 'fixed' ? def.kind === 'fixed' : def.kind === 'swept'
    if (!inBucket) continue
    const existing = result.get(meta.group) ?? []
    existing.push(key)
    result.set(meta.group, existing)
  }
  return result
}

function getStepCount(key: keyof SimulationConfig, def: SweepParameterDef): number {
  if (def.kind === 'fixed') return 1
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') return (def as { values: StrategyType[] }).values.length
  if (meta.paramKind === 'summaryGrowth') return (def as { values: SummaryGrowthModel[] }).values.length
  if (meta.paramKind === 'boolean') return 2
  return (def as NumericSweepRange).steps
}

/** Convert a fixed param def to a swept one using PARAM_META defaults */
function toSwept(key: keyof SimulationConfig): SweepParameterDef {
  const meta = PARAM_META[key]
  if (meta.paramKind === 'strategy') {
    return { kind: 'swept', values: STRATEGY_OPTIONS.map((o) => o.value) }
  }
  if (meta.paramKind === 'summaryGrowth') {
    return { kind: 'swept', values: SUMMARY_GROWTH_OPTIONS.map((o) => o.value) }
  }
  if (meta.paramKind === 'boolean') {
    return { kind: 'swept' }
  }
  const nm = meta as NumericParamMeta
  return {
    kind: 'swept',
    min: nm.defaultSweepMin,
    max: nm.defaultSweepMax,
    steps: nm.defaultSweepSteps,
    scale: nm.defaultSweepScale,
  }
}

/** Convert a swept param def to fixed using DEFAULT_CONFIG */
function toFixed(key: keyof SimulationConfig): SweepParameterDef {
  return { kind: 'fixed', value: DEFAULT_CONFIG[key] }
}

// Display-unit helpers (same as ParameterPanel)
function toDisplay(key: keyof SimulationConfig, configValue: number): number {
  const m = PARAM_META[key] as NumericParamMeta
  if (m.displayMultiplier === 1) return configValue
  return parseFloat((configValue * m.displayMultiplier).toFixed(2))
}

function fromDisplay(key: keyof SimulationConfig, displayValue: number): number {
  const m = PARAM_META[key] as NumericParamMeta
  return displayValue / m.displayMultiplier
}

// --- Sub-components ---

/** Inline range editor for a swept numeric parameter */
function NumericRangeEditor({
  paramKey,
  def,
  onChange,
}: {
  paramKey: keyof SimulationConfig
  def: NumericSweepRange
  onChange: (def: NumericSweepRange) => void
}) {
  const m = PARAM_META[paramKey] as NumericParamMeta
  const minDisplay = toDisplay(paramKey, def.min)
  const maxDisplay = toDisplay(paramKey, def.max)

  return (
    <div className="mt-1.5 space-y-1.5 pl-5">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-8 text-muted-foreground">Min</span>
        <DebouncedInput
          value={minDisplay}
          min={m.uiMin}
          max={maxDisplay}
          step={m.uiStep}
          onChange={(v) => onChange({ ...def, min: fromDisplay(paramKey, v) })}
        />
        <span className="w-8 text-muted-foreground">Max</span>
        <DebouncedInput
          value={maxDisplay}
          min={minDisplay}
          max={m.uiMax}
          step={m.uiStep}
          onChange={(v) => onChange({ ...def, max: fromDisplay(paramKey, v) })}
        />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-12 text-muted-foreground">Steps</span>
        <DebouncedInput
          value={def.steps}
          min={2}
          max={50}
          step={1}
          onChange={(v) => onChange({ ...def, steps: Math.round(v) })}
        />
        <Select value={def.scale} onValueChange={(v) => onChange({ ...def, scale: v as ParamScale })}>
          <SelectTrigger className="h-6 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear" className="text-xs">Lin</SelectItem>
            <SelectItem value="log" className="text-xs">Log</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** Strategy sweep editor — checkboxes for which strategies to include */
function StrategySweepEditor({
  values,
  onChange,
}: {
  values: StrategyType[]
  onChange: (values: StrategyType[]) => void
}) {
  return (
    <div className="mt-1.5 space-y-1 pl-5">
      {STRATEGY_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={values.includes(opt.value)}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...values, opt.value])
              } else {
                const next = values.filter((v) => v !== opt.value)
                if (next.length > 0) onChange(next)
              }
            }}
            className="size-3.5 rounded border-border accent-foreground"
          />
          <span className="text-muted-foreground">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

/** Inline editor for a fixed parameter value */
function FixedValueEditor({
  paramKey,
  value,
  onChange,
}: {
  paramKey: keyof SimulationConfig
  value: number | string | boolean
  onChange: (value: number | string | boolean) => void
}) {
  const meta = PARAM_META[paramKey]
  if (meta.paramKind === 'strategy') {
    return (
      <Select value={value as string} onValueChange={(v) => { if (v) onChange(v) }}>
        <SelectTrigger className="h-6 w-auto max-w-[180px] text-xs text-muted-foreground border-none shadow-none px-1 hover:bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STRATEGY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (meta.paramKind === 'summaryGrowth') {
    return (
      <Select value={value as string} onValueChange={(v) => { if (v) onChange(v) }}>
        <SelectTrigger className="h-6 w-auto max-w-[180px] text-xs text-muted-foreground border-none shadow-none px-1 hover:bg-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUMMARY_GROWTH_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (meta.paramKind === 'boolean') {
    return (
      <button
        onClick={() => onChange(!value)}
        className="text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1 py-0.5 transition-colors cursor-pointer"
      >
        {value ? 'On' : 'Off'}
      </button>
    )
  }
  const m = meta as NumericParamMeta
  const display = toDisplay(paramKey, value as number)
  return (
    <DebouncedInput
      value={display}
      min={m.uiMin}
      max={m.uiMax}
      step={m.uiStep}
      onChange={(v) => onChange(fromDisplay(paramKey, v))}
    />
  )
}

/** A small debounced number input */
function DebouncedInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(String(value))
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    setLocal(String(value))
  }, [value])

  const handleBlur = useCallback(() => {
    const parsed = parseFloat(local)
    if (isNaN(parsed)) {
      setLocal(String(value))
      return
    }
    const precision = step < 1 ? String(step).split('.')[1]?.length ?? 0 : 0
    const clamped = Math.min(max, Math.max(min, parseFloat(parsed.toFixed(precision))))
    setLocal(String(clamped))
    onChange(clamped)
  }, [local, value, min, max, step, onChange])

  return (
    <Input
      type="text"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          const parsed = parseFloat(e.target.value)
          if (!isNaN(parsed)) {
            const clamped = Math.min(max, Math.max(min, parsed))
            onChange(clamped)
          }
        }, 300)
      }}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="h-6 w-16 text-right text-xs tabular-nums"
    />
  )
}

/** A single parameter row — draggable, with toggle button and inline editor */
function ParamRow({
  paramKey,
  def,
  onToggle,
  onUpdate,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  paramKey: keyof SimulationConfig
  def: SweepParameterDef
  onToggle: () => void
  onUpdate: (def: SweepParameterDef) => void
  onDragStart: (e: React.DragEvent, key: keyof SimulationConfig) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const meta = PARAM_META[paramKey]
  const isSwept = def.kind === 'swept'
  const steps = getStepCount(paramKey, def)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, paramKey)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded border border-transparent hover:border-border transition-colors"
    >
      <div className="flex items-center gap-1 py-1 px-1">
        <GripVertical className="size-3 shrink-0 text-muted-foreground/50 cursor-grab" />
        <button
          onClick={onToggle}
          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
          title={isSwept ? 'Fix this parameter' : 'Sweep this parameter'}
        >
          {isSwept ? (
            <Unlock className="size-3 text-blue-500" />
          ) : (
            <Lock className="size-3 text-muted-foreground" />
          )}
        </button>
        <span className="flex-1 text-xs truncate">{meta.displayName}</span>
        {isSwept && (
          <span className="shrink-0 text-[10px] tabular-nums text-blue-500 font-medium">{steps}</span>
        )}
        {!isSwept && (
          <FixedValueEditor
            paramKey={paramKey}
            value={(def as { value: unknown }).value as number | string | boolean}
            onChange={(v) => onUpdate({ kind: 'fixed', value: v } as SweepParameterDef)}
          />
        )}
      </div>

      {/* Swept parameter editors */}
      {isSwept && meta.paramKind === 'numeric' && (
        <NumericRangeEditor
          paramKey={paramKey}
          def={def as NumericSweepRange}
          onChange={(d) => onUpdate(d)}
        />
      )}
      {isSwept && meta.paramKind === 'strategy' && (
        <StrategySweepEditor
          values={(def as { values: StrategyType[] }).values}
          onChange={(values) => onUpdate({ kind: 'swept', values })}
        />
      )}
      {isSwept && meta.paramKind === 'summaryGrowth' && (
        <div className="mt-1.5 space-y-1 pl-5">
          {SUMMARY_GROWTH_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={(def as SummaryGrowthSweepRange).values.includes(opt.value)}
                onChange={(e) => {
                  const current = (def as SummaryGrowthSweepRange).values
                  if (e.target.checked) {
                    onUpdate({ kind: 'swept', values: [...current, opt.value] })
                  } else {
                    const next = current.filter((v) => v !== opt.value)
                    if (next.length > 0) onUpdate({ kind: 'swept', values: next })
                  }
                }}
                className="size-3.5 rounded border-border accent-foreground"
              />
              <span className="text-muted-foreground">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
      {isSwept && meta.paramKind === 'boolean' && (
        <div className="mt-0.5 pl-5">
          <span className="text-[10px] text-muted-foreground">Auto: [false, true]</span>
        </div>
      )}
    </div>
  )
}

// --- Section header ---

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <CollapsibleTrigger className="flex w-full items-center justify-between py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
      {children}
      <ChevronDown className="size-3.5 transition-transform [[data-panel-open]_&]:rotate-180" />
    </CollapsibleTrigger>
  )
}

// --- Main component ---

export function SweepParameterPanel({ config, onChange }: SweepParameterPanelProps) {
  const [dragKey, setDragKey] = useState<keyof SimulationConfig | null>(null)

  const updateParam = useCallback(
    (key: keyof SimulationConfig, def: SweepParameterDef) => {
      onChange({ ...config, [key]: def })
    },
    [config, onChange],
  )

  const toggleParam = useCallback(
    (key: keyof SimulationConfig) => {
      const current = config[key]
      if (current.kind === 'fixed') {
        onChange({ ...config, [key]: toSwept(key) })
      } else {
        onChange({ ...config, [key]: toFixed(key) })
      }
    },
    [config, onChange],
  )

  const handleDragStart = useCallback((e: React.DragEvent, key: keyof SimulationConfig) => {
    setDragKey(key)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDropOnBucket = useCallback(
    (targetBucket: 'fixed' | 'swept') => (e: React.DragEvent) => {
      e.preventDefault()
      const key = e.dataTransfer.getData('text/plain') as keyof SimulationConfig
      if (!key) return
      const current = config[key]
      const currentBucket = current.kind === 'fixed' ? 'fixed' : 'swept'
      if (currentBucket !== targetBucket) {
        toggleParam(key)
      }
      setDragKey(null)
    },
    [config, toggleParam],
  )

  // Gather params by bucket
  const fixedByGroup = getParamsByGroup('fixed', config)
  const sweptByGroup = getParamsByGroup('swept', config)

  const sweptKeys = (Object.keys(config) as (keyof SimulationConfig)[]).filter(
    (k) => config[k].kind === 'swept',
  )
  const hasSwept = sweptKeys.length > 0

  return (
    <div className="space-y-1 p-4">
      <h2 className="text-sm font-semibold mb-3">Sweep Parameters</h2>

      {/* Swept bucket */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDropOnBucket('swept')}
        className={`rounded-lg border-2 border-dashed p-2 transition-colors min-h-[48px] ${
          dragKey && config[dragKey].kind === 'fixed'
            ? 'border-blue-400 bg-blue-500/5'
            : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Swept</span>
          {hasSwept && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {sweptKeys.length} param{sweptKeys.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {!hasSwept && (
          <p className="text-[10px] text-muted-foreground py-2 text-center">
            Drag parameters here to sweep them
          </p>
        )}
        {GROUP_ORDER.map(({ key: groupKey, label }) => {
          const keys = sweptByGroup.get(groupKey)
          if (!keys || keys.length === 0) return null
          return (
            <Collapsible key={groupKey} defaultOpen>
              <SectionHeader>{label}</SectionHeader>
              <CollapsibleContent>
                <div className="space-y-0.5 pb-2">
                  {keys.map((k) => (
                    <ParamRow
                      key={k}
                      paramKey={k}
                      def={config[k]}
                      onToggle={() => toggleParam(k)}
                      onUpdate={(d) => updateParam(k, d)}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDropOnBucket('swept')}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>

      {/* Fixed bucket */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDropOnBucket('fixed')}
        className={`rounded-lg border-2 border-dashed p-2 transition-colors ${
          dragKey && config[dragKey].kind === 'swept'
            ? 'border-muted-foreground/50 bg-muted/30'
            : 'border-border'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fixed</span>
        </div>
        {GROUP_ORDER.map(({ key: groupKey, label }) => {
          const keys = fixedByGroup.get(groupKey)
          if (!keys || keys.length === 0) return null
          return (
            <Collapsible key={groupKey} defaultOpen={groupKey === 'strategy' || groupKey === 'conversation-shape'}>
              <SectionHeader>{label}</SectionHeader>
              <CollapsibleContent>
                <div className="space-y-0.5 pb-2">
                  {keys.map((k) => (
                    <ParamRow
                      key={k}
                      paramKey={k}
                      def={config[k]}
                      onToggle={() => toggleParam(k)}
                      onUpdate={(d) => updateParam(k, d)}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDropOnBucket('fixed')}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
