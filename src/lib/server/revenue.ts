import type {
  HeatmapCell,
  HostRevenueStat,
  PaymentMethodStat,
  RevenueDayStat,
  RevenueFunnel,
  RevenueReport,
} from '$lib/types'
import { getConfig } from './config'
import { getDb } from './db'
import { fetchFleetHosts } from './history'

function hostFilter(host: string | null | undefined, column: string): { clause: string; params: string[] } {
  if (!host) return { clause: '', params: [] }
  return { clause: ` AND ${column} = ?`, params: [host] }
}

const paidJoin = `
  FROM log_events ps
  JOIN log_events pe ON
    json_extract(ps.custom, '$.journey_id') = json_extract(pe.custom, '$.journey_id')
    AND ps.host = pe.host
    AND pe.detail = 'PAYMENT_END'
    AND COALESCE(json_extract(pe.custom, '$.is_ok'), 1) != 0
  WHERE ps.detail = 'PAYMENT_START'
    AND datetime(ps.datetime) >= datetime('now', '-' || ? || ' days')
`

export function fetchRevenueReport(host?: string | null, days = 30): RevenueReport {
  const db = getDb()
  const cfg = getConfig()
  const hf = hostFilter(host, 'ps.host')
  const hfJAlias = hostFilter(host, 'j.host')
  const hfJ = hostFilter(host, 'host')

  const revenue_per_day = db.prepare(`
    SELECT
      substr(ps.datetime, 1, 10) AS date,
      COUNT(*) AS paid_sessions,
      SUM(CASE WHEN COALESCE(CAST(json_extract(ps.custom, '$.fee_amount') AS REAL), 0) = 0 THEN 1 ELSE 0 END) AS free_sessions,
      SUM(COALESCE(CAST(json_extract(ps.custom, '$.fee_amount') AS REAL), 0)) AS revenue
    ${paidJoin}${hf.clause}
    GROUP BY date
    ORDER BY date
  `).all(days, ...hf.params) as Array<{
    date: string
    paid_sessions: number
    free_sessions: number
    revenue: number
  }>

  const funnelRow = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM journeys j
        WHERE datetime(j.started_at) >= datetime('now', '-' || ? || ' days')${hfJAlias.clause}) AS started,
      (SELECT COUNT(DISTINCT json_extract(ps.custom, '$.journey_id'))
        ${paidJoin}${hf.clause}) AS paid,
      (SELECT COUNT(*) FROM journeys j
        WHERE j.is_ok = 1
          AND datetime(j.started_at) >= datetime('now', '-' || ? || ' days')${hfJAlias.clause}) AS completed
  `).get(days, ...hfJAlias.params, days, ...hf.params, days, ...hfJAlias.params) as {
    started: number
    paid: number
    completed: number
  }

  const heatmap = db.prepare(`
    SELECT
      CAST(strftime('%w', started_at) AS INTEGER) AS weekday,
      CAST(strftime('%H', started_at) AS INTEGER) AS hour,
      COUNT(*) AS count
    FROM journeys
    WHERE datetime(started_at) >= datetime('now', '-' || ? || ' days')${hfJ.clause}
    GROUP BY weekday, hour
  `).all(days, ...hfJ.params) as HeatmapCell[]

  const hfM = hostFilter(host, 'host')

  const payment_methods = db.prepare(`
    SELECT
      COALESCE(json_extract(custom, '$.payment_method'), 'unknown') AS method,
      COUNT(*) AS count
    FROM log_events
    WHERE detail = 'MONTAGE_START'
      AND datetime(datetime) >= datetime('now', '-' || ? || ' days')${hfM.clause}
    GROUP BY method
    ORDER BY count DESC
  `).all(days, ...hfM.params) as PaymentMethodStat[]

  const by_host = db.prepare(`
    SELECT
      ps.host,
      COUNT(*) AS paid_sessions,
      SUM(COALESCE(CAST(json_extract(ps.custom, '$.fee_amount') AS REAL), 0)) AS revenue
    ${paidJoin}${hf.clause}
    GROUP BY ps.host
    ORDER BY revenue DESC
  `).all(days, ...hf.params) as HostRevenueStat[]

  return {
    revenue_per_day: revenue_per_day.map(row => ({
      date: row.date,
      paid_sessions: Number(row.paid_sessions),
      free_sessions: Number(row.free_sessions),
      revenue: Number(row.revenue),
    })),
    funnel: {
      started: Number(funnelRow.started),
      paid: Number(funnelRow.paid),
      completed: Number(funnelRow.completed),
    },
    heatmap: heatmap.map(row => ({
      weekday: Number(row.weekday),
      hour: Number(row.hour),
      count: Number(row.count),
    })),
    payment_methods: payment_methods.map(row => ({
      method: String(row.method),
      count: Number(row.count),
    })),
    by_host: by_host.map(row => ({
      host: row.host,
      paid_sessions: Number(row.paid_sessions),
      revenue: Number(row.revenue),
    })),
    currency: cfg.CURRENCY,
  }
}

export { fetchFleetHosts }
