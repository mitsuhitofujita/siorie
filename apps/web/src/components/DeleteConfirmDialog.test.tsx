import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DeleteConfirmDialog } from './DeleteConfirmDialog'

describe('DeleteConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <DeleteConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Delete this?"
        description="This can't be undone."
        isDeleting={false}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByText('Delete this?')).not.toBeInTheDocument()
  })

  it('confirms deletion and cancels without confirming', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete this?"
        description="This can't be undone."
        isDeleting={false}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables both buttons while deleting', () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete this?"
        description="This can't be undone."
        isDeleting
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  })
})
