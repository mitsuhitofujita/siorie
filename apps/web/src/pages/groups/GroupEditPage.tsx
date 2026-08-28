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

export function GroupEditPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()

  const fetchGroup = useCallback(() => {
    if (!groupId) return Promise.reject(new Error('missing groupId'))
    return api.getGroup(groupId)
  }, [groupId])
  const group = useFetch(fetchGroup)

  const [name, setName] = useState('')
  // Seeds `name` from the fetch the first time it succeeds for this group,
  // without clobbering in-progress edits on a later re-render. Set during
  // render (React's documented pattern for "adjust state when a prop
  // changes"), not in an effect: an effect would fire one render late and
  // synchronously calling setState from inside an effect body is flagged by
  // react-hooks/set-state-in-effect.
  const [initializedGroupId, setInitializedGroupId] = useState<string | null>(
    null,
  )
  if (group.status === 'success' && group.data.id !== initializedGroupId) {
    setName(group.data.name)
    setInitializedGroupId(group.data.id)
  }
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const {
    isSubmitting,
    error: submitError,
    submit: submitUpdate,
  } = useSubmit(
    api.updateGroup,
    '保存できませんでした。もう一度お試しください。',
  )
  const {
    isSubmitting: isDeleting,
    error: deleteError,
    submit: submitDelete,
  } = useSubmit(
    api.deleteGroup,
    '削除できませんでした。もう一度お試しください。',
  )

  if (group.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (group.status === 'error') {
    return <ErrorState onRetry={group.refetch} />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await submitUpdate(group.data.id, name)
    if (result.ok) navigate('/groups')
  }

  const handleDelete = async () => {
    const result = await submitDelete(group.data.id)
    if (result.ok) navigate('/groups')
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">グループを編集</h1>
        <div className="flex flex-col gap-2">
          <Label htmlFor="group-name">グループ名</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
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
        title="グループを削除しますか?"
        description="所属するアイテムもまとめて削除されます。この操作は取り消せません。"
        isDeleting={isDeleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </>
  )
}
