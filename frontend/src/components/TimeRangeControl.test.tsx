import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
})
