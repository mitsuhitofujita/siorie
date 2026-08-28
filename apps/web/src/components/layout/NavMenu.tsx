import { Link, useNavigate } from 'react-router-dom'
import { User } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAuth } from '@/lib/auth-context'

export function NavMenu() {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const user = state.status === 'authenticated' ? state.user : null

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="メニューを開く"
          className="rounded-full"
        >
          <Avatar>
            <AvatarImage src={user?.pictureUrl} alt="" />
            <AvatarFallback>
              <User className="size-5" />
            </AvatarFallback>
          </Avatar>
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>メニュー</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          <SheetClose asChild>
            <Link
              to="/groups"
              className="rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              グループ一覧
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Button
              variant="ghost"
              className="justify-start px-3"
              onClick={() => handleLogout()}
            >
              ログアウト
            </Button>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
