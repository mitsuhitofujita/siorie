import { Link, useNavigate } from 'react-router-dom'
import { Layers, LogOut, X } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/Sheet'
import { useAuth } from '@/lib/auth-context'

// The avatar button in the header is the only entry to the nav sheet, which
// slides in from the right. The user's name shows inside it (in the OS gothic,
// since it is user content); the links are Groups and Log out.
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
        <button type="button" aria-label="Open menu" className="avatar-btn">
          <Avatar src={user?.pictureUrl} />
        </button>
      </SheetTrigger>
      <SheetContent>
        <div className="nav-sheet-head">
          <SheetTitle>Menu</SheetTitle>
          <SheetClose
            type="button"
            className="nav-sheet-close"
            aria-label="Close menu"
          >
            <X strokeWidth={1.75} />
          </SheetClose>
        </div>
        {user && <p className="nav-sheet-name">{user.name}</p>}
        <nav>
          <SheetClose asChild>
            <Link to="/groups">
              <Layers strokeWidth={1.75} />
              Groups
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <button type="button" onClick={() => handleLogout()}>
              <LogOut strokeWidth={1.75} />
              Log out
            </button>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
