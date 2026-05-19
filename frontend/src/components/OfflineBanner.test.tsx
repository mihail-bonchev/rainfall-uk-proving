import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'

const LAST_UPDATED = new Date('2025-11-21T14:30:00.000Z').getTime()

describe('OfflineBanner', () => {
  it('does not render when failureCount < 3', () => {
    const { container } = render(<OfflineBanner failureCount={2} lastUpdatedAt={LAST_UPDATED} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders banner when failureCount >= 3', () => {
    render(<OfflineBanner failureCount={3} lastUpdatedAt={LAST_UPDATED} />)
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument()
    expect(screen.getByTestId('offline-banner')).toHaveTextContent('EA API unavailable')
  })

  it('hides after clicking dismiss button', () => {
    render(<OfflineBanner failureCount={5} lastUpdatedAt={LAST_UPDATED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument()
  })

  it('shows last updated time in the banner text', () => {
    render(<OfflineBanner failureCount={3} lastUpdatedAt={LAST_UPDATED} />)
    const banner = screen.getByTestId('offline-banner')
    expect(banner).toHaveTextContent('Last updated:')
  })
})
