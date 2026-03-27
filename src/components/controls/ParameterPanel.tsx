import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SimulationConfig } from '@/engine/types'
import type { StrategyType } from '@/engine/types'
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

// --- Main panel ---

export function ParameterPanel({ config, onUpdate }: ParameterPanelProps) {
  // Pricing helpers: config stores per-token prices, UI shows $/M
  const toPerMillion = (perToken: number) => parseFloat((perToken * 1_000_000).toFixed(2))
  const fromPerMillion = (perMillion: number) => perMillion / 1_000_000

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

            {(config.selectedStrategy === 'incremental' || config.selectedStrategy === 'lossless-append' || config.selectedStrategy === 'lossless-hierarchical' || config.selectedStrategy === 'lossless-tool-results') && (
              <>
                <SliderInput
                  label="Incremental interval (tokens)"
                  value={config.incrementalInterval}
                  min={5000}
                  max={100000}
                  step={1000}
                  onChange={(v) => onUpdate('incrementalInterval', v)}
                />
                <SliderInput
                  label="Summary accumulation threshold (tokens)"
                  value={config.summaryAccumulationThreshold}
                  min={10000}
                  max={200000}
                  step={5000}
                  onChange={(v) => onUpdate('summaryAccumulationThreshold', v)}
                />
              </>
            )}

            {(config.selectedStrategy === 'lossless-append' || config.selectedStrategy === 'lossless-hierarchical' || config.selectedStrategy === 'lossless-tool-results') && (
              <>
                <NumberInput
                  label="pRetrieve max"
                  value={config.pRetrieveMax}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => onUpdate('pRetrieveMax', v)}
                />
                <SliderInput
                  label="Compressed tokens cap"
                  value={config.compressedTokensCap}
                  min={10000}
                  max={500000}
                  step={10000}
                  onChange={(v) => onUpdate('compressedTokensCap', v)}
                />
                <NumberInput
                  label="Retrieval query tokens"
                  value={config.retrievalQueryTokens}
                  min={100}
                  max={5000}
                  onChange={(v) => onUpdate('retrievalQueryTokens', v)}
                />
                <NumberInput
                  label="Retrieval response tokens"
                  value={config.retrievalResponseTokens}
                  min={100}
                  max={5000}
                  onChange={(v) => onUpdate('retrievalResponseTokens', v)}
                />
              </>
            )}

            <DeferredSwitch
              label="Tool result compression"
              checked={config.toolCompressionEnabled}
              onChange={(v) => onUpdate('toolCompressionEnabled', v)}
            />

            {config.toolCompressionEnabled && (
              <SliderInput
                label="Tool compression ratio (X:1)"
                value={config.toolCompressionRatio}
                min={2}
                max={20}
                onChange={(v) => onUpdate('toolCompressionRatio', v)}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Conversation Shape */}
      <Collapsible defaultOpen>
        <SectionHeader>Conversation Shape</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            <NumberInput
              label="Tool call cycles"
              value={config.toolCallCycles}
              min={1}
              max={500}
              onChange={(v) => onUpdate('toolCallCycles', v)}
            />
            <SliderInput
              label="Tool call size (tokens)"
              value={config.toolCallSize}
              min={10}
              max={2000}
              onChange={(v) => onUpdate('toolCallSize', v)}
            />
            <SliderInput
              label="Tool result size (tokens)"
              value={config.toolResultSize}
              min={100}
              max={50000}
              step={100}
              onChange={(v) => onUpdate('toolResultSize', v)}
            />
            <SliderInput
              label="Assistant message size (tokens)"
              value={config.assistantMessageSize}
              min={10}
              max={5000}
              onChange={(v) => onUpdate('assistantMessageSize', v)}
            />
            <SliderInput
              label="Reasoning output size (tokens)"
              value={config.reasoningOutputSize}
              min={0}
              max={10000}
              onChange={(v) => onUpdate('reasoningOutputSize', v)}
            />
            <NumberInput
              label="User msg frequency (every N cycles)"
              value={config.userMessageFrequency}
              min={1}
              max={100}
              onChange={(v) => onUpdate('userMessageFrequency', v)}
            />
            <SliderInput
              label="User message size (tokens)"
              value={config.userMessageSize}
              min={10}
              max={5000}
              onChange={(v) => onUpdate('userMessageSize', v)}
            />
            <SliderInput
              label="System prompt size (tokens)"
              value={config.systemPromptSize}
              min={100}
              max={50000}
              step={100}
              onChange={(v) => onUpdate('systemPromptSize', v)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Context & Compaction */}
      <Collapsible defaultOpen>
        <SectionHeader>Context &amp; Compaction</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            <SliderInput
              label="Context window (tokens)"
              value={config.contextWindow}
              min={10000}
              max={2000000}
              step={10000}
              onChange={(v) => onUpdate('contextWindow', v)}
            />
            <SliderInput
              label="Compaction threshold (%)"
              value={Math.round(config.compactionThreshold * 100)}
              min={50}
              max={99}
              onChange={(v) => onUpdate('compactionThreshold', v / 100)}
            />
            <SliderInput
              label="Compression ratio (X:1)"
              value={config.compressionRatio}
              min={1.1}
              max={50}
              step={0.1}
              onChange={(v) => onUpdate('compressionRatio', v)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Pricing */}
      <Collapsible defaultOpen>
        <SectionHeader>Pricing</SectionHeader>
        <CollapsibleContent>
          <div className="space-y-3 pb-4">
            <NumberInput
              label="Base input price ($/M)"
              value={toPerMillion(config.baseInputPrice)}
              min={0.01}
              max={100}
              step={0.01}
              onChange={(v) => onUpdate('baseInputPrice', fromPerMillion(v))}
            />
            <NumberInput
              label="Output price ($/M)"
              value={toPerMillion(config.outputPrice)}
              min={0.01}
              max={200}
              step={0.01}
              onChange={(v) => onUpdate('outputPrice', fromPerMillion(v))}
            />
            <NumberInput
              label="Cache write multiplier"
              value={config.cacheWriteMultiplier}
              min={1.0}
              max={5.0}
              step={0.01}
              onChange={(v) => onUpdate('cacheWriteMultiplier', v)}
            />
            <NumberInput
              label="Cache hit multiplier"
              value={config.cacheHitMultiplier}
              min={0.01}
              max={1.0}
              step={0.01}
              onChange={(v) => onUpdate('cacheHitMultiplier', v)}
            />
            <NumberInput
              label="Min cacheable tokens"
              value={config.minCacheableTokens}
              min={0}
              max={50000}
              onChange={(v) => onUpdate('minCacheableTokens', v)}
            />
            <NumberInput
              label="Compaction input price ($/M)"
              value={toPerMillion(config.compactionInputPrice)}
              min={0.01}
              max={50}
              step={0.01}
              onChange={(v) => onUpdate('compactionInputPrice', fromPerMillion(v))}
            />
            <NumberInput
              label="Compaction output price ($/M)"
              value={toPerMillion(config.compactionOutputPrice)}
              min={0.01}
              max={100}
              step={0.01}
              onChange={(v) => onUpdate('compactionOutputPrice', fromPerMillion(v))}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
