import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useSubmit } from '@/lib/use-submit'

export function GroupNewPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const { isSubmitting, error, submit } = useSubmit(
    api.createGroup,
    '保存できませんでした。もう一度お試しください。',
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await submit(name)
    if (result.ok) navigate('/groups')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">グループを作成</h1>
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          作成する
        </Button>
      </div>
    </form>
  )
}
