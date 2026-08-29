import { X, Trash2 } from 'lucide-react'

import { Button } from '@/components/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/Dialog'

// Delete confirmation. On a failed delete the dialog stays open and shows a
// fixed message as error text between the body copy and the actions, so the
// user can see it and retry (0005 / 0012). Never uses the native confirm().
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  isDeleting,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  isDeleting: boolean
  error?: string | null
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {error && <span className="error-text">{error}</span>}
        <div className="actions">
          <Button
            variant="outline"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            <X strokeWidth={1.75} />
            Cancel
          </Button>
          <Button variant="danger" disabled={isDeleting} onClick={onConfirm}>
            <Trash2 strokeWidth={1.75} />
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
