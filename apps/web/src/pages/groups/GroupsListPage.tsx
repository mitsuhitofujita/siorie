import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Group } from '@/lib/api'

export function GroupsListPage() {
  const [groups, setGroups] = useState<Group[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (groups === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        message="グループがまだありません"
        ctaLabel="グループを作成"
        ctaTo="/groups/new"
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link to="/groups/new">グループを作成</Link>
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border">
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              to={`/groups/${group.id}`}
              className="flex items-center px-4 py-3 hover:bg-accent"
            >
              {group.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
