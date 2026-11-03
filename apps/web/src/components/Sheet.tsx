import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

// Right-side nav sheet, hand-built on the Radix Dialog primitive (focus trap,
// Esc, scrim, portal) with the app skin from index.css (`.nav-sheet` /
// `.overlay-scrim`). Slides in from the right.
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
// Renders an <h2>; `.nav-sheet-head h2` styles it.
const SheetTitle = DialogPrimitive.Title

function SheetContent({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay-scrim" />
      <DialogPrimitive.Content
        className="nav-sheet"
        // The sheet is all links; no descriptive paragraph to point at.
        aria-describedby={undefined}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetTitle, SheetContent }
