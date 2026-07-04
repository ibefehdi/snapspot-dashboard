import type {
  FleetHistory,
  HistoryDayStat,
  HistoryErrorStat,
  HistoryStepStat,
  JourneyRecord,
  LogEntry,
  UptimeSegment,
  VersionChange,
  VitalsSample,
} from '$lib/types'
import { getDb } from './db'

const STEP_LABELS = [
  'HEALTHCHECK', 'HEALTHCHECKS', 'PAYMENT', 'PHOTOLOOP', 'MONTAGE', 'PRINT', 'JOURNEY',
]

function hostFilter(host: string | null | undefined, column: string): { clause: string; params: string[] } {
  if (!host) return { clause: '', params: [] }
  return { clause: ` AND ${column} = ?`, params: [host] }
}

export function fetchFleetHistory(host?: string | null): FleetHistory {
  const db = getDb()
  const hf = hostFilter(host, 'host')

  const journeys_per_day = db.prepare(`
    SELECT
      substr(started_at, 1, 10) AS date,
      COUNT(*) AS journeys,
      CASE
        WHEN SUM(CASE WHEN is_ok IS NOT NULL THEN 1 ELSE 0 END) = 0 THEN 0
        ELSE ROUND(
          100.0 * SUM(CASE WHEN is_ok = 1 THEN 1 ELSE 0 END)
          / SUM(CASE WHEN is_ok IS NOT NULL THEN 1 ELSE 0 END),
          1
        )
      END AS success_rate
    FROM journeys
    WHERE datetime(started_at) >= datetime('now', '-30 days')${hf.clause}
    GROUP BY date
    ORDER BY date
  `).all(...hf.params) as HistoryDayStat[]

  const stepPlaceholders = STEP_LABELS.map(() => '?').join(', ')
  const stepParams = [...STEP_LABELS, ...(hf.params)]

  const step_stats = db.prepare(`
    SELECT
      CASE
        WHEN detail IN ('HEALTHCHECK_END', 'HEALTHCHECKS_END') THEN 'HEALTHCHECK'
        WHEN detail = 'PHOTOLOOP_END' THEN 'PHOTO'
        WHEN detail = 'JOURNEY_END' THEN 'JOURNEY'
        ELSE replace(detail, '_END', '')
      END AS step,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(json_extract(custom, '$.is_ok'), 1) != 0 THEN 1 ELSE 0 END) AS success,
      AVG(json_extract(custom, '$.duration') / 1e9) AS avg_duration_s
    FROM log_events
    WHERE detail GLOB '*_END'
      AND substr(detail, 1, length(detail) - 4) IN (${stepPlaceholders})
      AND datetime(datetime) >= datetime('now', '-30 days')${hf.clause}
    GROUP BY step
    ORDER BY total DESC
  `).all(...stepParams) as Array<{
    step: string
    total: number
    success: number
    avg_duration_s: number | null
  }>

  const top_errors = db.prepare(`
    SELECT detail, COUNT(*) AS count
    FROM log_events
    WHERE level IN ('ERROR', 'WARN')
      AND datetime(datetime) >= datetime('now', '-7 days')${hf.clause}
    GROUP BY detail
    ORDER BY count DESC
    LIMIT 20
  `).all(...hf.params) as HistoryErrorStat[]

  return {
    journeys_per_day: journeys_per_day.map(row => ({
      date: row.date,
      journeys: Number(row.journeys),
      success_rate: Number(row.success_rate),
    })),
    step_stats: step_stats.map(row => ({
      step: row.step,
      total: Number(row.total),
      success: Number(row.success),
      avg_duration_s: row.avg_duration_s !== null ? Number(row.avg_duration_s) : null,
    })),
    top_errors: top_errors.map(row => ({
      detail: row.detail,
      count: Number(row.count),
    })),
  }
}

