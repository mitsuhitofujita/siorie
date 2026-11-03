import { useCallback, useEffect, useRef, useState } from 'react'

export type FetchState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error' }

// `fetcher` must be stable across renders that shouldn't re-fetch (wrap it in
// useCallback at the call site). `requestId` guards against a stale request
// overwriting state after a newer one (from a dep change or a manual
// `refetch()`) has already started, and against updating state after unmount.
//
// The initial/dep-change fetch (`run`, called from the effect) never sets
// `status: 'loading'` synchronously itself, only from within the `.then`/
// `.catch` callbacks — react-hooks/set-state-in-effect flags a setState call
// that's synchronously reachable from an effect body. State already starts
// as `loading`, so the effect-triggered fetch doesn't need to re-set it
// (matching the pre-existing per-page effects, which didn't reset state on a
// dep change either). `refetch`, called from a retry button and therefore
// never from inside an effect, resets to `loading` explicitly before
// re-running.
export function useFetch<T>(
  fetcher: () => Promise<T>,
): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' })
  const requestId = useRef(0)

  const run = useCallback(() => {
    const id = ++requestId.current
    fetcher()
      .then((data) => {
        if (requestId.current === id) setState({ status: 'success', data })
      })
      .catch(() => {
        if (requestId.current === id) setState({ status: 'error' })
      })
  }, [fetcher])

  useEffect(() => {
    run()
    return () => {
      requestId.current++
    }
  }, [run])

  const refetch = useCallback(() => {
    setState({ status: 'loading' })
    run()
  }, [run])

  return { ...state, refetch }
}
