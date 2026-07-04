import { json } from '@sveltejs/kit'
import { fetchAllSupplies, fetchSuppliesForHost } from '$lib/server/supplies'
import { isHistoryAvailable } from '$lib/server/history'
import { assertValidHost } from '$lib/server/config'

export async function GET({ url }) {
  if (!isHistoryAvailable()) {
    return json({ available: false, supplies: [] })
  }

  const host = url.searchParams.get('host')

  try {
    if (host) {
      try {
        assertValidHost(host)
      }
      catch {
        return json({ available: true, supplies: [] })
      }
      return json({ available: true, supplies: [fetchSuppliesForHost(host)] })
    }
    return json({ available: true, supplies: fetchAllSupplies() })
  }
  catch (err) {
    return json({
      available: false,
      error: err instanceof Error ? err.message : 'Supplies query failed',
      supplies: [],
    })
  }
}
