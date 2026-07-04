import { createClient } from '@clickhouse/client'
import type { FleetHistory } from '$lib/types'
import { getConfig, isClickHouseConfigured } from './config'

let client: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!isClickHouseConfigured()) {
    throw new Error('ClickHouse is not configured')
  }
  if (!client) {
    const cfg = getConfig()
    client = createClient({
      url: cfg.CLICKHOUSE_URL!,
      username: cfg.CLICKHOUSE_USER!,
      password: cfg.CLICKHOUSE_PASSWORD!,
      database: cfg.CLICKHOUSE_DATABASE,
    })
  }
  return client
}

async function query<T>(sql: string): Promise<T[]> {
  const ch = getClient()
  const result = await ch.query({ query: sql, format: 'JSONEachRow' })
  return result.json<T>()
}

function tableRef(): string {
  const cfg = getConfig()
  return `${cfg.CLICKHOUSE_DATABASE}.${cfg.CLICKHOUSE_TABLE}`
}

/** Vector file source stores raw JSON lines in `message`. */
function detailExpr(): string {
  return `JSONExtractString(message, 'detail')`
}

function datetimeExpr(): string {
  return `parseDateTimeBestEffort(JSONExtractString(message, 'datetime'))`
}

function customField(field: string): string {
  return `JSONExtractRaw(message, 'custom')`
}

function customBool(field: string): string {
  return `JSONExtractBool(${customField('custom')}, '${field}')`
}

function customFloat(field: string): string {
  return `JSONExtractFloat(${customField('custom')}, '${field}')`
}

export async function fetchFleetHistory(): Promise<FleetHistory> {
  const table = tableRef()
  const detail = detailExpr()
  const dt = datetimeExpr()

  const journeys_per_day = await query<{ date: string; journeys: string; success_rate: string }>(`
    SELECT
      toDate(${dt}) AS date,
      countIf(${detail} = 'JOURNEY_START') AS journeys,
      if(
        countIf(${detail} = 'JOURNEY_END') = 0,
        0,
        countIf(${detail} = 'JOURNEY_END' AND ${customBool('is_ok')} = 1)
          / countIf(${detail} = 'JOURNEY_END') * 100
      ) AS success_rate
    FROM ${table}
    WHERE ${dt} >= now() - INTERVAL 30 DAY
    GROUP BY date
    ORDER BY date
  `).catch(() => [])

  const step_stats = await query<{ step: string; total: string; success: string; avg_duration_s: string | null }>(`
    SELECT
      replaceRegexpOne(${detail}, '_END$', '') AS step,
      count() AS total,
      countIf(${customBool('is_ok')} = 1) AS success,
      avg(${customFloat('duration')} / 1e9) AS avg_duration_s
    FROM ${table}
    WHERE ${detail} LIKE '%\\_END'
      AND replaceRegexpOne(${detail}, '_END$', '') IN (
        'HEALTHCHECK', 'HEALTHCHECKS', 'PAYMENT', 'PHOTOLOOP', 'MONTAGE', 'PRINT', 'JOURNEY'
      )
      AND ${dt} >= now() - INTERVAL 30 DAY
    GROUP BY step
    ORDER BY total DESC
  `).catch(() => [])

  const top_errors = await query<{ detail: string; count: string }>(`
    SELECT ${detail} AS detail, count() AS count
    FROM ${table}
    WHERE JSONExtractString(message, 'level') IN ('ERROR', 'WARN')
      AND ${dt} >= now() - INTERVAL 7 DAY
    GROUP BY detail
    ORDER BY count DESC
    LIMIT 20
  `).catch(() => [])

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

export async function isHistoryAvailable(): Promise<boolean> {
  if (!isClickHouseConfigured()) {
    return false
  }
  try {
    const ch = getClient()
    await ch.query({ query: `SELECT 1 FROM ${tableRef()} LIMIT 1`, format: 'JSONEachRow' })
    return true
  }
  catch {
    return false
  }
}
