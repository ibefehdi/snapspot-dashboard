import { json } from '@sveltejs/kit'
import { fetchGalleryItems } from '$lib/server/gallery'
import { fetchFleetHosts, isHistoryAvailable } from '$lib/server/history'

export async function GET({ url }) {
  if (!isHistoryAvailable()) {
    return json({ available: false, items: [], hosts: [] })
  }

  const host = url.searchParams.get('host') || null
  const limit = Number(url.searchParams.get('limit') ?? 50)

  try {
    const items = fetchGalleryItems(host, limit)
    const hosts = fetchFleetHosts()
    return json({ available: true, items, hosts })
  }
  catch (err) {
    return json({
      available: false,
      error: err instanceof Error ? err.message : 'Gallery query failed',
      items: [],
      hosts: [],
    })
  }
}
