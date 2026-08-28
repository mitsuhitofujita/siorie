import { useState } from 'react'

export type SubmitResult<R> = { ok: true; value: R } | { ok: false }

// Returns a discriminated result rather than the resolved value directly:
// callers that submit a void-returning action (e.g. delete) can't tell
// success from failure by truthiness alone (`undefined` either way).
export function useSubmit<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
  errorMessage: string,
) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (...args: Args): Promise<SubmitResult<R>> => {
    setIsSubmitting(true)
    setError(null)
    try {
      const value = await action(...args)
      return { ok: true, value }
    } catch {
      setError(errorMessage)
      return { ok: false }
    } finally {
      setIsSubmitting(false)
    }
  }

  return { isSubmitting, error, submit }
}
