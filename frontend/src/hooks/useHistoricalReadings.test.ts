import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHistoricalReadings } from './useHistoricalReadings'
import { makeWrapper } from '../test/utils'

const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('../services/db/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useHistoricalReadings', () => {
  it('returns a Map of stationRef → summed total from server-side GROUP BY', async () => {
    // RPC returns one pre-summed row per station — no client-side accumulation needed.
    mockRpc.mockResolvedValueOnce({
      data: [
        { station_ref: 'E0001', total_mm: '7.50' },
        { station_ref: 'E0002', total_mm: '10.00' },
      ],
      error: null,
    })

    const { result } = renderHook(() => useHistoricalReadings('7d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.get('E0001')).toBeCloseTo(7.5)
    expect(result.current.data?.get('E0002')).toBeCloseTo(10.0)
  })

  it('coerces PostgREST string-typed NUMERIC values to numbers', async () => {
    // PostgREST returns NUMERIC columns (including aggregates) as strings.
    mockRpc.mockResolvedValueOnce({
      data: [
        { station_ref: 'E0001', total_mm: '8.60' },
        { station_ref: 'E0002', total_mm: '10.30' },
      ],
      error: null,
    })

    const { result } = renderHook(() => useHistoricalReadings('28d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.get('E0001')).toBeCloseTo(8.6)
    expect(result.current.data?.get('E0002')).toBeCloseTo(10.3)
  })

  it('returns an empty map when no data is returned', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const { result } = renderHook(() => useHistoricalReadings('28d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.size).toBe(0)
  })

  it('enters error state when Supabase returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

    const { result } = renderHook(() => useHistoricalReadings('7d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => useHistoricalReadings('7d', { enabled: false }),
      { wrapper: makeWrapper() },
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(result.current.isSuccess).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
