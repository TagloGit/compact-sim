import { useState, useCallback } from 'react'
import type { SimulationConfig } from '@/engine/types'
import { useSimulation } from '@/hooks/useSimulation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SimulatorTab } from '@/components/SimulatorTab'
import { ExplorerTab } from '@/components/ExplorerTab'

type TabValue = 'simulator' | 'explorer'

function App() {
  const [activeTab, setActiveTab] = useState<TabValue>('simulator')
  const simulation = useSimulation()

  const openInSimulator = useCallback((config: SimulationConfig) => {
    simulation.setConfig(config)
    setActiveTab('simulator')
  }, [simulation])

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as TabValue)}
      className="h-screen"
    >
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border bg-card px-4">
          <TabsList variant="line">
            <TabsTrigger value="simulator">Simulator</TabsTrigger>
            <TabsTrigger value="explorer">Explorer</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="simulator" className="min-h-0 flex-1">
          <SimulatorTab simulation={simulation} />
        </TabsContent>
        <TabsContent value="explorer" className="min-h-0 flex-1">
          <ExplorerTab onOpenInSimulator={openInSimulator} />
        </TabsContent>
      </div>
    </Tabs>
  )
}

export default App
