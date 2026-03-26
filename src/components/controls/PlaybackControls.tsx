import { useState, useEffect, useRef, useCallback } from 'react'
import {
  SkipBack,
  StepBack,
  Play,
  Pause,
  StepForward,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface PlaybackControlsProps {
  currentStep: number
  totalSteps: number
  onStepChange: (step: number) => void
}

const SPEED_OPTIONS = [
  { label: '4x', ms: 100 },
  { label: '2x', ms: 250 },
  { label: '1x', ms: 500 },
  { label: '0.5x', ms: 1000 },
] as const

export function PlaybackControls({
  currentStep,
  totalSteps,
  onStepChange,
}: PlaybackControlsProps) {
  const [playing, setPlaying] = useState(false)
  const [speedIndex, setSpeedIndex] = useState(1) // default 2x (250ms)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentStepRef = useRef(currentStep)

  // Keep ref in sync so the interval callback always reads the latest step
  currentStepRef.current = currentStep

  const lastStep = totalSteps - 1

  const stop = useCallback(() => {
    setPlaying(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Start/stop auto-play
  useEffect(() => {
    if (!playing) return
    intervalRef.current = setInterval(() => {
      const next = currentStepRef.current + 1
      if (next > lastStep) {
        stop()
        return
      }
      onStepChange(next)
    }, SPEED_OPTIONS[speedIndex].ms)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [playing, speedIndex, lastStep, onStepChange, stop])

  // Stop playing if we reach the end
  useEffect(() => {
    if (playing && currentStep >= lastStep) {
      stop()
    }
  }, [currentStep, lastStep, playing, stop])

  const togglePlay = () => {
    if (playing) {
      stop()
    } else {
      // If at end, restart from beginning
      if (currentStep >= lastStep) {
        onStepChange(0)
      }
      setPlaying(true)
    }
  }

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEED_OPTIONS.length)
  }

  if (totalSteps === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {/* Scrubber */}
      <Slider
        value={[currentStep]}
        min={0}
        max={lastStep}
        step={1}
        onValueChange={(v) => {
          const val = Array.isArray(v) ? v[0] : v
          onStepChange(val)
        }}
      />

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStepChange(0)}
            disabled={currentStep === 0}
            aria-label="Jump to start"
          >
            <SkipBack />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStepChange(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            aria-label="Step back"
          >
            <StepBack />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStepChange(Math.min(lastStep, currentStep + 1))}
            disabled={currentStep >= lastStep}
            aria-label="Step forward"
          >
            <StepForward />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStepChange(lastStep)}
            disabled={currentStep >= lastStep}
            aria-label="Jump to end"
          >
            <SkipForward />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="xs"
            onClick={cycleSpeed}
            className="w-10 tabular-nums"
          >
            {SPEED_OPTIONS[speedIndex].label}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Step {currentStep + 1} / {totalSteps}
          </span>
        </div>
      </div>
    </div>
  )
}
