import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SyncStatus } from './SyncStatus'

const FIXED_NOW = new Date('2025-11-21T15:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SyncStatus', () => {
  it('shows "Updated just now" immediately after a successful fetch', () => {
    render(<SyncStatus dataUpdatedAt={FIXED_NOW} isError={false} />)
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Updated just now')
  })

  it('increments elapsed time every second', () => {
    render(<SyncStatus dataUpdatedAt={FIXED_NOW - 5000} isError={false} />)
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Updated 5s ago')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Updated 8s ago')
  })

  it('shows "API unavailable" when isError is true', () => {
    render(<SyncStatus dataUpdatedAt={FIXED_NOW} isError={true} />)
    expect(screen.getByTestId('sync-status')).toHaveTextContent('API unavailable')
  })

  it('renders nothing when dataUpdatedAt is 0', () => {
    const { container } = render(<SyncStatus dataUpdatedAt={0} isError={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
