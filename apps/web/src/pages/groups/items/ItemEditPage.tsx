import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'
import { useSubmit } from '@/lib/use-submit'

export function ItemEditPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>()
  const navigate = useNavigate()

  const fetchItem = useCallback(() => {
    if (!groupId || !itemId)
      return Promise.reject(new Error('missing groupId/itemId'))
    return api.getItem(groupId, itemId)
  }, [groupId, itemId])
  const item = useFetch(fetchItem)

  const [title, setTitle] = useState('')
  const [completedVolume, setCompletedVolume] = useState('0')
  // See GroupEditPage for why this is set during render instead of in an
  // effect.
  const [initializedItemId, setInitializedItemId] = useState<string | null>(
    null,
  )
  if (item.status === 'success' && item.data.id !== initializedItemId) {
    setTitle(item.data.title)
    setCompletedVolume(String(item.data.completedVolume))
    setInitializedItemId(item.data.id)
  }
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const {
    isSubmitting,
    error: submitError,
    submit: submitUpdate,
  } = useSubmit(
    api.updateItem,
    '保存できませんでした。もう一度お試しください。',
  )
  const {
    isSubmitting: isDeleting,
    error: deleteError,
    submit: submitDelete,
  } = useSubmit(
    api.deleteItem,
    '削除できませんでした。もう一度お試しください。',
  )

  if (item.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (item.status === 'error') {
    return <ErrorState onRetry={item.refetch} />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupId) return
    const result = await submitUpdate(
      groupId,
      item.data.id,
      title,
      Number(completedVolume),
    )
    if (result.ok) navigate(`/groups/${groupId}`)
  }

  const handleDelete = async () => {
    if (!groupId) return
    const result = await submitDelete(groupId, item.data.id)
    if (result.ok) navigate(`/groups/${groupId}`)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">アイテムを編集</h1>
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-title">タイトル</Label>
          <Input
            id="item-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-volume">読み終わった巻数</Label>
          <Input
            id="item-volume"
            type="number"
            min={0}
            step={1}
            value={completedVolume}
            onChange={(event) => setCompletedVolume(event.target.value)}
            required
          />
        </div>
        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setIsDeleteOpen(true)}
          >
            削除する
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            保存する
          </Button>
        </div>
      </form>
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="アイテムを削除しますか?"
        description="この操作は取り消せません。"
        isDeleting={isDeleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </>
  )
}
