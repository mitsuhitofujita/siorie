import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Item } from '@/lib/api'

export function ItemsListPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    api
      .listItems(groupId)
      .then((result) => {
        if (!cancelled) setItems(result)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  if (items === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="アイテムがまだありません"
        ctaLabel="アイテムを作成"
        ctaTo={`/groups/${groupId}/items/new`}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link to={`/groups/${groupId}/items/new`}>アイテムを作成</Link>
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/groups/${groupId}/items/${item.id}/edit`}
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
  )
}
