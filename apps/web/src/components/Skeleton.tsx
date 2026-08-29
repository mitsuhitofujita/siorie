import * as React from 'react'

import { cn } from '@/lib/utils'

// Loading placeholder: a card-coloured block with a slow opacity pulse (see
// index.css `.skeleton`). Height / width come from the caller's utility
// classes.
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('skeleton', className)} aria-hidden {...props} />
}
