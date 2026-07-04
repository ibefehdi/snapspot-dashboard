import { json } from '@sveltejs/kit'
import { fetchFleetHosts, isHistoryAvailable } from '$lib/server/history'
import { fetchRevenueReport } from '$lib/server/revenue'

export async function GET({ url }) {
  if (!isHistoryAvailable()) {
    return json({ available: false, report: null, hosts: [] })
  }

  const host = url.searchParams.get('host') || null
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 30), 1), 365)

  try {
    const report = fetchRevenueReport(host, days)
    const hosts = fetchFleetHosts()
    return json({ available: true, report, hosts })
  }
  catch (err) {
    return json({
      available: false,
      error: err instanceof Error ? err.message : 'Revenue query failed',
      report: null,
      hosts: [],
    })
  }
}
