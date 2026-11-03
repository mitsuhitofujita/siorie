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
  } = useSubmit(api.updateGroup, "Couldn't save. Please try again.")
  const {
    isSubmitting: isDeleting,
    error: deleteError,
    submit: submitDelete,
  } = useSubmit(api.deleteGroup, "Couldn't delete. Please try again.")

  if (group.status === 'loading') {
    return null
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
      <h1 className="pagetitle">Edit group</h1>
      <form className="form" onSubmit={handleSubmit}>
        <TextField
          id="group-name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          invalid={!!submitError}
        />
        {submitError && <p className="error-text">{submitError}</p>}
        <div className="toolbar">
          <Button type="submit" disabled={isSubmitting}>
            <Check strokeWidth={1.75} />
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <div className="form-danger">
          <Button
            type="button"
            variant="danger"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 strokeWidth={1.75} />
            Delete group
          </Button>
        </div>
      </form>
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete this group?"
        description="Its items will be deleted too. This can't be undone."
        isDeleting={isDeleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </>
  )
}
