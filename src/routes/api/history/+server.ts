import { json } from '@sveltejs/kit'
import {
  fetchFleetHistory,
  fetchFleetHosts,
  fetchVersionChanges,
  isHistoryAvailable,
} from '$lib/server/history'

export async function GET({ url }) {
  const available = isHistoryAvailable()
  if (!available) {
    return json({ available: false, history: null, hosts: [], version_changes: [] })
  }

  const host = url.searchParams.get('host') || null

  try {
    const history = fetchFleetHistory(host)
    const version_changes = fetchVersionChanges(host)
    const hosts = fetchFleetHosts()
    return json({ available: true, history, hosts, version_changes })
  }
  catch (err) {
    return json({
      available: false,
      error: err instanceof Error ? err.message : 'History query failed',
      history: null,
      hosts: [],
      version_changes: [],
    })
  }
}
