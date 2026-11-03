import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpen, ChevronRight, Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()

  const fetchGroup = useCallback(() => {
    if (!groupId) return Promise.reject(new Error('missing groupId'))
    return api.getGroup(groupId)
  }, [groupId])
  const group = useFetch(fetchGroup)

  const fetchItems = useCallback(() => {
    if (!groupId) return Promise.reject(new Error('missing groupId'))
    return api.listItems(groupId)
  }, [groupId])
  const items = useFetch(fetchItems)

  if (group.status === 'loading') {
    return null
  }

  if (group.status === 'error') {
    return <ErrorState onRetry={group.refetch} />
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow-row">
          <span className="eyebrow">Group</span>
          <Button asChild variant="ghost" size="xs">
            <Link to={`/groups/${group.data.id}/edit`}>
              <Pencil strokeWidth={1.75} />
              Edit
            </Link>
          </Button>
        </div>
        <h1 className="group-title">{group.data.name}</h1>
      </div>

      <div className="sectionhead">
        <h2>Items</h2>
        <Button asChild size="sm">
          <Link to={`/groups/${group.data.id}/items/new`}>
            <Plus strokeWidth={1.75} />
            Add item
          </Link>
        </Button>
      </div>

      {items.status === 'loading' ? null : items.status === 'error' ? (
        <ErrorState onRetry={items.refetch} />
      ) : items.data.length === 0 ? (
        <EmptyState icon={BookOpen} message="No items yet." />
      ) : (
        <ul className="item-list">
          {items.data.map((item) => (
            <li key={item.id}>
              <Link
                className="item-row"
                to={`/groups/${group.data.id}/items/${item.id}`}
              >
                <span className="title">{item.title}</span>
                <span className="vol">
                  <span className="unit">vol.</span>
                  {item.completedVolume}
                </span>
                <ChevronRight className="chev" strokeWidth={1.75} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
