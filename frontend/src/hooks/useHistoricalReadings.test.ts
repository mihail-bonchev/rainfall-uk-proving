import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHistoricalReadings } from './useHistoricalReadings'
import { makeWrapper } from '../test/utils'

const mockRpc = vi.hoisted(() => vi.fn())
// supabase.rpc(...).order(...).range(from, to) resolves to { data, error }
const mockRange = vi.hoisted(() => vi.fn())

vi.mock('../services/db/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockRpc.mockImplementation(() => ({ order: () => ({ range: mockRange }) }))
})

describe('useHistoricalReadings', () => {
  it('returns a Map of stationRef → summed total from server-side GROUP BY', async () => {
    // RPC returns one pre-summed row per station — no client-side accumulation needed.
    mockRange.mockResolvedValueOnce({
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

  it('asks Supabase for a 90-day window for 3m', async () => {
    mockRange.mockResolvedValueOnce({ data: [], error: null })
    const { result } = renderHook(() => useHistoricalReadings('3m'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const { p_start, p_end } = mockRpc.mock.calls[0][1] as { p_start: string; p_end: string }
    expect((Date.parse(p_end) - Date.parse(p_start)) / 86_400_000).toBe(90)
  })

  it('coerces PostgREST string-typed NUMERIC values to numbers', async () => {
    // PostgREST returns NUMERIC columns (including aggregates) as strings.
    mockRange.mockResolvedValueOnce({
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
    mockRange.mockResolvedValueOnce({ data: [], error: null })

    const { result } = renderHook(() => useHistoricalReadings('28d'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.size).toBe(0)
  })

  it('enters error state when Supabase returns an error', async () => {
    mockRange.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

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

  it('pages past the 1,000-row cap until a short page', async () => {
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) => ({ station_ref: `S${offset + i}`, total_mm: '1.00' }))
    mockRange
      .mockResolvedValueOnce({ data: page(1000, 0), error: null })
      .mockResolvedValueOnce({ data: page(5, 1000), error: null })

    const { result } = renderHook(() => useHistoricalReadings('7d'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.size).toBe(1005)
    expect(mockRange.mock.calls).toEqual([[0, 999], [1000, 1999]])
  })
})
