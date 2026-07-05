import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isGallerySyncEnabled } from './config'
import { fetchGalleryItems, fetchMontageFromAgent, getMontageCachePath } from './gallery'
import {
  acquireSyncLock,
  getAllHostSyncLast,
  getSyncLastResult,
  getSyncLastRun,
  getSyncLockTtl,
  isMontageSynced,
  isSyncRunning,
  markMontageSynced,
  releaseSyncLock,
  setSyncLast,
  setSyncLastResult,
  setSyncLastRun,
} from './redis'
import { uploadMontage } from './s3'
import { discoverSnapspotPeers } from './tailscale'

const SYNC_INTERVAL_MS = 60 * 60 * 1000

export type SyncResult = {
  hosts: number
  uploaded: number
  skipped: number
  failed: number
  errors: string[]
  finished_at?: string
}

export type SyncProgress = {
  phase: 'start' | 'host' | 'skip' | 'fetch' | 'upload' | 'done' | 'error'
  host?: string
  journey_id?: string
  message: string
}

export type RunGallerySyncOptions = {
  onProgress?: (event: SyncProgress) => void
}

export type GallerySyncHostStatus = {
  host: string
  online: boolean
  last_sync_at: string | null
  total_montages: number
  synced_count: number
  pending_count: number
  pending: Array<{ journey_id: string; datetime: string }>
}

export type GallerySyncStatus = {
  enabled: boolean
  running: boolean
  lock_ttl_sec: number | null
  last_run_at: string | null
  next_run_at: string | null
  last_result: SyncResult | null
  hosts: GallerySyncHostStatus[]
}

export async function fetchGallerySyncStatus(): Promise<GallerySyncStatus> {
  if (!isGallerySyncEnabled()) {
    return {
      enabled: false,
      running: false,
      lock_ttl_sec: null,
      last_run_at: null,
      next_run_at: null,
      last_result: null,
      hosts: [],
    }
  }

  const [running, lockTtl, lastRunAt, lastResult, peers, syncLastByHost] = await Promise.all([
    isSyncRunning(),
    getSyncLockTtl(),
    getSyncLastRun(),
    getSyncLastResult(),
    discoverSnapspotPeers(),
    getAllHostSyncLast(),
  ])

  const nextRunAt = lastRunAt
    ? new Date(new Date(lastRunAt).getTime() + SYNC_INTERVAL_MS).toISOString()
    : null

  const onlineHosts = new Set(peers.filter(p => p.online).map(p => p.host))
  const allHosts = new Set([
    ...peers.map(p => p.host),
    ...Object.keys(syncLastByHost),
  ])

  const hosts: GallerySyncHostStatus[] = []
  for (const host of [...allHosts].sort()) {
    const items = fetchGalleryItems(host, 200)
    let syncedCount = 0
    const pending: Array<{ journey_id: string; datetime: string }> = []

    for (const item of items) {
      if (await isMontageSynced(item.host, item.journey_id)) {
        syncedCount++
      }
      else {
        pending.push({ journey_id: item.journey_id, datetime: item.datetime })
      }
    }

    hosts.push({
      host,
      online: onlineHosts.has(host),
      last_sync_at: syncLastByHost[host] ?? null,
      total_montages: items.length,
      synced_count: syncedCount,
      pending_count: pending.length,
      pending: pending.slice(0, 20),
    })
  }

  return {
    enabled: true,
    running,
    lock_ttl_sec: lockTtl,
    last_run_at: lastRunAt,
    next_run_at: nextRunAt,
    last_result: lastResult,
    hosts,
  }
}

export async function runGallerySync(options: RunGallerySyncOptions = {}): Promise<SyncResult> {
  const log = (event: SyncProgress) => options.onProgress?.(event)

  const result: SyncResult = {
    hosts: 0,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  if (!isGallerySyncEnabled()) {
    result.errors.push('Gallery sync is not enabled')
    return result
  }

  log({ phase: 'start', message: 'Acquiring sync lock…' })

  const token = randomUUID()
  const locked = await acquireSyncLock(token)
  if (!locked) {
    result.errors.push('Another sync is already running')
    log({ phase: 'error', message: result.errors[0] })
    return result
  }

  try {
    log({ phase: 'start', message: 'Discovering online agents…' })
    const peers = await discoverSnapspotPeers()
    const online = peers.filter(p => p.online)
    log({ phase: 'start', message: `${online.length} online agent(s): ${online.map(p => p.host).join(', ') || 'none'}` })

    for (const peer of online) {
      result.hosts++
      const items = fetchGalleryItems(peer.host, 200)
      log({ phase: 'host', host: peer.host, message: `${items.length} montage(s) in history` })

      for (const item of items) {
        try {
          if (await isMontageSynced(item.host, item.journey_id)) {
            result.skipped++
            continue
          }

          log({
            phase: 'fetch',
            host: item.host,
            journey_id: item.journey_id,
            message: `Fetching from agent…`,
          })
          const { stream } = await fetchMontageFromAgent(item.host, item.filepath, item.journey_id)
          stream.destroy()

          const buffer = readFileSync(getMontageCachePath(item.host, item.journey_id))
          log({
            phase: 'upload',
            host: item.host,
            journey_id: item.journey_id,
            message: `Uploading ${(buffer.length / 1024).toFixed(0)} KB to S3…`,
          })
          const etag = await uploadMontage(item.host, item.journey_id, buffer)
          await markMontageSynced(item.host, item.journey_id, etag)
          result.uploaded++
          log({
            phase: 'upload',
            host: item.host,
            journey_id: item.journey_id,
            message: 'Uploaded',
          })
        }
        catch (err) {
          result.failed++
          const msg = err instanceof Error ? err.message : 'unknown error'
          const line = `${item.host}/${item.journey_id}: ${msg}`
          result.errors.push(line)
          log({ phase: 'error', host: item.host, journey_id: item.journey_id, message: line })
        }
      }

      await setSyncLast(peer.host, new Date().toISOString())
    }
  }
  finally {
    await releaseSyncLock(token)
  }

  result.finished_at = new Date().toISOString()
  await setSyncLastRun(result.finished_at)
  await setSyncLastResult(result)

  log({
    phase: 'done',
    message: `Finished: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.failed} failed`,
  })

  return result
}
