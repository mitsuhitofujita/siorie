import { Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth, RequireGuest } from '@/components/route-guards'
import { GroupDetailPage } from '@/pages/groups/GroupDetailPage'
import { GroupEditPage } from '@/pages/groups/GroupEditPage'
import { GroupNewPage } from '@/pages/groups/GroupNewPage'
import { GroupsListPage } from '@/pages/groups/GroupsListPage'
import { ItemDetailPage } from '@/pages/groups/items/ItemDetailPage'
import { ItemEditPage } from '@/pages/groups/items/ItemEditPage'
import { ItemNewPage } from '@/pages/groups/items/ItemNewPage'
import { LoginPage } from '@/pages/LoginPage'
import { RootRoute } from '@/pages/RootRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route
        path="/login"
        element={
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/groups" element={<GroupsListPage />} />
        <Route path="/groups/new" element={<GroupNewPage />} />
        <Route path="/groups/:groupId" element={<GroupDetailPage />} />
        <Route path="/groups/:groupId/edit" element={<GroupEditPage />} />
        <Route path="/groups/:groupId/items/new" element={<ItemNewPage />} />
        <Route
          path="/groups/:groupId/items/:itemId"
          element={<ItemDetailPage />}
        />
        <Route
          path="/groups/:groupId/items/:itemId/edit"
          element={<ItemEditPage />}
        />
      </Route>
    </Routes>
  )
}

export default App
