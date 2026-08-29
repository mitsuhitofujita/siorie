import { Outlet } from 'react-router-dom'

import { NavMenu } from '@/components/layout/NavMenu'

// Common layout for every page except the home screen (per 0004). One centred
// column, 430 px max, with a hairline side border on wider viewports — no
// separate desktop layout. Header = wordmark + avatar (opens the nav sheet);
// footer = muted wordmark only.
export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="wordmark">siorie</span>
        <NavMenu />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">siorie</footer>
    </div>
  )
}
