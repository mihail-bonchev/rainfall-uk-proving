import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw/server'
import { useLatestReadings } from './useLatestReadings'
import { _resetDbForTests } from '../services/db/dbInit'
import { makeWrapper } from '../test/utils'

vi.mock('../services/db/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}))

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

beforeEach(async () => {
  await _resetDbForTests()
})

describe('useLatestReadings', () => {
  it('returns a Map of stationRef → summed value after fetch', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            { stationReference: 'E0001', value: 1.5, dateTime: '2025-11-21T14:30:00Z', measure: 'test' },
            { stationReference: 'E0002', value: 0.8, dateTime: '2025-11-21T14:30:00Z', measure: 'test' },
          ],
        }),
      ),
    )

    const { result } = renderHook(() => useLatestReadings('15m'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.get('E0001')).toBeCloseTo(1.5)
    expect(result.current.data?.get('E0002')).toBeCloseTo(0.8)
  })

  it('enters error state when the API fails', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useLatestReadings('15m'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
