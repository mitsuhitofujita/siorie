import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

// Confirm dialog hand-built on the Radix Dialog primitive (focus trap, Esc,
// scrim, portal) with the app skin from index.css (`.dialog` / `.overlay-scrim`).
// The browser-native confirm() is never used (0004 / decision 0005).
const Dialog = DialogPrimitive.Root

function DialogContent({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay-scrim" />
      <DialogPrimitive.Content className="dialog" {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// Radix Title/Description render an <h2>/<p>; `.dialog h2` / `.dialog > p`
// style them, so no className is needed here.
const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

export { Dialog, DialogContent, DialogTitle, DialogDescription }
