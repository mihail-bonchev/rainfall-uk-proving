import { describe, it, expect } from 'vitest'
import { RAINFALL_COLOUR_SCALE } from './StationsSource'

// Simulate the MapLibre `step` expression against a given rainfall_mm value
function evaluateStep(scale: unknown[], value: number): string {
  // scale = ['step', ['get', 'rainfall_mm'], defaultColour, threshold1, colour1, ...]
  const [, , defaultColour, ...pairs] = scale as [unknown, unknown, string, ...unknown[]]
  let result = defaultColour
  for (let i = 0; i < pairs.length; i += 2) {
    const threshold = pairs[i] as number
    const colour = pairs[i + 1] as string
    if (value >= threshold) result = colour
  }
  return result
}

describe('RAINFALL_COLOUR_SCALE step expression', () => {
  it('is transparent below 0.1 mm (dry)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 0)).toBe('transparent')
  })

  it('is pale blue for drizzle (0.1–0.5 mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 0.1)).toBe('#a8d5f5')
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 0.4)).toBe('#a8d5f5')
  })

  it('is cyan for light rain (0.5–2 mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 0.5)).toBe('#50c8f4')
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 1.9)).toBe('#50c8f4')
  })

  it('is green for moderate rain (2–5 mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 2)).toBe('#00a651')
  })

  it('is yellow for heavy rain (5–10 mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 5)).toBe('#fff200')
  })

  it('is orange for very heavy rain (10–20 mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 10)).toBe('#ff7f00')
  })

  it('is red for intense rain (20–50 mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 20)).toBe('#e8001d')
  })

  it('is dark red/purple for extreme rain (50+ mm)', () => {
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 50)).toBe('#9b0026')
    expect(evaluateStep(RAINFALL_COLOUR_SCALE as unknown[], 100)).toBe('#9b0026')
  })
})
