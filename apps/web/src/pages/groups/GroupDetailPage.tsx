import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (group.status === 'error') {
    return <ErrorState onRetry={group.refetch} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{group.data.name}</h1>
        <Button asChild variant="outline">
          <Link to={`/groups/${group.data.id}/edit`}>編集する</Link>
        </Button>
      </div>

      {items.status === 'loading' ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.status === 'error' ? (
        <ErrorState onRetry={items.refetch} />
      ) : items.data.length === 0 ? (
        <EmptyState
          message="アイテムがまだありません"
          ctaLabel="アイテムを作成"
          ctaTo={`/groups/${group.data.id}/items/new`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button asChild>
              <Link to={`/groups/${group.data.id}/items/new`}>
                アイテムを作成
              </Link>
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-md border">
            {items.data.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/groups/${group.data.id}/items/${item.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent"
                >
                  <span>{item.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.completedVolume} 巻
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
