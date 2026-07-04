import { describe, expect, it, beforeEach } from 'vitest'
import { closeDb, resetDb } from './db'
import { resetIngestCache, ingestLogEvents } from './ingest'
import { fetchRevenueReport } from './revenue'

const REVENUE_LOG = [
  '{"datetime":"2026-07-04T10:00:00.000Z","level":"INFO","detail":"JOURNEY_START","custom":{"journey_id":"j1","app_version":"1.0.0"}}',
  '{"datetime":"2026-07-04T10:00:01.000Z","level":"INFO","detail":"PAYMENT_START","custom":{"journey_id":"j1","fee_amount":15}}',
  '{"datetime":"2026-07-04T10:00:05.000Z","level":"INFO","detail":"PAYMENT_END","custom":{"journey_id":"j1","is_ok":true,"duration":4000000000}}',
  '{"datetime":"2026-07-04T10:00:06.000Z","level":"INFO","detail":"MONTAGE_START","custom":{"journey_id":"j1","payment_method":"PAX_IM20"}}',
  '{"datetime":"2026-07-04T10:00:10.000Z","level":"INFO","detail":"JOURNEY_END","custom":{"journey_id":"j1","is_ok":true,"duration":10000000000}}',
  '{"datetime":"2026-07-04T11:00:00.000Z","level":"INFO","detail":"JOURNEY_START","custom":{"journey_id":"j2","app_version":"1.0.0"}}',
  '{"datetime":"2026-07-04T11:00:01.000Z","level":"INFO","detail":"PAYMENT_START","custom":{"journey_id":"j2","fee_amount":0}}',
  '{"datetime":"2026-07-04T11:00:05.000Z","level":"INFO","detail":"PAYMENT_END","custom":{"journey_id":"j2","is_ok":true,"duration":4000000000}}',
  '{"datetime":"2026-07-04T11:00:10.000Z","level":"INFO","detail":"JOURNEY_END","custom":{"journey_id":"j2","is_ok":true,"duration":10000000000}}',
].join('\n')

describe('revenue', () => {
  beforeEach(() => {
    closeDb()
    resetDb(':memory:')
    resetIngestCache()
    ingestLogEvents('host-a', REVENUE_LOG)
  })

  it('aggregates paid revenue and free sessions', () => {
    const report = fetchRevenueReport('host-a', 30)
    expect(report.revenue_per_day).toHaveLength(1)
    expect(report.revenue_per_day[0].revenue).toBe(15)
    expect(report.revenue_per_day[0].paid_sessions).toBe(2)
    expect(report.revenue_per_day[0].free_sessions).toBe(1)
  })

  it('computes conversion funnel', () => {
    const report = fetchRevenueReport('host-a', 30)
    expect(report.funnel.started).toBe(2)
    expect(report.funnel.paid).toBe(2)
    expect(report.funnel.completed).toBe(2)
  })

  it('groups payment methods', () => {
    const report = fetchRevenueReport('host-a', 30)
    expect(report.payment_methods).toEqual([{ method: 'PAX_IM20', count: 1 }])
  })
})
