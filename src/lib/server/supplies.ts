import type { MediaState, SuppliesStatus } from '$lib/types'
import { getConfig } from './config'
import { getDb } from './db'
import { fetchFleetHosts } from './history'

export function getMediaState(host: string): MediaState | null {
  const row = getDb().prepare(`
    SELECT host, roll_capacity, reloaded_at FROM media_state WHERE host = ?
  `).get(host) as MediaState | undefined

  return row ?? null
}

export function markMediaReloaded(host: string, capacity?: number): MediaState {
  const cfg = getConfig()
  const roll_capacity = capacity ?? cfg.PRINT_ROLL_CAPACITY
  const reloaded_at = new Date().toISOString()

  getDb().prepare(`
    INSERT INTO media_state (host, roll_capacity, reloaded_at)
    VALUES (?, ?, ?)
    ON CONFLICT(host) DO UPDATE SET
      roll_capacity = excluded.roll_capacity,
      reloaded_at = excluded.reloaded_at
  `).run(host, roll_capacity, reloaded_at)

  return { host, roll_capacity, reloaded_at }
}

function countPrintsSince(host: string, since: string): number {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS count
    FROM log_events
    WHERE host = ?
      AND detail = 'PRINT_END'
      AND COALESCE(json_extract(custom, '$.is_ok'), 1) != 0
      AND datetime >= ?
  `).get(host, since) as { count: number }

  return Number(row.count)
}

function latestPrintInfo(host: string): { printer_model: string | null; print_size: string | null } {
  const row = getDb().prepare(`
    SELECT
      json_extract(custom, '$.printer_model') AS printer_model,
      json_extract(custom, '$.print_size') AS print_size
    FROM log_events
    WHERE host = ? AND detail = 'PRINT_START'
    ORDER BY datetime DESC
    LIMIT 1
  `).get(host) as { printer_model: string | null; print_size: string | null } | undefined

  return {
    printer_model: row?.printer_model ?? null,
    print_size: row?.print_size ?? null,
  }
}

export function fetchSuppliesForHost(host: string): SuppliesStatus {
  const cfg = getConfig()
  const state = getMediaState(host)
  const roll_capacity = state?.roll_capacity ?? cfg.PRINT_ROLL_CAPACITY
  const reloaded_at = state?.reloaded_at ?? '1970-01-01T00:00:00.000Z'
  const prints_used = countPrintsSince(host, reloaded_at)
  const remaining = Math.max(0, roll_capacity - prints_used)
  const remaining_pct = roll_capacity > 0 ? Math.round((remaining / roll_capacity) * 1000) / 10 : 0
  const printInfo = latestPrintInfo(host)

  return {
    host,
    printer_model: printInfo.printer_model,
    print_size: printInfo.print_size,
    roll_capacity,
    prints_used,
    remaining,
    remaining_pct,
    reloaded_at,
    low_media: remaining_pct < 15,
  }
}

export function fetchAllSupplies(): SuppliesStatus[] {
  const hosts = fetchFleetHosts()
  return hosts.map(fetchSuppliesForHost)
}
