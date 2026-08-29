import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '@/lib/utils'

// Pill button on the moss tokens (see index.css `.btn`). Every button carries
// a leading single-colour line icon — the caller passes it as the first child
// (`<Button><Plus />New group</Button>`); `.btn svg` sizes it. The sole
// exception in the app is Google's own rendered Sign in button.
type ButtonProps = React.ComponentProps<'button'> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'default' | 'sm'
  // Render as the single child element (e.g. a react-router <Link>) instead
  // of a <button>, keeping the `.btn` classes. Used for navigation actions.
  asChild?: boolean
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(
        'btn',
        variantClass[variant],
        size === 'sm' && 'btn-sm',
        className,
      )}
      // A bare <button> defaults to type="submit"; every non-submit call site
      // would otherwise have to remember `type="button"`. asChild targets
      // (links) must not receive a `type`.
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}
