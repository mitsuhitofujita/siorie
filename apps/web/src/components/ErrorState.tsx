import { RotateCcw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/Button'

// Fetch-failure state inside a card: a warning line icon, a fixed message, and
// an outline Retry button (see index.css `.state`). Mirrors EmptyState.
export function ErrorState({
  message = "Couldn't load. Please try again.",
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="card state">
      <TriangleAlert strokeWidth={1.5} />
      <p>{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw strokeWidth={1.75} />
        Retry
      </Button>
    </div>
  )
}
