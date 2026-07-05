import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isGallerySyncEnabled } from './config'
import { fetchGalleryItems, fetchMontageFromAgent, getMontageCachePath } from './gallery'
import {
  acquireSyncLock,
  getAllHostSyncLast,
  getSyncLastResult,
  getSyncLastRun,
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
      last_run_at: null,
      next_run_at: null,
      last_result: null,
      hosts: [],
    }
  }

  const [running, lastRunAt, lastResult, peers, syncLastByHost] = await Promise.all([
    isSyncRunning(),
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
    last_run_at: lastRunAt,
    next_run_at: nextRunAt,
    last_result: lastResult,
    hosts,
  }
}

export async function runGallerySync(): Promise<SyncResult> {
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

  const token = randomUUID()
  const locked = await acquireSyncLock(token)
  if (!locked) {
    result.errors.push('Another sync is already running')
    return result
  }

  try {
    const peers = await discoverSnapspotPeers()
    const online = peers.filter(p => p.online)

    for (const peer of online) {
      result.hosts++
      const items = fetchGalleryItems(peer.host, 200)

      for (const item of items) {
        try {
          if (await isMontageSynced(item.host, item.journey_id)) {
            result.skipped++
            continue
          }

          const { stream } = await fetchMontageFromAgent(item.host, item.filepath, item.journey_id)
          stream.destroy()

          const buffer = readFileSync(getMontageCachePath(item.host, item.journey_id))
          const etag = await uploadMontage(item.host, item.journey_id, buffer)
          await markMontageSynced(item.host, item.journey_id, etag)
          result.uploaded++
        }
        catch (err) {
          result.failed++
          const msg = err instanceof Error ? err.message : 'unknown error'
          result.errors.push(`${item.host}/${item.journey_id}: ${msg}`)
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

  return result
}
