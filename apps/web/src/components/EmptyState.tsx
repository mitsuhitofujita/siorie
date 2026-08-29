import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Plus } from 'lucide-react'

import { Button } from '@/components/Button'

// Empty state inside a card: a line icon, a fixed message, and an optional
// primary CTA that carries a leading plus icon (see index.css `.state`).
// Omit `ctaLabel` / `ctaTo` where the create action lives elsewhere on the
// screen (e.g. group-detail's Items head).
export function EmptyState({
  icon: Icon = Inbox,
  message,
  ctaLabel,
  ctaTo,
}: {
  icon?: ComponentType<{ strokeWidth?: number }>
  message: string
  ctaLabel?: string
  ctaTo?: string
}) {
  return (
    <div className="card state">
      <Icon strokeWidth={1.5} />
      <p>{message}</p>
      {ctaLabel && ctaTo && (
        <Button asChild>
          <Link to={ctaTo}>
            <Plus strokeWidth={1.75} />
            {ctaLabel}
          </Link>
        </Button>
      )}
    </div>
  )
}
