import { describe, expect, it, beforeEach, vi } from 'vitest'
import { type ReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { resetConfig } from './config'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(() => Buffer.from('png-data')),
  }
})

vi.mock('./redis', () => ({
  isMontageSynced: vi.fn(),
  markMontageSynced: vi.fn(),
  acquireSyncLock: vi.fn(),
  releaseSyncLock: vi.fn(),
  setSyncLast: vi.fn(),
  setSyncLastRun: vi.fn(),
  setSyncLastResult: vi.fn(),
}))

vi.mock('./s3', () => ({
  uploadMontage: vi.fn(),
  buildMontageKey: vi.fn(),
  sanitizeJourneyId: vi.fn(),
  montageExists: vi.fn(),
  getMontageStream: vi.fn(),
}))

vi.mock('./tailscale', () => ({
  discoverSnapspotPeers: vi.fn(),
}))

vi.mock('./gallery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gallery')>()
  return {
    ...actual,
    fetchGalleryItems: vi.fn(),
    fetchMontageFromAgent: vi.fn(),
  }
})

import { isMontageSynced, acquireSyncLock, releaseSyncLock, markMontageSynced, setSyncLast } from './redis'
import { uploadMontage } from './s3'
import { discoverSnapspotPeers } from './tailscale'
import { fetchGalleryItems, fetchMontageFromAgent } from './gallery'
import { runGallerySync } from './gallery-sync'

describe('gallery-sync', () => {
  beforeEach(() => {
    process.env.GALLERY_SYNC_ENABLED = 'true'
    process.env.S3_BUCKET = 'test-bucket'
    process.env.AWS_REGION = 'eu-central-1'
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    resetConfig()
    vi.clearAllMocks()
    vi.mocked(acquireSyncLock).mockResolvedValue(true)
    vi.mocked(releaseSyncLock).mockResolvedValue(undefined)
    vi.mocked(discoverSnapspotPeers).mockResolvedValue([
      { host: 'host-a', tailscale_ip: '100.64.0.1', online: true, last_seen: null },
      { host: 'host-b', tailscale_ip: '100.64.0.2', online: false, last_seen: null },
    ])
    vi.mocked(fetchGalleryItems).mockReturnValue([
      {
        host: 'host-a',
        journey_id: 'j1',
        datetime: '2026-07-04T10:00:00.000Z',
        filepath: '/home/snapspot/.local/share/com.snapspot.dev/images/j1/out.png',
        printer_model: 'dnp-dsrx1',
      },
      {
        host: 'host-a',
        journey_id: 'j2',
        datetime: '2026-07-04T11:00:00.000Z',
        filepath: '/home/snapspot/.local/share/com.snapspot.dev/images/j2/out.png',
        printer_model: null,
      },
    ])
    vi.mocked(fetchMontageFromAgent).mockResolvedValue({
      stream: Readable.from(Buffer.from('png')) as unknown as ReadStream,
      fromCache: false,
    })
    vi.mocked(uploadMontage).mockResolvedValue('etag-1')
  })

  it('returns early when sync is disabled', async () => {
    process.env.GALLERY_SYNC_ENABLED = 'false'
    resetConfig()

    const result = await runGallerySync()
    expect(result.errors).toContain('Gallery sync is not enabled')
    expect(acquireSyncLock).not.toHaveBeenCalled()
  })

  it('returns early when lock is not acquired', async () => {
    vi.mocked(acquireSyncLock).mockResolvedValue(false)

    const result = await runGallerySync()
    expect(result.errors).toContain('Another sync is already running')
    expect(discoverSnapspotPeers).not.toHaveBeenCalled()
  })

  it('skips montages already synced in redis', async () => {
    vi.mocked(isMontageSynced)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const result = await runGallerySync()

    expect(result.hosts).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.uploaded).toBe(1)
    expect(fetchMontageFromAgent).toHaveBeenCalledTimes(1)
    expect(uploadMontage).toHaveBeenCalledTimes(1)
    expect(markMontageSynced).toHaveBeenCalledWith('host-a', 'j2', 'etag-1')
    expect(setSyncLast).toHaveBeenCalledWith('host-a', expect.any(String))
    expect(releaseSyncLock).toHaveBeenCalled()
  })

  it('only syncs online agents', async () => {
    vi.mocked(isMontageSynced).mockResolvedValue(false)

    await runGallerySync()

    expect(fetchGalleryItems).toHaveBeenCalledWith('host-a', 200)
    expect(fetchGalleryItems).not.toHaveBeenCalledWith('host-b', expect.anything())
  })
})
