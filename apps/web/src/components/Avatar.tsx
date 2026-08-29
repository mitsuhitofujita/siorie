import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { User } from 'lucide-react'

// Radix Avatar (kept for its graceful image-load fallback). Fills its parent
// (the `.avatar-btn` in the header); the moss frame lives on that parent.
export function Avatar({ src }: { src?: string }) {
  return (
    <AvatarPrimitive.Root className="avatar">
      <AvatarPrimitive.Image src={src || undefined} alt="" />
      <AvatarPrimitive.Fallback
        className="avatar-fallback"
        delayMs={src ? 300 : 0}
      >
        <User strokeWidth={1.75} />
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
