import type { JourneyState, ParsedLogLine, SessionStats, Step, StepState } from '$lib/types'

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

const IGNORED_LABELS = new Set([
  'SESSION',
  'COOLDOWN',
  'CLEAR_PREVIEW',
  'CONFIG_FROM_REMOTE',
  'JOURNEY',
])

export function parseLogLines(text: string): ParsedLogLine[] {
  const lines = text.split('\n').filter(Boolean)
  const parsed: ParsedLogLine[] = []

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as {
        datetime?: string
        level?: string
        detail?: string
        custom?: Record<string, unknown>
      }
      if (!obj.detail) {
        continue
      }
      parsed.push({
        datetime: obj.datetime ?? new Date().toISOString(),
        level: obj.level ?? 'INFO',
        detail: obj.detail,
        custom: obj.custom ?? {},
      })
    }
    catch {
      // skip garbage / partial lines
    }
  }

  return parsed
}

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
  if (!match) {
    return
  }

  const [, label, phase] = match
  if (IGNORED_LABELS.has(label)) {
    return
  }

  const step = LABEL_TO_STEP[label]
  if (!step) {
    return
  }

  if (phase === 'START') {
    markEarlierAsSkip(steps, step)
    steps[step] = 'CURRENT'
  }
  else {
    const isOk = custom.is_ok !== false
    steps[step] = isOk ? 'DONE' : 'ERROR'
  }
}

export function inferJourneyFromLogs(
  logText: string,
  staleMinutes = 15,
): { journey: JourneyState | null; app_version: string | null; session_stats: SessionStats } {
  const lines = parseLogLines(logText)
  const app_version = lines.length > 0
    ? (lines[lines.length - 1].custom.app_version as string | undefined) ?? null
    : null

  let lastJourneyStartIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].detail === 'JOURNEY_START') {
      lastJourneyStartIdx = i
      break
    }
  }

  const session_stats = computeSessionStats(lines)

  if (lastJourneyStartIdx === -1) {
    const last = lines[lines.length - 1]
    return {
      journey: last
        ? {
            journey_id: null,
            active: false,
            steps: cloneSteps(),
            started_at: null,
            last_event: last.detail,
            last_event_at: last.datetime,
            journey_ok: null,
          }
        : null,
      app_version,
      session_stats,
    }
  }

  const startLine = lines[lastJourneyStartIdx]
  const journey_id = (startLine.custom.journey_id as string | undefined) ?? null
  const started_at = startLine.datetime

  let journeyEndIdx = -1
  let journey_ok: boolean | null = null
  for (let i = lastJourneyStartIdx + 1; i < lines.length; i++) {
    if (lines[i].detail === 'JOURNEY_END') {
      journeyEndIdx = i
      journey_ok = lines[i].custom.is_ok !== false
      break
    }
  }

  const steps = cloneSteps()
  const endIdx = journeyEndIdx === -1 ? lines.length : journeyEndIdx + 1

  for (let i = lastJourneyStartIdx; i < endIdx; i++) {
    applyEvent(steps, lines[i].detail, lines[i].custom)
  }

  const lastLine = lines[lines.length - 1]
  let active = journeyEndIdx === -1

  if (active && started_at) {
    const ageMs = Date.now() - new Date(started_at).getTime()
    if (ageMs > staleMinutes * 60 * 1000) {
      active = false
    }
  }

  if (!active && journeyEndIdx !== -1) {
    for (const step of STEP_ORDER) {
      if (steps[step] === 'CURRENT') {
        steps[step] = 'DONE'
      }
    }
  }

  return {
    journey: {
      journey_id,
      active,
      steps,
      started_at,
      last_event: lastLine?.detail ?? 'JOURNEY_START',
      last_event_at: lastLine?.datetime ?? started_at,
      journey_ok,
    },
    app_version,
    session_stats,
  }
}

function computeSessionStats(lines: ParsedLogLine[]): SessionStats {
  let journeys_in_window = 0
  let last_journey_ok: boolean | null = null
  let last_print_ok: boolean | null = null
  const journeyDurations: number[] = []

  for (const line of lines) {
    if (line.detail === 'JOURNEY_START') {
      journeys_in_window++
    }
    if (line.detail === 'JOURNEY_END') {
      last_journey_ok = line.custom.is_ok !== false
      if (typeof line.custom.duration === 'number') {
        journeyDurations.push(line.custom.duration / 1e9)
      }
    }
    if (line.detail === 'PRINT_END') {
      last_print_ok = line.custom.is_ok !== false
    }
  }

  const avg_journey_duration_s = journeyDurations.length > 0
    ? journeyDurations.reduce((a, b) => a + b, 0) / journeyDurations.length
    : null

  return {
    journeys_in_window,
    last_journey_ok,
    last_print_ok,
    avg_journey_duration_s,
  }
}

export function parseLogEntries(text: string) {
  return parseLogLines(text).map(line => ({
    datetime: line.datetime,
    level: line.level,
    detail: line.detail,
    custom: line.custom,
  }))
}
