import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Item } from '@/lib/api'

export function ItemEditPage() {
  const { groupId, itemId } = useParams<{ groupId: string; itemId: string }>()
  const navigate = useNavigate()

  const [item, setItem] = useState<Item | null>(null)
  const [title, setTitle] = useState('')
  const [completedVolume, setCompletedVolume] = useState('0')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    api
      .listItems(groupId)
      .then((items) => {
        if (cancelled) return
        const found = items.find((i) => i.id === itemId) ?? null
        setItem(found)
        setTitle(found?.title ?? '')
        setCompletedVolume(found ? String(found.completedVolume) : '0')
      })
      .catch(() => {
        if (!cancelled) setItem(null)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, itemId])

  if (!item) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupId) return
    setIsSubmitting(true)
    try {
      await api.updateItem(groupId, item.id, title, Number(completedVolume))
      navigate(`/groups/${groupId}/items`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!groupId) return
    setIsDeleting(true)
    try {
      await api.deleteItem(groupId, item.id)
      navigate(`/groups/${groupId}/items`)
    } finally {
      setIsDeleting(false)
    }
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
        onConfirm={handleDelete}
      />
    </>
  )
}