export function fetchVersionChanges(host?: string | null, limit = 50): VersionChange[] {
  const hf = hostFilter(host, 'host')
  const rows = getDb().prepare(`
    SELECT host, at, app_version
    FROM version_changes
    WHERE 1=1${hf.clause}
    ORDER BY at DESC
    LIMIT ?
  `).all(...hf.params, limit) as VersionChange[]

  return rows
}

export function fetchVitalsSamples(host: string, hours: number): VitalsSample[] {
  return getDb().prepare(`
    SELECT host, at, cpu_temp_c, mem_used_pct, disk_used_pct, load1
    FROM vitals_samples
    WHERE host = ? AND datetime(at) >= datetime('now', '-' || ? || ' hours')
    ORDER BY at ASC
  `).all(host, hours) as VitalsSample[]
}

export function computeUptime(host: string, days: number): { availability_pct: number; segments: UptimeSegment[] } {
  const db = getDb()
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const changes = db.prepare(`
    SELECT at, status FROM status_changes
    WHERE host = ? AND at >= ?
    ORDER BY at ASC
  `).all(host, since) as Array<{ at: string; status: string }>

  if (changes.length === 0) {
    return { availability_pct: 100, segments: [] }
  }

  const end = Date.now()
  const segments: UptimeSegment[] = []
  let runningMs = 0
  let totalMs = end - new Date(since).getTime()

  for (let i = 0; i < changes.length; i++) {
    const start = new Date(changes[i].at).getTime()
    const nextStart = i + 1 < changes.length
      ? new Date(changes[i + 1].at).getTime()
      : end
    const duration_ms = Math.max(0, nextStart - start)

    segments.push({
      status: changes[i].status,
      start_at: changes[i].at,
      end_at: i + 1 < changes.length ? changes[i + 1].at : new Date(end).toISOString(),
      duration_ms,
    })

    if (changes[i].status === 'RUNNING') {
      runningMs += duration_ms
    }
  }

  const availability_pct = totalMs > 0 ? Math.round((runningMs / totalMs) * 1000) / 10 : 100

  return { availability_pct, segments }
}

export function searchLogs(options: {
  q?: string
  host?: string
  level?: string
  limit?: number
}): LogEntry[] {
  const db = getDb()
  const limit = Math.min(options.limit ?? 50, 200)

  if (options.q?.trim()) {
    const terms: string[] = []
    const params: unknown[] = []

    if (options.host) {
      terms.push('le.host = ?')
      params.push(options.host)
    }
    if (options.level) {
      terms.push('le.level = ?')
      params.push(options.level)
    }

    terms.push(`le.id IN (
      SELECT rowid FROM log_events_fts WHERE log_events_fts MATCH ?
    )`)
    params.push(options.q.trim())

    const where = terms.length ? `WHERE ${terms.join(' AND ')}` : ''

    const rows = db.prepare(`
      SELECT le.host, le.datetime, le.level, le.detail, le.custom
      FROM log_events le
      ${where}
      ORDER BY le.datetime DESC
      LIMIT ?
    `).all(...params, limit) as Array<{
      host: string
      datetime: string
      level: string
      detail: string
      custom: string
    }>

    return rows.map(row => ({
      host: row.host,
      datetime: row.datetime,
      level: row.level,
      detail: row.detail,
      custom: JSON.parse(row.custom) as Record<string, unknown>,
    }))
  }

  const terms: string[] = []
  const params: unknown[] = []

  if (options.host) {
    terms.push('host = ?')
    params.push(options.host)
  }
  if (options.level) {
    terms.push('level = ?')
    params.push(options.level)
  }

  const where = terms.length ? `WHERE ${terms.join(' AND ')}` : ''

  const rows = db.prepare(`
    SELECT host, datetime, level, detail, custom
    FROM log_events
    ${where}
    ORDER BY datetime DESC
    LIMIT ?
  `).all(...params, limit) as Array<{
    host: string
    datetime: string
    level: string
    detail: string
    custom: string
  }>

  return rows.map(row => ({
    host: row.host,
    datetime: row.datetime,
    level: row.level,
    detail: row.detail,
    custom: JSON.parse(row.custom) as Record<string, unknown>,
  }))
}

