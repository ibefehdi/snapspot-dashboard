import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb, closeDb } from './db'
import { ingestLogEvents, resetIngestCache } from './ingest'
import { fetchFleetHistory, fetchJourneys, searchLogs } from './history'

const SAMPLE_LOG = [
  '{"datetime":"2026-07-04T10:00:00.000Z","level":"INFO","detail":"JOURNEY_START","custom":{"journey_id":"j1","app_version":"1.0.0"}}',
  '{"datetime":"2026-07-04T10:00:01.000Z","level":"INFO","detail":"PAYMENT_START","custom":{"journey_id":"j1"}}',
  '{"datetime":"2026-07-04T10:00:05.000Z","level":"INFO","detail":"PAYMENT_END","custom":{"journey_id":"j1","is_ok":true,"duration":4000000000}}',
  '{"datetime":"2026-07-04T10:00:10.000Z","level":"INFO","detail":"JOURNEY_END","custom":{"journey_id":"j1","is_ok":true,"duration":10000000000}}',
  '{"datetime":"2026-07-04T10:01:00.000Z","level":"ERROR","detail":"PRINTER_OFFLINE","custom":{}}',
].join('\n')

describe('ingest', () => {
  beforeEach(() => {
    closeDb()
    resetDb(':memory:')
    resetIngestCache()
  })

  it('deduplicates overlapping log lines', () => {
    ingestLogEvents('host-a', SAMPLE_LOG)
    ingestLogEvents('host-a', SAMPLE_LOG)

    const rows = searchLogs({ host: 'host-a', limit: 100 })
    expect(rows).toHaveLength(5)
  })

  it('only ingests lines newer than cursor', () => {
    ingestLogEvents('host-a', SAMPLE_LOG)

    const extra = '{"datetime":"2026-07-04T10:02:00.000Z","level":"WARN","detail":"NEW_EVENT","custom":{}}'
    ingestLogEvents('host-a', `${SAMPLE_LOG}\n${extra}`)

    const rows = searchLogs({ host: 'host-a', limit: 100 })
    expect(rows).toHaveLength(6)
    expect(rows[0].detail).toBe('NEW_EVENT')
  })

  it('materializes journeys from log events', () => {
    ingestLogEvents('host-a', SAMPLE_LOG)

    const journeys = fetchJourneys('host-a')
    expect(journeys).toHaveLength(1)
    expect(journeys[0].is_ok).toBe(true)
    expect(journeys[0].steps.PAYMENT).toBe('DONE')
  })
})

describe('history queries', () => {
  beforeEach(() => {
    closeDb()
    resetDb(':memory:')
    resetIngestCache()
    ingestLogEvents('host-a', SAMPLE_LOG)
  })

  it('returns fleet history aggregates', () => {
    const history = fetchFleetHistory('host-a')
    expect(history.journeys_per_day.length).toBeGreaterThanOrEqual(1)
    expect(history.top_errors.some(e => e.detail === 'PRINTER_OFFLINE')).toBe(true)
  })

  it('filters by host', () => {
    ingestLogEvents('host-b', '{"datetime":"2026-07-04T11:00:00.000Z","level":"ERROR","detail":"OTHER_ERROR","custom":{}}')

    const all = fetchFleetHistory()
    const filtered = fetchFleetHistory('host-a')

    expect(all.top_errors.length).toBeGreaterThanOrEqual(filtered.top_errors.length)
  })
})
