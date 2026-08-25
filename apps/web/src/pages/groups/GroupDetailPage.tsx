import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Group, type Item } from '@/lib/api'

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const [group, setGroup] = useState<Group | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    api
      .getGroup(groupId)
      .then((result) => {
        if (!cancelled) setGroup(result)
      })
      .catch(() => {
        if (!cancelled) setGroup(null)
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

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

  if (!group) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{group.name}</h1>
        <Button asChild variant="outline">
          <Link to={`/groups/${group.id}/edit`}>編集する</Link>
        </Button>
      </div>

      {items === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message="アイテムがまだありません"
          ctaLabel="アイテムを作成"
          ctaTo={`/groups/${group.id}/items/new`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button asChild>
              <Link to={`/groups/${group.id}/items/new`}>アイテムを作成</Link>
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-md border">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/groups/${group.id}/items/${item.id}/edit`}
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
