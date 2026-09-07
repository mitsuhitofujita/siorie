import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFetch } from './use-fetch'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useFetch skeleton timing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('never shows the skeleton when the response beats the delay', async () => {
    const d = deferred<string[]>()
    const fetcher = () => d.promise
    const { result } = renderHook(() => useFetch(fetcher))

    expect(result.current.showSkeleton).toBe(false)

    await act(async () => {
      d.resolve(['a'])
    })
    await act(() => vi.advanceTimersByTimeAsync(500))

    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.status).toBe('success')
  })

  it('shows the skeleton once the load runs past the delay', async () => {
    const d = deferred<string[]>()
    const fetcher = () => d.promise
    const { result } = renderHook(() => useFetch(fetcher))

    await act(() => vi.advanceTimersByTimeAsync(150))

    expect(result.current.showSkeleton).toBe(true)
  })

  it('holds the skeleton for a minimum time after the load resolves', async () => {
    const d = deferred<string[]>()
    const fetcher = () => d.promise
    const { result } = renderHook(() => useFetch(fetcher))

    await act(() => vi.advanceTimersByTimeAsync(150))
    expect(result.current.showSkeleton).toBe(true)

    await act(async () => {
      d.resolve(['a'])
    })
    // Resolved right after the skeleton appeared: it stays put for now.
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(result.current.showSkeleton).toBe(true)
    expect(result.current.status).toBe('success')

    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(result.current.showSkeleton).toBe(false)
  })
})
