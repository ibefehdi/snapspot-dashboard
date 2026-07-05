import Redis from 'ioredis'
import { getConfig, isGallerySyncEnabled } from './config'

let client: Redis | null = null

export function getRedis(): Redis | null {
  if (!isGallerySyncEnabled()) return null
  if (!client) {
    const cfg = getConfig()
    client = new Redis(cfg.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
    })
  }
  return client
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit()
    client = null
  }
}

function s3Key(host: string, journeyId: string): string {
  return `gallery:s3:${host}:${journeyId}`
}

function syncLastKey(host: string): string {
  return `gallery:sync:last:${host}`
}

const SYNC_LOCK_KEY = 'gallery:sync:lock'
const SYNC_LOCK_TTL_SEC = 3300
const SYNC_LAST_RUN_KEY = 'gallery:sync:last_run'
const SYNC_LAST_RESULT_KEY = 'gallery:sync:last_result'

function syncKeyTtlSec(): number {
  return getConfig().HISTORY_RETENTION_DAYS * 24 * 60 * 60
}

export async function isMontageSynced(host: string, journeyId: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  const exists = await redis.exists(s3Key(host, journeyId))
  return exists === 1
}

export async function markMontageSynced(host: string, journeyId: string, etag?: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.set(s3Key(host, journeyId), etag ?? '1', 'EX', syncKeyTtlSec())
}

export async function setSyncLast(host: string, iso: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.set(syncLastKey(host), iso, 'EX', syncKeyTtlSec())
}

export async function acquireSyncLock(token: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  const result = await redis.set(SYNC_LOCK_KEY, token, 'EX', SYNC_LOCK_TTL_SEC, 'NX')
  return result === 'OK'
}

export async function releaseSyncLock(token: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  await redis.eval(script, 1, SYNC_LOCK_KEY, token)
}

export async function isSyncRunning(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  const exists = await redis.exists(SYNC_LOCK_KEY)
  return exists === 1
}

export async function getSyncLockTtl(): Promise<number | null> {
  const redis = getRedis()
  if (!redis) return null
  const ttl = await redis.ttl(SYNC_LOCK_KEY)
  if (ttl < 0) return null
  return ttl
}

export async function clearSyncLock(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  const removed = await redis.del(SYNC_LOCK_KEY)
  return removed === 1
}

export async function getSyncLastRun(): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null
  return redis.get(SYNC_LAST_RUN_KEY)
}

export async function setSyncLastRun(iso: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.set(SYNC_LAST_RUN_KEY, iso, 'EX', syncKeyTtlSec())
}

export async function getSyncLastResult(): Promise<{
  hosts: number
  uploaded: number
  skipped: number
  failed: number
  errors: string[]
  finished_at?: string
} | null> {
  const redis = getRedis()
  if (!redis) return null
  const raw = await redis.get(SYNC_LAST_RESULT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

export async function setSyncLastResult(result: {
  hosts: number
  uploaded: number
  skipped: number
  failed: number
  errors: string[]
  finished_at?: string
}): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.set(SYNC_LAST_RESULT_KEY, JSON.stringify(result), 'EX', syncKeyTtlSec())
}

export async function getAllHostSyncLast(): Promise<Record<string, string>> {
  const redis = getRedis()
  if (!redis) return {}
  const prefix = 'gallery:sync:last:'
  const out: Record<string, string> = {}
  let cursor = '0'

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100)
    cursor = nextCursor
    for (const key of keys) {
      if (key === SYNC_LAST_RUN_KEY || key === SYNC_LAST_RESULT_KEY) continue
      const host = key.slice(prefix.length)
      if (!host) continue
      const value = await redis.get(key)
      if (value) out[host] = value
    }
  } while (cursor !== '0')

  return out
}
