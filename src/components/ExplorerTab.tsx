import type { SimulationConfig } from '@/engine/types'
import { AppLayout } from '@/components/layout/AppLayout'

interface ExplorerTabProps {
  onOpenInSimulator: (config: SimulationConfig) => void
}

export function ExplorerTab(_props: ExplorerTabProps) {
  return (
    <AppLayout
      sidebar={
        <div className="p-4">
          <h2 className="text-sm font-semibold">Sweep Parameters</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Coming soon — configure parameter ranges and run sweeps.
          </p>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Parameter Sweep Explorer</h1>
          <p className="text-sm text-muted-foreground">
            Define parameter ranges, run the cartesian product, and explore results as a heat bar.
          </p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-12 text-muted-foreground">
          Explorer components will be added in subsequent issues.
        </div>
      </div>
    </AppLayout>
  )
}
