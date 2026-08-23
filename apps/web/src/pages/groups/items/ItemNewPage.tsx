import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

export function ItemNewPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [completedVolume, setCompletedVolume] = useState('0')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupId) return
    setIsSubmitting(true)
    try {
      await api.createItem(groupId, title, Number(completedVolume))
      navigate(`/groups/${groupId}/items`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">アイテムを作成</h1>
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
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          作成する
        </Button>
      </div>
    </form>
  )
}
