import { describe, expect, it, beforeEach, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import { closeDb, resetDb } from './db'
import { resetIngestCache, ingestLogEvents } from './ingest'
import { validateMontagePath, fetchGalleryItems, fetchMontageImage } from './gallery'
import { fetchSuppliesForHost, markMediaReloaded } from './supplies'
import { resetConfig } from './config'

vi.mock('./redis', () => ({
  isMontageSynced: vi.fn(),
}))

vi.mock('./s3', () => ({
  getMontageStream: vi.fn(),
}))

vi.mock('./ssh', () => ({
  sshExec: vi.fn(),
}))

import { isMontageSynced } from './redis'
import { getMontageStream } from './s3'
import { sshExec } from './ssh'

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
    vi.clearAllMocks()
    delete process.env.GALLERY_SYNC_ENABLED
    delete process.env.S3_BUCKET
    delete process.env.AWS_REGION
    delete process.env.REDIS_URL
    resetConfig()
    vi.clearAllMocks()
    try {
      rmSync('./data/cache/montages', { recursive: true, force: true })
    }
    catch {
      // ignore missing cache dir
    }
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

  it('serves from S3 when synced in redis', async () => {
    process.env.GALLERY_SYNC_ENABLED = 'true'
    process.env.S3_BUCKET = 'test-bucket'
    process.env.AWS_REGION = 'eu-central-1'
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    resetConfig()

    const s3Stream = Readable.from(Buffer.from('s3-png'))
    vi.mocked(isMontageSynced).mockResolvedValue(true)
    vi.mocked(getMontageStream).mockResolvedValue(s3Stream)

    const result = await fetchMontageImage(
      'host-a',
      '/home/snapspot/.local/share/com.snapspot.dev/images/j1/out.png',
      'j1',
    )

    expect(result.fromS3).toBe(true)
    expect(sshExec).not.toHaveBeenCalled()
    result.stream.destroy()
  })

  it('falls back to agent fetch when not synced in redis', async () => {
    process.env.GALLERY_SYNC_ENABLED = 'true'
    process.env.S3_BUCKET = 'test-bucket'
    process.env.AWS_REGION = 'eu-central-1'
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    resetConfig()

    vi.mocked(isMontageSynced).mockResolvedValue(false)
    vi.mocked(sshExec).mockResolvedValue({
      stdout: Buffer.from('png').toString('base64'),
      code: 0,
      stderr: '',
    })

    const result = await fetchMontageImage(
      'host-a',
      '/home/snapspot/.local/share/com.snapspot.dev/images/j2/out.png',
      'j2',
    )

    expect(result.fromS3).toBeUndefined()
    expect(sshExec).toHaveBeenCalled()
    await new Promise<void>((resolve, reject) => {
      result.stream.on('end', resolve)
      result.stream.on('error', reject)
      result.stream.resume()
    })
  })

  it('falls back to agent fetch when S3 stream is unavailable', async () => {
    process.env.GALLERY_SYNC_ENABLED = 'true'
    process.env.S3_BUCKET = 'test-bucket'
    process.env.AWS_REGION = 'eu-central-1'
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    resetConfig()

    vi.mocked(isMontageSynced).mockResolvedValue(true)
    vi.mocked(getMontageStream).mockResolvedValue(null)
    vi.mocked(sshExec).mockResolvedValue({
      stdout: Buffer.from('png').toString('base64'),
      code: 0,
      stderr: '',
    })

    const result = await fetchMontageImage(
      'host-a',
      '/home/snapspot/.local/share/com.snapspot.dev/images/j3/out.png',
      'j3',
    )

    expect(result.fromS3).toBeUndefined()
    expect(sshExec).toHaveBeenCalled()
    await new Promise<void>((resolve, reject) => {
      result.stream.on('end', resolve)
      result.stream.on('error', reject)
      result.stream.resume()
    })
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
