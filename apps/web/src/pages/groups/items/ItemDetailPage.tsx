import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'

export function ItemDetailPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>()

  const fetchItem = useCallback(() => {
    if (!groupId || !itemId)
      return Promise.reject(new Error('missing groupId/itemId'))
    return api.getItem(groupId, itemId)
  }, [groupId, itemId])
  const item = useFetch(fetchItem)

  if (item.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (item.status === 'error') {
    return <ErrorState onRetry={item.refetch} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{item.data.title}</h1>
        <Button asChild variant="outline">
          <Link to={`/groups/${groupId}/items/${item.data.id}/edit`}>
            編集する
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {item.data.completedVolume} 巻まで読了
      </p>
    </div>
  )
}
