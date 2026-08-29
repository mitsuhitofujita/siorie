import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'

import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { api } from '@/lib/api'
import { useSubmit } from '@/lib/use-submit'

export function ItemNewPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [completedVolume, setCompletedVolume] = useState('0')
  const { isSubmitting, error, submit } = useSubmit(
    api.createItem,
    "Couldn't save. Please try again.",
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupId) return
    const result = await submit(groupId, title, Number(completedVolume))
    if (result.ok) navigate(`/groups/${groupId}`)
  }

  return (
    <>
      <h1 className="pagetitle">New item</h1>
      <form className="form" onSubmit={handleSubmit}>
        <TextField
          id="item-title"
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          required
          invalid={!!error}
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
        {error && <p className="error-text">{error}</p>}
        <div className="toolbar">
          <Button type="submit" disabled={isSubmitting}>
            <Check strokeWidth={1.75} />
            {isSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </>
  )
}
