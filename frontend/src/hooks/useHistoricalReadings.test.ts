import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHistoricalReadings } from './useHistoricalReadings'
import { makeWrapper } from '../test/utils'

const mockLt = vi.hoisted(() => vi.fn())

vi.mock('../services/db/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        gte: () => ({ lt: mockLt }),
      }),
    }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useHistoricalReadings', () => {
  it('returns a Map of stationRef → total rainfall from server-side aggregate', async () => {
    // PostgREST server-side SUM returns one row per station with column named "sum"
    mockLt.mockResolvedValueOnce({
      data: [
        { station_ref: 'E0001', sum: '7.5' },
        { station_ref: 'E0002', sum: '10.0' },
      ],
      error: null,
    })

    const { result } = renderHook(() => useHistoricalReadings('7d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.get('E0001')).toBeCloseTo(7.5)
    expect(result.current.data?.get('E0002')).toBeCloseTo(10.0)
  })

  it('coerces PostgREST string-typed NUMERIC aggregate to a number', async () => {
    // PostgREST returns NUMERIC aggregates as strings — must use Number() to avoid NaN.
    mockLt.mockResolvedValueOnce({
      data: [
        { station_ref: 'E0001', sum: '8.60' },
        { station_ref: 'E0002', sum: '10.30' },
      ],
      error: null,
    })

    const { result } = renderHook(() => useHistoricalReadings('28d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.get('E0001')).toBeCloseTo(8.6)
    expect(result.current.data?.get('E0002')).toBeCloseTo(10.3)
  })

  it('returns an empty map when no data is returned', async () => {
    mockLt.mockResolvedValueOnce({ data: [], error: null })

    const { result } = renderHook(() => useHistoricalReadings('28d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.size).toBe(0)
  })

  it('enters error state when Supabase returns an error', async () => {
    mockLt.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const { result } = renderHook(() => useHistoricalReadings('7d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => useHistoricalReadings('7d', { enabled: false }),
      { wrapper: makeWrapper() },
    )

    // Give TanStack Query a tick to potentially fire
    await new Promise((r) => setTimeout(r, 50))

    expect(result.current.isSuccess).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockLt).not.toHaveBeenCalled()
  })
})
