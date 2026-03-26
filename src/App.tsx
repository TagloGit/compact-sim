import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Compaction Simulator</h1>
        <p className="text-muted-foreground">
          Context compaction strategy simulator for LLM agents
        </p>
        <Button>Get Started</Button>
      </div>
    </div>
  )
}

export default App
