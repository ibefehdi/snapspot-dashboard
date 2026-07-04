import type { AgentState, AgentStatus, ParsedLogLine, Step, StepState } from '$lib/types'
import { getDb } from './db'
import { parseLogLines } from './journey'

const STEP_ORDER: Step[] = ['HEALTHCHECK', 'PAYMENT', 'PHOTO', 'MONTAGE', 'PRINT']

const INITIAL_STEPS: Record<Step, StepState> = {
  HEALTHCHECK: 'UPCOMING',
  PAYMENT: 'UPCOMING',
  PHOTO: 'UPCOMING',
  MONTAGE: 'UPCOMING',
  PRINT: 'UPCOMING',
}

const LABEL_TO_STEP: Record<string, Step> = {
  HEALTHCHECKS: 'HEALTHCHECK',
  HEALTHCHECK: 'HEALTHCHECK',
  PAYMENT: 'PAYMENT',
  MDB_ENABLE_CASHLESS_MODE: 'PAYMENT',
  MDB_ENABLE_READER_MODE: 'PAYMENT',
  MDB_FINALIZE_TRANSACTION: 'PAYMENT',
  MDB_AUTO_HEAL: 'PAYMENT',
  MDB_DIAGNOSE_AND_FIX: 'PAYMENT',
  PHOTOLOOP: 'PHOTO',
  SNAP: 'PHOTO',
  PREVIEW: 'PHOTO',
  MONTAGE: 'MONTAGE',
  PRINT: 'PRINT',
}

const IGNORED_LABELS = new Set(['SESSION', 'COOLDOWN', 'CLEAR_PREVIEW', 'CONFIG_FROM_REMOTE', 'JOURNEY'])

const activeJourneyRowId = new Map<string, number>()

const insertLog = `
  INSERT OR IGNORE INTO log_events (host, datetime, level, detail, custom)
  VALUES (@host, @datetime, @level, @detail, @custom)
`

function cloneSteps(): Record<Step, StepState> {
  return { ...INITIAL_STEPS }
}

function markEarlierAsSkip(steps: Record<Step, StepState>, current: Step) {
  const idx = STEP_ORDER.indexOf(current)
  for (let i = 0; i < idx; i++) {
    const step = STEP_ORDER[i]
    if (steps[step] === 'UPCOMING') {
      steps[step] = 'SKIP'
    }
  }
}

function applyEvent(steps: Record<Step, StepState>, detail: string, custom: Record<string, unknown>) {
  const match = /^(.*)_(START|END)$/.exec(detail)
  if (!match) return

  const [, label, phase] = match
  if (IGNORED_LABELS.has(label)) return

  const step = LABEL_TO_STEP[label]
  if (!step) return

  if (phase === 'START') {
    markEarlierAsSkip(steps, step)
    steps[step] = 'CURRENT'
  }
  else {
    steps[step] = custom.is_ok !== false ? 'DONE' : 'ERROR'
  }
}

function loadActiveJourney(host: string): number | null {
  const cached = activeJourneyRowId.get(host)
  if (cached !== undefined) return cached

  const row = getDb().prepare(`
    SELECT id FROM journeys
    WHERE host = ? AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `).get(host) as { id: number } | undefined

  if (row) {
    activeJourneyRowId.set(host, row.id)
    return row.id
  }
  return null
}

