import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function EmptyState({
  message,
  ctaLabel,
  ctaTo,
}: {
  message: string
  ctaLabel: string
  ctaTo: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <Button asChild>
        <Link to={ctaTo}>{ctaLabel}</Link>
      </Button>
    </div>
  )
}
