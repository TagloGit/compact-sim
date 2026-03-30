import { useCallback, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { SimulationConfig } from '@/engine/types'
import { PARAM_META } from '@/engine/sweep-defaults'

interface VariableOrderPanelProps {
  order: (keyof SimulationConfig)[]
  onChange: (order: (keyof SimulationConfig)[]) => void
}

export function VariableOrderPanel({ order, onChange }: VariableOrderPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragNode = useRef<HTMLDivElement | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    dragNode.current = e.currentTarget as HTMLDivElement
    e.dataTransfer.effectAllowed = 'move'
    // Make the ghost slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      if (dragIndex === null || dragIndex === dropIndex) return

      const newOrder = [...order]
      const [removed] = newOrder.splice(dragIndex, 1)
      newOrder.splice(dropIndex, 0, removed)
      onChange(newOrder)

      setDragIndex(null)
      setOverIndex(null)
    },
    [dragIndex, order, onChange],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setOverIndex(null)
  }, [])

  if (order.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">
        Variable order <span className="font-normal">(drag to reorder — top changes slowest)</span>
      </div>
      <div className="space-y-0.5">
        {order.map((key, index) => {
          const isDragging = dragIndex === index
          const isOver = overIndex === index && dragIndex !== index

          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={[
                'flex items-center gap-2 rounded border px-2 py-1 text-xs cursor-grab active:cursor-grabbing select-none transition-colors',
                isDragging ? 'opacity-40' : '',
                isOver ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-card',
              ].join(' ')}
            >
              <GripVertical className="size-3 text-muted-foreground shrink-0" />
              <span className="tabular-nums text-muted-foreground w-4">{index + 1}.</span>
              <span className="truncate">{PARAM_META[key].displayName}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
