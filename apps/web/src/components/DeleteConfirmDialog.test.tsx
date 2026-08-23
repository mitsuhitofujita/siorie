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
        title="削除しますか?"
        description="この操作は取り消せません。"
        isDeleting={false}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByText('削除しますか?')).not.toBeInTheDocument()
  })

  it('confirms deletion and cancels without confirming', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="削除しますか?"
        description="この操作は取り消せません。"
        isDeleting={false}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(onConfirm).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables both buttons while deleting', () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="削除しますか?"
        description="この操作は取り消せません。"
        isDeleting
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '削除中...' })).toBeDisabled()
  })
})
