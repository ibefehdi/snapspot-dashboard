import { json } from '@sveltejs/kit'
import { fetchFleetHistory, isHistoryAvailable } from '$lib/server/clickhouse'

export async function GET() {
  const available = await isHistoryAvailable()
  if (!available) {
    return json({ available: false, history: null })
  }

  try {
    const history = await fetchFleetHistory()
    return json({ available: true, history })
  }
  catch (err) {
    return json({
      available: false,
      error: err instanceof Error ? err.message : 'ClickHouse query failed',
      history: null,
    })
  }
}
