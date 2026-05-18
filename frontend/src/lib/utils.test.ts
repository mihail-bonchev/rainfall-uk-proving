import { cn } from './utils'

describe('cn()', () => {
  it('returns empty string with no arguments', () => {
    expect(cn()).toBe('')
  })

  it('joins class names with a space', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('drops falsy values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar')
  })

  it('deduplicates conflicting Tailwind classes (tailwind-merge)', () => {
    // tailwind-merge keeps the last padding class, discarding the earlier one
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('merges conditional classes', () => {
    const active = true
    expect(cn('base', active && 'active')).toBe('base active')
    expect(cn('base', !active && 'hidden')).toBe('base')
  })
})
