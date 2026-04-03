import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SimulationConfig, StrategyType, SummaryGrowthModel } from '@/engine/types'
import { PARAM_META, type NumericParamMeta } from '@/engine/sweep-defaults'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface ParameterPanelProps {
  config: SimulationConfig
  onUpdate: <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => void
}

function meta(key: keyof SimulationConfig): NumericParamMeta {
  return PARAM_META[key] as NumericParamMeta
}

// --- Slider + Input control ---

interface SliderInputProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

function SliderInput({ label, value, min, max, step = 1, onChange }: SliderInputProps) {
  const [localText, setLocalText] = useState(String(value))
  const [localNumeric, setLocalNumeric] = useState(value)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Sync local values when prop changes (e.g. from external reset)
  useEffect(() => {
    setLocalText(String(value))
    setLocalNumeric(value)
  }, [value])

  const handleSliderChange = useCallback(
    (newValue: number | readonly number[]) => {
      const v = Array.isArray(newValue) ? newValue[0] : newValue
      setLocalNumeric(v)
      setLocalText(String(v))
      // Debounce config updates to avoid re-running simulation on every drag tick
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => onChange(v), 150)
    },
    [onChange],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalText(e.target.value)
    },
    [],
  )

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(localText)
    if (isNaN(parsed)) {
      setLocalText(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setLocalText(String(clamped))
    setLocalNumeric(clamped)
    onChange(clamped)
  }, [localText, value, min, max, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur()
      }
    },
    [],
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          type="text"
          value={localText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className="h-6 w-20 text-right text-xs tabular-nums"
        />
      </div>
      <Slider
        value={[localNumeric]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleSliderChange}
      />
    </div>
  )
}

// --- Number-only input control ---

interface NumberInputProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

function NumberInput({ label, value, min, max, step = 1, onChange }: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value))

  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value)
    },
    [],
  )

  const handleBlur = useCallback(() => {
    const parsed = parseFloat(localValue)
    if (isNaN(parsed)) {
      setLocalValue(String(value))
      return
    }
    // Round to step precision to avoid floating point artifacts
    const precision = step < 1 ? String(step).split('.')[1]?.length ?? 0 : 0
    const clamped = Math.min(max, Math.max(min, parseFloat(parsed.toFixed(precision))))
    setLocalValue(String(clamped))
    onChange(clamped)
  }, [localValue, value, min, max, step, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur()
      }
    },
    [],
  )

  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-6 w-20 text-right text-xs tabular-nums"
      />
    </div>
  )
}

// --- Strategy select (deferred update) ---

interface StrategySelectProps {
  value: StrategyType
  onChange: (value: StrategyType) => void
}

function StrategySelect({ value, onChange }: StrategySelectProps) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  const handleChange = useCallback(
    (v: string | null) => {
      if (v === null) return
      const typed = v as StrategyType
      setLocal(typed)
      // Defer config update so React paints the select change before simulation runs
      setTimeout(() => onChange(typed), 0)
    },
    [onChange],
  )

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Primary strategy</Label>
      <Select value={local} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="full-compaction" className="text-xs">1 — Full compaction</SelectItem>
          <SelectItem value="incremental" className="text-xs">2 — Incremental compaction</SelectItem>
          <SelectItem value="lossless-append" className="text-xs">4a — Lossless append-only</SelectItem>
          <SelectItem value="lossless-hierarchical" className="text-xs">4b — Lossless hierarchical</SelectItem>
          <SelectItem value="lossless-tool-results" className="text-xs">4c — Tool-results-only lossless</SelectItem>
          <SelectItem value="lcm-subagent" className="text-xs">4d — LCM sub-agent retrieval</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// --- Summary growth model select (deferred update) ---

interface SummaryGrowthSelectProps {
  value: SummaryGrowthModel
  onChange: (value: SummaryGrowthModel) => void
}

function SummaryGrowthSelect({ value, onChange }: SummaryGrowthSelectProps) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  const handleChange = useCallback(
    (v: string | null) => {
      if (v === null) return
      const typed = v as SummaryGrowthModel
      setLocal(typed)
      setTimeout(() => onChange(typed), 0)
    },
    [onChange],
  )

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Summary growth model</Label>
      <Select value={local} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fixed" className="text-xs">Fixed (convergent)</SelectItem>
          <SelectItem value="logarithmic" className="text-xs">Logarithmic growth</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// --- Deferred switch ---

interface DeferredSwitchProps {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}

function DeferredSwitch({ label, checked, onChange }: DeferredSwitchProps) {
  const [local, setLocal] = useState(checked)

  useEffect(() => {
    setLocal(checked)
  }, [checked])

  const handleChange = useCallback(
    (v: boolean) => {
      setLocal(v)
      // Defer config update so React paints the toggle before simulation runs
      setTimeout(() => onChange(v), 0)
    },
    [onChange],
  )

  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch checked={local} onCheckedChange={handleChange} />
    </div>
  )
}

