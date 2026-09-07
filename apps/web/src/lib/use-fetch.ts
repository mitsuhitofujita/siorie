import { useCallback, useEffect, useRef, useState } from 'react'

export type FetchState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error' }

// A skeleton that paints for only a few frames before the data lands reads as
// a flicker on a page transition. `useDelayedSkeleton` gates it on two timers:
// nothing is shown for the first `SKELETON_DELAY_MS` of a load (a fast
// response then swaps straight from blank to content), and once the skeleton
// does appear it stays for at least `SKELETON_MIN_MS` so it can't flash out.
// A load slower than the sum keeps the skeleton up until it resolves.
const SKELETON_DELAY_MS = 150
const SKELETON_MIN_MS = 300

function useDelayedSkeleton(isLoading: boolean): boolean {
  const [visible, setVisible] = useState(false)
  const shownAt = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, SKELETON_DELAY_MS)
      return () => clearTimeout(timer)
    }
    // Load finished. If the skeleton never appeared, there is nothing to hold.
    if (shownAt.current === null) return
    const remaining = Math.max(
      0,
      SKELETON_MIN_MS - (Date.now() - shownAt.current),
    )
    const timer = setTimeout(() => {
      shownAt.current = null
      setVisible(false)
    }, remaining)
    return () => clearTimeout(timer)
  }, [isLoading])

  return visible
}

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
//
// `showSkeleton` is the flag pages branch on for their loading UI: render the
// skeleton while it's true, render nothing while `status` is still `loading`
// but it's false (the pre-delay window), otherwise render the result.
export function useFetch<T>(
  fetcher: () => Promise<T>,
): FetchState<T> & { refetch: () => void; showSkeleton: boolean } {
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

  const showSkeleton = useDelayedSkeleton(state.status === 'loading')

  return { ...state, refetch, showSkeleton }
}
