import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TimeRangeControl } from './TimeRangeControl'

describe('TimeRangeControl', () => {
  it('renders all preset chips', () => {
    render(<TimeRangeControl value="15m" onChange={vi.fn()} />)
    for (const label of ['15m', '6h', '24h', '7d', '28d', 'Custom']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the active chip with aria-pressed=true', () => {
    render(<TimeRangeControl value="6h" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '6h' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '15m' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the clicked preset value', () => {
    const onChange = vi.fn()
    render(<TimeRangeControl value="15m" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(onChange).toHaveBeenCalledWith('7d')
  })

  it('has data-testid="time-range-control"', () => {
    render(<TimeRangeControl value="15m" onChange={vi.fn()} />)
    expect(screen.getByTestId('time-range-control')).toBeInTheDocument()
  })

  it('shows freshness caveat for 7d', () => {
    render(<TimeRangeControl value="7d" onChange={vi.fn()} />)
    expect(screen.getByTestId('freshness-caveat')).toBeInTheDocument()
    expect(screen.getByTestId('freshness-caveat').textContent).toMatch(
      /^Data complete to midnight \d{1,2} \w+ \d{4}$/,
    )
  })

  it('shows freshness caveat for 28d', () => {
    render(<TimeRangeControl value="28d" onChange={vi.fn()} />)
    expect(screen.getByTestId('freshness-caveat')).toBeInTheDocument()
  })

  it('hides freshness caveat for live ranges', () => {
    for (const range of ['15m', '6h', '24h'] as const) {
      const { unmount } = render(<TimeRangeControl value={range} onChange={vi.fn()} />)
      expect(screen.queryByTestId('freshness-caveat')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('clicking Custom opens the date range picker popover', async () => {
    render(<TimeRangeControl value="15m" onChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('custom-range-trigger'))
    await waitFor(() =>
      expect(screen.getByTestId('custom-range-popover')).toBeInTheDocument()
    )
  })

  it('dims chips whose data is still loading and marks them busy', () => {
    render(<TimeRangeControl value="7d" onChange={vi.fn()} pending={{ '6h': true, '24h': false }} />)
    expect(screen.getByRole('button', { name: '6h' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByTestId('loading-caption')).not.toBeInTheDocument()
  })

  it('explains the wait when the selected range is still loading', () => {
    render(<TimeRangeControl value="6h" onChange={vi.fn()} pending={{ '6h': true }} />)
    expect(screen.getByTestId('loading-caption')).toHaveTextContent('Collecting readings')
  })
})
