import { Link } from 'react-router-dom'
import { User } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth-context'

// No common layout here on purpose: the header's account image is the nav menu's only entry
// point, and the home page has neither before authentication finishes.
export function HomePage() {
  const { state, login, logout } = useAuth()

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-48" />
      </main>
    )
  }

  if (state.status === 'unauthenticated') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">siorie</h1>
        <Button onClick={login}>Google でログイン</Button>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">siorie</h1>
      <div className="flex flex-col items-center gap-3">
        <Avatar className="size-18">
          <AvatarImage src={state.user.pictureUrl} alt="" />
          <AvatarFallback>
            <User className="size-10" />
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{state.user.name}</span>
      </div>
      <div className="flex w-56 flex-col gap-3">
        <Button asChild>
          <Link to="/groups">グループ一覧へ</Link>
        </Button>
        <Button variant="outline" onClick={() => logout()}>
          ログアウト
        </Button>
      </div>
    </main>
  )
}
