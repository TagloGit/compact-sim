import { ScrollArea } from '@/components/ui/scroll-area'

interface AppLayoutProps {
  sidebar: React.ReactNode
  children: React.ReactNode
}

export function AppLayout({ sidebar, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-80 shrink-0 border-r border-border bg-card">
        <ScrollArea className="h-full">
          {sidebar}
        </ScrollArea>
      </aside>

      {/* Main area */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