function processJourneyLine(host: string, line: ParsedLogLine) {
  const db = getDb()

  if (line.detail === 'JOURNEY_START') {
    const journey_id = (line.custom.journey_id as string | undefined) ?? null
    const result = db.prepare(`
      INSERT INTO journeys (journey_id, host, started_at, steps)
      VALUES (?, ?, ?, ?)
    `).run(journey_id, host, line.datetime, JSON.stringify(cloneSteps()))

    activeJourneyRowId.set(host, Number(result.lastInsertRowid))
    return
  }

  let rowId = loadActiveJourney(host)
  if (rowId === null) return

  const row = db.prepare('SELECT steps FROM journeys WHERE id = ?').get(rowId) as { steps: string }
  const steps = JSON.parse(row.steps) as Record<Step, StepState>
  applyEvent(steps, line.detail, line.custom)

  if (line.detail === 'JOURNEY_END') {
    const duration_s = typeof line.custom.duration === 'number' ? line.custom.duration / 1e9 : null
    db.prepare(`
      UPDATE journeys
      SET ended_at = ?, is_ok = ?, duration_s = ?, steps = ?
      WHERE id = ?
    `).run(
      line.datetime,
      line.custom.is_ok !== false ? 1 : 0,
      duration_s,
      JSON.stringify(steps),
      rowId,
    )
    activeJourneyRowId.delete(host)
    return
  }

  db.prepare('UPDATE journeys SET steps = ? WHERE id = ?').run(JSON.stringify(steps), rowId)
}

export function ingestLogEvents(host: string, logText: string) {
  if (!logText.trim()) return

  const db = getDb()
  const cursorRow = db.prepare(`
    SELECT MAX(datetime) AS max_dt FROM log_events WHERE host = ?
  `).get(host) as { max_dt: string | null } | undefined

  const cursor = cursorRow?.max_dt ?? null
  const lines = parseLogLines(logText)
  const newLines = cursor
    ? lines.filter(l => l.datetime > cursor)
    : lines

  if (newLines.length === 0) return

  const insert = db.prepare(insertLog)
  const insertMany = db.transaction((batch: ParsedLogLine[]) => {
    for (const line of batch) {
      insert.run({
        host,
        datetime: line.datetime,
        level: line.level,
        detail: line.detail,
        custom: JSON.stringify(line.custom),
      })
      processJourneyLine(host, line)
    }
  })

  insertMany(newLines)
}

export function ingestVitals(state: AgentState) {
  if (!state.vitals) return

  getDb().prepare(`
    INSERT INTO vitals_samples (host, at, cpu_temp_c, mem_used_pct, disk_used_pct, load1)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    state.host,
    state.probed_at,
    state.vitals.cpu_temp_c,
    state.vitals.mem_used_pct,
    state.vitals.disk_used_pct,
    state.vitals.load1,
  )
}

export function ingestStatusChange(host: string, status: AgentStatus, at: string) {
  const db = getDb()
  const prev = db.prepare('SELECT last_status FROM ingest_state WHERE host = ?').get(host) as
    | { last_status: string | null }
    | undefined

  if (prev?.last_status === status) return

  db.prepare(`
    INSERT INTO status_changes (host, at, status) VALUES (?, ?, ?)
  `).run(host, at, status)

  db.prepare(`
    INSERT INTO ingest_state (host, last_status, last_version)
    VALUES (?, ?, NULL)
    ON CONFLICT(host) DO UPDATE SET last_status = excluded.last_status
  `).run(host, status)
}

export function ingestVersionChange(host: string, appVersion: string | null, at: string) {
  if (!appVersion) return

  const db = getDb()
  const prev = db.prepare('SELECT last_version FROM ingest_state WHERE host = ?').get(host) as
    | { last_version: string | null }
    | undefined

  if (prev?.last_version === appVersion) return

  db.prepare(`
    INSERT INTO version_changes (host, at, app_version) VALUES (?, ?, ?)
  `).run(host, at, appVersion)

  db.prepare(`
    INSERT INTO ingest_state (host, last_status, last_version)
    VALUES (?, NULL, ?)
    ON CONFLICT(host) DO UPDATE SET last_version = excluded.last_version
  `).run(host, appVersion)
}

export function ingestProbeResult(state: AgentState, logText: string) {
  ingestLogEvents(state.host, logText)
  ingestVitals(state)
  ingestStatusChange(state.host, state.status, state.probed_at)
  ingestVersionChange(state.host, state.app_version, state.probed_at)
}

export function ingestOfflineStatus(host: string, status: AgentStatus, at: string) {
  ingestStatusChange(host, status, at)
}

/** Clear in-memory journey cache (for tests). */
export function resetIngestCache() {
  activeJourneyRowId.clear()
}
