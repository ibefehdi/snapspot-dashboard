import { describe, expect, it, beforeEach } from 'vitest'
import { closeDb, resetDb } from './db'
import { resetIngestCache, ingestLogEvents } from './ingest'
import { validateMontagePath, fetchGalleryItems } from './gallery'
import { fetchSuppliesForHost, markMediaReloaded } from './supplies'

const PRINT_LOG = [
  '{"datetime":"2026-07-04T10:00:00.000Z","level":"INFO","detail":"PRINT_START","custom":{"journey_id":"j1","filepath":"/home/snapspot/.local/share/com.snapspot.dev/images/j1/out.png","printer_model":"dnp-dsrx1"}}',
  '{"datetime":"2026-07-04T10:00:01.000Z","level":"INFO","detail":"PRINT_END","custom":{"journey_id":"j1","is_ok":true}}',
  '{"datetime":"2026-07-04T11:00:00.000Z","level":"INFO","detail":"PRINT_END","custom":{"journey_id":"j2","is_ok":true}}',
  '{"datetime":"2026-07-04T12:00:00.000Z","level":"INFO","detail":"PRINT_END","custom":{"journey_id":"j3","is_ok":true}}',
].join('\n')

describe('gallery', () => {
  beforeEach(() => {
    closeDb()
    resetDb(':memory:')
    resetIngestCache()
    ingestLogEvents('host-a', PRINT_LOG)
  })

  it('validates montage paths', () => {
    expect(validateMontagePath('/home/snapspot/.local/share/com.snapspot.dev/images/j1/out.png')).toBe(true)
    expect(validateMontagePath('/etc/passwd')).toBe(false)
    expect(validateMontagePath('/home/snapspot/.local/share/com.snapspot.dev/images/../secret.png')).toBe(false)
    expect(validateMontagePath('/home/snapspot/.local/share/com.snapspot.dev/images/bad name.png')).toBe(false)
  })

  it('lists gallery items with valid paths', () => {
    const items = fetchGalleryItems('host-a')
    expect(items).toHaveLength(1)
    expect(items[0].journey_id).toBe('j1')
  })
})

describe('supplies', () => {
  beforeEach(() => {
    closeDb()
    resetDb(':memory:')
    resetIngestCache()
    ingestLogEvents('host-a', PRINT_LOG)
  })

  it('counts prints since reload boundary', () => {
    const before = fetchSuppliesForHost('host-a')
    expect(before.prints_used).toBe(3)

    markMediaReloaded('host-a', 100)

    const after = fetchSuppliesForHost('host-a')
    expect(after.prints_used).toBe(0)
    expect(after.remaining).toBe(100)
  })
})
