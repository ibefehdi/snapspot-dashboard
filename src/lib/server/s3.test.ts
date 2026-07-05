import { describe, expect, it, beforeEach } from 'vitest'
import { resetConfig } from './config'
import { buildMontageKey, sanitizeJourneyId } from './s3'

describe('s3', () => {
  beforeEach(() => {
    process.env.S3_PREFIX = ''
    resetConfig()
  })

  it('sanitizes journey ids for object keys', () => {
    expect(sanitizeJourneyId('j1')).toBe('j1')
    expect(sanitizeJourneyId('bad/id')).toBe('bad_id')
    expect(sanitizeJourneyId('a b')).toBe('a_b')
  })

  it('builds montage keys as host/journey_id.png', () => {
    expect(buildMontageKey('chilly-hands', 'j1')).toBe('chilly-hands/j1.png')
    expect(buildMontageKey('host-a', 'bad/id')).toBe('host-a/bad_id.png')
  })

  it('prepends S3_PREFIX when set', () => {
    process.env.S3_PREFIX = 'gallery'
    resetConfig()
    expect(buildMontageKey('chilly-hands', 'j1')).toBe('gallery/chilly-hands/j1.png')
  })

  it('strips trailing slash from S3_PREFIX', () => {
    process.env.S3_PREFIX = 'gallery/'
    resetConfig()
    expect(buildMontageKey('chilly-hands', 'j1')).toBe('gallery/chilly-hands/j1.png')
  })
})
