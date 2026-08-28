import { Button } from '@/components/ui/button'

export function ErrorState({
  message = '読み込みに失敗しました。',
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      <Button onClick={onRetry}>再試行</Button>
    </div>
  )
}
