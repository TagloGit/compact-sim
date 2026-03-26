import { useState, useMemo } from 'react'
import { Effect } from 'effect'
import type { SimulationConfig, SimulationResult, SimulationSnapshot } from '@/engine/types'
import { DEFAULT_CONFIG } from '@/engine/types'
import { runSimulation } from '@/engine/simulation'

export interface UseSimulationReturn {
  config: SimulationConfig
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>
  updateConfig: <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => void
  result: SimulationResult | null
  currentStep: number
  setCurrentStep: (step: number) => void
  currentSnapshot: SimulationSnapshot | null
}

export function useSimulation(): UseSimulationReturn {
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG)
  const [currentStep, setCurrentStepRaw] = useState<number>(-1)

  const result = useMemo<SimulationResult | null>(() => {
    try {
      return Effect.runSync(runSimulation(config))
    } catch {
      return null
    }
  }, [config])

  // When result changes, default to the last step
  const effectiveStep = useMemo(() => {
    if (!result || result.snapshots.length === 0) return -1
    if (currentStep < 0 || currentStep >= result.snapshots.length) {
      return result.snapshots.length - 1
    }
    return currentStep
  }, [result, currentStep])

  const currentSnapshot = useMemo<SimulationSnapshot | null>(() => {
    if (!result || effectiveStep < 0) return null
    return result.snapshots[effectiveStep] ?? null
  }, [result, effectiveStep])

  const setCurrentStep = (step: number) => {
    setCurrentStepRaw(step)
  }

  const updateConfig = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setCurrentStepRaw(-1) // reset to last step on config change
  }

  return {
    config,
    setConfig,
    updateConfig,
    result,
    currentStep: effectiveStep,
    setCurrentStep,
    currentSnapshot,
  }
}
