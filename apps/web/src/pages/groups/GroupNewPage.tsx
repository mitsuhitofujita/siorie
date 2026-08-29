import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'

import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { api } from '@/lib/api'
import { useSubmit } from '@/lib/use-submit'

export function GroupNewPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const { isSubmitting, error, submit } = useSubmit(
    api.createGroup,
    "Couldn't save. Please try again.",
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await submit(name)
    if (result.ok) navigate('/groups')
  }

  return (
    <>
      <h1 className="pagetitle">New group</h1>
      <form className="form" onSubmit={handleSubmit}>
        <TextField
          id="group-name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          hint="Up to 100 characters."
          invalid={!!error}
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
