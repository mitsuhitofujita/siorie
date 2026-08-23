import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Group } from '@/lib/api'

export function GroupEditPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()

  const [group, setGroup] = useState<Group | null>(null)
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .listGroups()
      .then((groups) => {
        if (cancelled) return
        const found = groups.find((g) => g.id === groupId) ?? null
        setGroup(found)
        setName(found?.name ?? '')
      })
      .catch(() => {
        if (!cancelled) setGroup(null)
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  if (!group) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await api.updateGroup(group.id, name)
      navigate('/groups')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await api.deleteGroup(group.id)
      navigate('/groups')
    } finally {
      setIsDeleting(false)
    }
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
        title="グループを削除しますか?"
        description="所属するアイテムもまとめて削除されます。この操作は取り消せません。"
        isDeleting={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
