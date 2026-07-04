import { describe, expect, it } from 'vitest'
import { inferJourneyFromLogs } from './journey'

function logLine(detail: string, custom: Record<string, unknown> = {}, datetime = '2026-07-04T12:00:00Z') {
  return JSON.stringify({
    datetime,
    level: 'INFO',
    detail,
    custom: { app_version: 'abc123', journey_id: 'journey-1', ...custom },
  })
}

describe('inferJourneyFromLogs', () => {
  it('returns idle when no journey events', () => {
    const result = inferJourneyFromLogs(logLine('CONFIG_FROM_REMOTE'))
    expect(result.journey?.active).toBe(false)
    expect(result.app_version).toBe('abc123')
  })

  it('infers active journey at payment step', () => {
    const now = new Date()
    const t0 = now.toISOString()
    const t1 = new Date(now.getTime() + 5000).toISOString()
    const t2 = new Date(now.getTime() + 10000).toISOString()

    const logs = [
      logLine('JOURNEY_START', { journey_id: 'j1' }, t0),
      logLine('HEALTHCHECK_END', { is_ok: true }, t1),
      logLine('PAYMENT_START', {}, t2),
    ].join('\n')

    const result = inferJourneyFromLogs(logs)
    expect(result.journey?.active).toBe(true)
    expect(result.journey?.steps.HEALTHCHECK).toBe('DONE')
    expect(result.journey?.steps.PAYMENT).toBe('CURRENT')
  })

  it('skips payment when no payment events', () => {
    const logs = [
      logLine('JOURNEY_START', {}, '2026-07-04T12:00:00Z'),
      logLine('HEALTHCHECK_END', { is_ok: true }),
      logLine('PHOTOLOOP_START', {}),
    ].join('\n')

    const result = inferJourneyFromLogs(logs)
    expect(result.journey?.steps.PAYMENT).toBe('SKIP')
    expect(result.journey?.steps.PHOTO).toBe('CURRENT')
  })

  it('marks error on failed photoloop', () => {
    const logs = [
      logLine('JOURNEY_START', {}, '2026-07-04T12:00:00Z'),
      logLine('PHOTOLOOP_END', { is_ok: false }),
    ].join('\n')

    const result = inferJourneyFromLogs(logs)
    expect(result.journey?.steps.PHOTO).toBe('ERROR')
  })

  it('treats stale journey as inactive', () => {
    const logs = [
      logLine('JOURNEY_START', {}, '2020-01-01T12:00:00Z'),
      logLine('PAYMENT_START', {}, '2020-01-01T12:00:05Z'),
    ].join('\n')

    const result = inferJourneyFromLogs(logs, 15)
    expect(result.journey?.active).toBe(false)
  })

  it('skips garbage lines', () => {
    const logs = `not json\n${logLine('JOURNEY_END', { is_ok: true })}`
    const result = inferJourneyFromLogs(logs)
    expect(result.journey).not.toBeNull()
  })

  it('computes session stats', () => {
    const logs = [
      logLine('JOURNEY_START'),
      logLine('JOURNEY_END', { is_ok: true, duration: 30e9 }),
      logLine('JOURNEY_START'),
      logLine('JOURNEY_END', { is_ok: false }),
      logLine('PRINT_END', { is_ok: true }),
    ].join('\n')

    const result = inferJourneyFromLogs(logs)
    expect(result.session_stats.journeys_in_window).toBe(2)
    expect(result.session_stats.last_journey_ok).toBe(false)
    expect(result.session_stats.last_print_ok).toBe(true)
    expect(result.session_stats.avg_journey_duration_s).toBe(30)
  })
})
