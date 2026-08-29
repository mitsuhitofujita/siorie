import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/lib/utils'

// Label + input + optional hint, on the moss tokens (see index.css `.field` /
// `.label` / `.input` / `.hint`). The label uses the rounded chrome face; the
// input value uses `--font-ugc` (the OS gothic) since it holds user content.
// Form-level submit errors are rendered by the page as a sibling
// `<p className="error-text">`, not here.
type TextFieldProps = Omit<React.ComponentProps<'input'>, 'id'> & {
  id: string
  label: string
  hint?: string
  // Marks the field invalid (red border + ring) without owning the message.
  invalid?: boolean
}

export function TextField({
  id,
  label,
  hint,
  invalid,
  className,
  ...props
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <LabelPrimitive.Root className="label" htmlFor={id}>
        {label}
      </LabelPrimitive.Root>
      <input
        id={id}
        className={cn('input', className)}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        {...props}
      />
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  )
}
