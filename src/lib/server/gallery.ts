import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GalleryItem } from '$lib/types'
import { getMontageCacheDir } from './db'
import { getDb } from './db'
import { sshExec } from './ssh'

export const MONTAGE_PATH_PREFIX = '/home/snapspot/.local/share/com.snapspot.dev/images/'

const MONTAGE_RELATIVE_RE = /^[a-zA-Z0-9/_.-]+\.png$/

export function validateMontagePath(path: string): boolean {
  if (!path.startsWith(MONTAGE_PATH_PREFIX)) return false
  if (path.includes('..')) return false
  if (path.includes(' ') || path.includes('"') || path.includes('\'')) return false
  const relative = path.slice(MONTAGE_PATH_PREFIX.length)
  return MONTAGE_RELATIVE_RE.test(relative)
}

export function fetchGalleryItems(host?: string | null, limit = 50): GalleryItem[] {
  const db = getDb()
  const safeLimit = Math.min(Math.max(limit, 1), 200)

  const terms: string[] = [
    'detail = \'PRINT_START\'',
    'json_extract(custom, \'$.filepath\') IS NOT NULL',
  ]
  const params: unknown[] = []

  if (host) {
    terms.push('host = ?')
    params.push(host)
  }

  const rows = db.prepare(`
    SELECT
      host,
      datetime,
      json_extract(custom, '$.journey_id') AS journey_id,
      json_extract(custom, '$.filepath') AS filepath,
      json_extract(custom, '$.printer_model') AS printer_model
    FROM log_events
    WHERE ${terms.join(' AND ')}
    ORDER BY datetime DESC
    LIMIT ?
  `).all(...params, safeLimit) as Array<{
    host: string
    datetime: string
    journey_id: string | null
    filepath: string
    printer_model: string | null
  }>

  return rows
    .filter(row => row.journey_id && row.filepath && validateMontagePath(row.filepath))
    .map(row => ({
      host: row.host,
      journey_id: row.journey_id!,
      datetime: row.datetime,
      filepath: row.filepath,
      printer_model: row.printer_model,
    }))
}

export function getMontageCachePath(host: string, journeyId: string): string {
  const safeJourney = journeyId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(getMontageCacheDir(), host, `${safeJourney}.png`)
}

export function montageImageUrl(host: string, filepath: string, journeyId: string): string {
  return `/api/agents/${encodeURIComponent(host)}/montage?path=${encodeURIComponent(filepath)}&journey_id=${encodeURIComponent(journeyId)}`
}

export function fetchMontageByJourney(host: string, journeyId: string): GalleryItem | null {
  const row = getDb().prepare(`
    SELECT
      host,
      datetime,
      json_extract(custom, '$.journey_id') AS journey_id,
      json_extract(custom, '$.filepath') AS filepath,
      json_extract(custom, '$.printer_model') AS printer_model
    FROM log_events
    WHERE host = ?
      AND detail = 'PRINT_START'
      AND json_extract(custom, '$.journey_id') = ?
    ORDER BY datetime DESC
    LIMIT 1
  `).get(host, journeyId) as {
    host: string
    datetime: string
    journey_id: string | null
    filepath: string
    printer_model: string | null
  } | undefined

  if (!row?.filepath || !validateMontagePath(row.filepath)) return null

  return {
    host: row.host,
    journey_id: journeyId,
    datetime: row.datetime,
    filepath: row.filepath,
    printer_model: row.printer_model,
  }
}

export async function fetchMontageImage(
  host: string,
  filepath: string,
  journeyId: string,
): Promise<{ stream: ReturnType<typeof createReadStream>; fromCache: boolean }> {
  if (!validateMontagePath(filepath)) {
    throw new Error('Invalid montage path')
  }

  const cachePath = getMontageCachePath(host, journeyId)
  if (existsSync(cachePath)) {
    return { stream: createReadStream(cachePath), fromCache: true }
  }

  const escaped = filepath.replace(/'/g, `'\\''`)
  const { stdout, code, stderr } = await sshExec(host, `base64 '${escaped}'`)
  if (code !== 0) {
    throw new Error(stderr.trim() || `Failed to fetch montage from ${host}`)
  }

  const buffer = Buffer.from(stdout.replace(/\s/g, ''), 'base64')
  mkdirSync(join(getMontageCacheDir(), host), { recursive: true })
  writeFileSync(cachePath, buffer)

  return { stream: createReadStream(cachePath), fromCache: false }
}
