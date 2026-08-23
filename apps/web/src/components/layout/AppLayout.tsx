import { Outlet } from 'react-router-dom'

import { NavMenu } from '@/components/layout/NavMenu'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-lg font-semibold">siorie</span>
        <NavMenu />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
        siorie
      </footer>
    </div>
  )
}
