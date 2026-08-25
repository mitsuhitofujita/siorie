import { Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { GroupDetailPage } from '@/pages/groups/GroupDetailPage'
import { GroupEditPage } from '@/pages/groups/GroupEditPage'
import { GroupNewPage } from '@/pages/groups/GroupNewPage'
import { GroupsListPage } from '@/pages/groups/GroupsListPage'
import { ItemEditPage } from '@/pages/groups/items/ItemEditPage'
import { ItemNewPage } from '@/pages/groups/items/ItemNewPage'
import { HomePage } from '@/pages/HomePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route element={<AppLayout />}>
        <Route path="/groups" element={<GroupsListPage />} />
        <Route path="/groups/new" element={<GroupNewPage />} />
        <Route path="/groups/:groupId" element={<GroupDetailPage />} />
        <Route path="/groups/:groupId/edit" element={<GroupEditPage />} />
        <Route path="/groups/:groupId/items/new" element={<ItemNewPage />} />
        <Route
          path="/groups/:groupId/items/:itemId/edit"
          element={<ItemEditPage />}
        />
      </Route>
    </Routes>
  )
}

export default App
