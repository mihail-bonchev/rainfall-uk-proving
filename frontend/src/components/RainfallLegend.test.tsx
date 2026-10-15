import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RainfallLegend } from './RainfallLegend'
import { getRainfallScale } from '../utils/rainfallScale'

describe('RainfallLegend', () => {
  it.each(['bbc', 'metoffice'] as const)('%s style says which nations have no data yet', (theme) => {
    render(<RainfallLegend scale={getRainfallScale('7d')} theme={theme} />)
    expect(screen.getByTestId('no-data-note')).toHaveTextContent('No data yet: Wales, N. Ireland')
  })
})
