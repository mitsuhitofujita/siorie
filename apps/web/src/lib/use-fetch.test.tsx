import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useFetch } from './use-fetch'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useFetch', () => {
  it('starts in the loading state', () => {
    const pending = deferred<string[]>()
    const fetcher = () => pending.promise
    const { result } = renderHook(() => useFetch(fetcher))

    expect(result.current.status).toBe('loading')
  })

  it('resolves to success with the fetched data', async () => {
    const request = deferred<string[]>()
    const fetcher = () => request.promise
    const { result } = renderHook(() => useFetch(fetcher))

    await act(async () => {
      request.resolve(['a'])
    })

    const state = result.current
    expect(state.status).toBe('success')
    if (state.status === 'success') {
      expect(state.data).toEqual(['a'])
    }
  })

  it('resolves to error when the fetcher rejects', async () => {
    const request = deferred<string[]>()
    const fetcher = () => request.promise
    const { result } = renderHook(() => useFetch(fetcher))

    await act(async () => {
      request.reject(new Error('boom'))
    })

    expect(result.current.status).toBe('error')
  })

  it('refetch resets to loading and replaces the data', async () => {
    const first = deferred<string[]>()
    const second = deferred<string[]>()
    let current = first
    const fetcher = () => current.promise
    const { result } = renderHook(() => useFetch(fetcher))

    await act(async () => {
      first.resolve(['a'])
    })
    expect(result.current.status).toBe('success')

    current = second
    act(() => {
      result.current.refetch()
    })
    expect(result.current.status).toBe('loading')

    await act(async () => {
      second.resolve(['b'])
    })

    const state = result.current
    expect(state.status).toBe('success')
    if (state.status === 'success') {
      expect(state.data).toEqual(['b'])
    }
  })

  it('ignores a stale response after a refetch starts', async () => {
    const first = deferred<string[]>()
    const second = deferred<string[]>()
    let current = first
    const fetcher = () => current.promise
    const { result } = renderHook(() => useFetch(fetcher))

    current = second
    act(() => {
      result.current.refetch()
    })

    await act(async () => {
      second.resolve(['new'])
    })

    const state = result.current
    expect(state.status).toBe('success')
    if (state.status === 'success') {
      expect(state.data).toEqual(['new'])
    }

    await act(async () => {
      first.resolve(['old'])
    })

    const finalState = result.current
    expect(finalState.status).toBe('success')
    if (finalState.status === 'success') {
      expect(finalState.data).toEqual(['new'])
    }
  })
})
