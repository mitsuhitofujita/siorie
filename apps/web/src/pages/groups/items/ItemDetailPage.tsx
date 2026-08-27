import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Item } from '@/lib/api'

export function ItemDetailPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>()
  const [item, setItem] = useState<Item | null>(null)

  useEffect(() => {
    if (!groupId || !itemId) return
    let cancelled = false
    api
      .getItem(groupId, itemId)
      .then((result) => {
        if (!cancelled) setItem(result)
      })
      .catch(() => {
        if (!cancelled) setItem(null)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, itemId])

  if (!item) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{item.title}</h1>
        <Button asChild variant="outline">
          <Link to={`/groups/${groupId}/items/${item.id}/edit`}>編集する</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {item.completedVolume} 巻まで読了
      </p>
    </div>
  )
}
