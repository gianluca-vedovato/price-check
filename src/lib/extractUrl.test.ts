import { describe, expect, it } from 'vitest'
import { extractUrl } from './extractUrl'

describe('extractUrl', () => {
  it('pulls the link out of shared text', () => {
    expect(extractUrl(null, 'Look at this! https://www.amazon.it/dp/B0C?th=1 via app')).toBe('https://www.amazon.it/dp/B0C?th=1')
    expect(extractUrl('https://x.it/p).')).toBe('https://x.it/p')
  })

  it('prefers the first input that has a link', () => {
    expect(extractUrl('', 'Title', 'https://b.it')).toBe('https://b.it')
    expect(extractUrl('nothing here')).toBeUndefined()
  })
})
