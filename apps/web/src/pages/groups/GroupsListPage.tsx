import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'

import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/Skeleton'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/use-fetch'

export function GroupsListPage() {
  const groups = useFetch(api.listGroups)

  if (groups.status === 'loading') {
    return (
      <div className="stack-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (groups.status === 'error') {
    return <ErrorState onRetry={groups.refetch} />
  }

  if (groups.data.length === 0) {
    return (
      <EmptyState
        message="No groups yet."
        ctaLabel="New group"
        ctaTo="/groups/new"
      />
    )
  }

  return (
    <>
      <h1 className="pagetitle">Groups</h1>
      <div className="toolbar">
        <Button asChild>
          <Link to="/groups/new">
            <Plus strokeWidth={1.75} />
            New group
          </Link>
        </Button>
      </div>
      <ul className="list card">
        {groups.data.map((group) => (
          <li key={group.id}>
            <Link className="row" to={`/groups/${group.id}`}>
              <span className="title">{group.name}</span>
              <ChevronRight className="chev" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