// --- Section header ---

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
      {children}
      <ChevronDown className="size-3.5 transition-transform [[data-panel-open]_&]:rotate-180" />
    </CollapsibleTrigger>
  )
}

// --- Helpers for display-unit conversion ---

function toDisplay(key: keyof SimulationConfig, configValue: number): number {
  const m = meta(key)
  if (m.displayMultiplier === 1) return configValue
  return parseFloat((configValue * m.displayMultiplier).toFixed(2))
}

function fromDisplay(key: keyof SimulationConfig, displayValue: number): number {
  const m = meta(key)
  return displayValue / m.displayMultiplier
}

// --- Main panel ---

export function ParameterPanel({ config, onUpdate }: ParameterPanelProps) {
  // Shorthand for a SliderInput bound to a config key (with display-unit conversion)
  const slider = (key: keyof SimulationConfig & string) => {
    const m = meta(key)
    return (
      <SliderInput
        label={m.displayName}
        value={toDisplay(key, config[key] as number)}
        min={m.uiMin}
        max={m.uiMax}
        step={m.uiStep}
        onChange={(v) => onUpdate(key, fromDisplay(key, v) as SimulationConfig[typeof key])}
      />
    )
  }

  // Shorthand for a NumberInput bound to a config key (with display-unit conversion)
  const numberInput = (key: keyof SimulationConfig & string) => {
    const m = meta(key)
    return (
      <NumberInput
        label={m.displayName}
        value={toDisplay(key, config[key] as number)}
        min={m.uiMin}
        max={m.uiMax}
        step={m.uiStep}
        onChange={(v) => onUpdate(key, fromDisplay(key, v) as SimulationConfig[typeof key])}
      />
    )
  }

  return (
    <div className="space-y-1 p-4">
      <h2 className="text-sm font-semibold mb-3">Parameters</h2>

      {/* Strategy */}
      <Collapsible defaultOpen>
        <SectionHeader>Strategy</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            <StrategySelect
              value={config.selectedStrategy}
              onChange={(v) => onUpdate('selectedStrategy', v)}
            />

            {(config.selectedStrategy === 'incremental' || config.selectedStrategy === 'lossless-append' || config.selectedStrategy === 'lossless-hierarchical' || config.selectedStrategy === 'lossless-tool-results' || config.selectedStrategy === 'lcm-subagent') && (
              <>
                {slider('incrementalInterval')}
                {slider('summaryAccumulationThreshold')}
              </>
            )}

            {(config.selectedStrategy === 'lossless-append' || config.selectedStrategy === 'lossless-hierarchical' || config.selectedStrategy === 'lossless-tool-results' || config.selectedStrategy === 'lcm-subagent') && (
              <>
                {numberInput('pRetrieveMax')}
                {slider('compressedTokensCap')}
                {numberInput('retrievalQueryTokens')}
                {numberInput('retrievalResponseTokens')}
              </>
            )}

            {config.selectedStrategy === 'lcm-subagent' && (
              <>
                {numberInput('lcmGrepRatio')}
                {numberInput('lcmGrepResponseTokens')}
              </>
            )}

            <DeferredSwitch
              label={PARAM_META.toolCompressionEnabled.displayName}
              checked={config.toolCompressionEnabled}
              onChange={(v) => onUpdate('toolCompressionEnabled', v)}
            />

            {config.toolCompressionEnabled && slider('toolCompressionRatio')}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Conversation Shape */}
      <Collapsible defaultOpen>
        <SectionHeader>Conversation Shape</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            {numberInput('toolCallCycles')}
            {slider('toolCallSize')}
            {slider('toolResultSize')}
            {slider('assistantMessageSize')}
            {slider('reasoningOutputSize')}
            {numberInput('userMessageFrequency')}
            {slider('userMessageSize')}
            {slider('systemPromptSize')}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Context & Compaction */}
      <Collapsible defaultOpen>
        <SectionHeader>Context &amp; Compaction</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            {slider('contextWindow')}
            {slider('compactionThreshold')}
            {slider('compressionRatio')}

            <SummaryGrowthSelect
              value={config.summaryGrowthModel}
              onChange={(v) => onUpdate('summaryGrowthModel', v)}
            />
            {config.summaryGrowthModel === 'logarithmic' && slider('summaryGrowthCoefficient')}

            {numberInput('cacheReliability')}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Pricing */}
      <Collapsible defaultOpen>
        <SectionHeader>Pricing</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            {numberInput('baseInputPrice')}
            {numberInput('outputPrice')}
            {numberInput('cacheWriteMultiplier')}
            {numberInput('cacheHitMultiplier')}
            {numberInput('minCacheableTokens')}
            {numberInput('compactionInputPrice')}
            {numberInput('compactionOutputPrice')}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