export function fetchJourneys(host?: string | null, limit = 50): JourneyRecord[] {
  const hf = hostFilter(host, 'host')
  const rows = getDb().prepare(`
    SELECT id, journey_id, host, started_at, ended_at, is_ok, duration_s, steps
    FROM journeys
    WHERE 1=1${hf.clause}
    ORDER BY started_at DESC
    LIMIT ?
  `).all(...hf.params, limit) as Array<{
    id: number
    journey_id: string | null
    host: string
    started_at: string
    ended_at: string | null
    is_ok: number | null
    duration_s: number | null
    steps: string
  }>

  return rows.map(row => ({
    id: row.id,
    journey_id: row.journey_id,
    host: row.host,
    started_at: row.started_at,
    ended_at: row.ended_at,
    is_ok: row.is_ok === null ? null : row.is_ok === 1,
    duration_s: row.duration_s,
    steps: JSON.parse(row.steps) as Record<string, string>,
  }))
}

export function fetchJourneyById(id: number): JourneyRecord | null {
  const row = getDb().prepare(`
    SELECT id, journey_id, host, started_at, ended_at, is_ok, duration_s, steps
    FROM journeys WHERE id = ?
  `).get(id) as {
    id: number
    journey_id: string | null
    host: string
    started_at: string
    ended_at: string | null
    is_ok: number | null
    duration_s: number | null
    steps: string
  } | undefined

  if (!row) return null

  return {
    id: row.id,
    journey_id: row.journey_id,
    host: row.host,
    started_at: row.started_at,
    ended_at: row.ended_at,
    is_ok: row.is_ok === null ? null : row.is_ok === 1,
    duration_s: row.duration_s,
    steps: JSON.parse(row.steps) as Record<string, string>,
  }
}

export function exportCsv(dataset: 'journeys' | 'errors' | 'vitals', host?: string | null): string {
  const hf = hostFilter(host, 'host')
  const db = getDb()

  if (dataset === 'journeys') {
    const rows = db.prepare(`
      SELECT host, journey_id, started_at, ended_at, is_ok, duration_s
      FROM journeys
      WHERE datetime(started_at) >= datetime('now', '-30 days')${hf.clause}
      ORDER BY started_at DESC
    `).all(...hf.params) as Array<Record<string, unknown>>

    return toCsv(['host', 'journey_id', 'started_at', 'ended_at', 'is_ok', 'duration_s'], rows)
  }

  if (dataset === 'errors') {
    const rows = db.prepare(`
      SELECT host, datetime, level, detail
      FROM log_events
      WHERE level IN ('ERROR', 'WARN')
        AND datetime(datetime) >= datetime('now', '-7 days')${hf.clause}
      ORDER BY datetime DESC
    `).all(...hf.params) as Array<Record<string, unknown>>

    return toCsv(['host', 'datetime', 'level', 'detail'], rows)
  }

  const rows = db.prepare(`
    SELECT host, at, cpu_temp_c, mem_used_pct, disk_used_pct, load1
    FROM vitals_samples
    WHERE datetime(at) >= datetime('now', '-30 days')${hf.clause}
    ORDER BY at DESC
  `).all(...hf.params) as Array<Record<string, unknown>>

  return toCsv(['host', 'at', 'cpu_temp_c', 'mem_used_pct', 'disk_used_pct', 'load1'], rows)
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

export function isHistoryAvailable(): boolean {
  try {
    getDb()
    return true
  }
  catch {
    return false
  }
}

export function fetchFleetHosts(): string[] {
  const rows = getDb().prepare(`
    SELECT DISTINCT host FROM (
      SELECT host FROM journeys
      UNION SELECT host FROM log_events
      UNION SELECT host FROM vitals_samples
    )
    ORDER BY host
  `).all() as Array<{ host: string }>

  return rows.map(r => r.host)
}
