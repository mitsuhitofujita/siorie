import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Trash2 } from 'lucide-react'

import { Button } from '@/components/Button'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { ErrorState } from '@/components/ErrorState'
import { TextField } from '@/components/TextField'
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
  } = useSubmit(api.updateItem, "Couldn't save. Please try again.")
  const {
    isSubmitting: isDeleting,
    error: deleteError,
    submit: submitDelete,
  } = useSubmit(api.deleteItem, "Couldn't delete. Please try again.")

  if (item.status === 'loading') {
    return null
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
      <h1 className="pagetitle">Edit item</h1>
      <form className="form form-card" onSubmit={handleSubmit}>
        <TextField
          id="item-title"
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          required
          invalid={!!submitError}
        />
        <TextField
          id="item-volume"
          label="Completed volume"
          type="number"
          min={0}
          step={1}
          value={completedVolume}
          onChange={(event) => setCompletedVolume(event.target.value)}
          required
        />
        {submitError && <p className="error-text">{submitError}</p>}
        <div className="toolbar">
          <Button type="submit" className="btn-block" disabled={isSubmitting}>
            <Check strokeWidth={1.75} />
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <div className="form-danger">
          <Button
            type="button"
            variant="danger-ghost"
            size="sm"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 strokeWidth={1.75} />
            Delete item
          </Button>
        </div>
      </form>
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete this item?"
        description="This can't be undone."
        isDeleting={isDeleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </>
  )
}
