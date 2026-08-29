import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/Button'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/Skeleton'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'
import { useSubmit } from '@/lib/use-submit'

export function ItemDetailPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>()

  const fetchItem = useCallback(() => {
    if (!groupId || !itemId)
      return Promise.reject(new Error('missing groupId/itemId'))
    return api.getItem(groupId, itemId)
  }, [groupId, itemId])
  const item = useFetch(fetchItem)

  // "Add a volume" bumps the completed volume straight from this screen — the
  // one write action allowed on a detail page (exception to 0011 /
  // decision 0004). `localVolume` overrides the fetched figure once the user
  // starts incrementing; the PATCH is optimistic and a failure rolls the
  // number back and shows a fixed inline error. Increment only — Edit lowers
  // or corrects it.
  const [localVolume, setLocalVolume] = useState<number | null>(null)
  const { isSubmitting, error, submit } = useSubmit(
    api.updateItem,
    "Couldn't update. Please try again.",
  )

  if (item.status === 'loading') {
    return (
      <div className="stack-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (item.status === 'error') {
    return <ErrorState onRetry={item.refetch} />
  }

  const volume = localVolume ?? item.data.completedVolume

  const handleIncrement = async () => {
    const next = volume + 1
    setLocalVolume(next)
    const result = await submit(groupId!, item.data.id, item.data.title, next)
    if (!result.ok) setLocalVolume(volume)
  }

  return (
    <>
      <div className="sectionhead oneline">
        <h1>{item.data.title}</h1>
        <Button asChild variant="outline" size="xs">
          <Link to={`/groups/${groupId}/items/${item.data.id}/edit`}>
            <Pencil strokeWidth={1.75} />
            Edit
          </Link>
        </Button>
      </div>

      <section className="volume card">
        <div className="volume-label">Completed volume</div>
        <span className="volume-num">{volume}</span>
      </section>

      {error && <p className="error-text">{error}</p>}

      <div className="toolbar">
        <Button type="button" onClick={handleIncrement} disabled={isSubmitting}>
          <Plus strokeWidth={1.75} />
          Add a volume
        </Button>
      </div>
    </>
  )
}
