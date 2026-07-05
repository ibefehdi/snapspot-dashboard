import { json } from '@sveltejs/kit'
import { fetchGallerySyncStatus, runGallerySync } from '$lib/server/gallery-sync'

export async function GET() {
  try {
    const status = await fetchGallerySyncStatus()
    return json(status)
  }
  catch (err) {
    return json({
      enabled: false,
      running: false,
      last_run_at: null,
      next_run_at: null,
      last_result: null,
      hosts: [],
      error: err instanceof Error ? err.message : 'Failed to load sync status',
    })
  }
}

export async function POST() {
  try {
    const result = await runGallerySync()
    const status = await fetchGallerySyncStatus()
    return json({ result, status })
  }
  catch (err) {
    return json({
      error: err instanceof Error ? err.message : 'Sync failed',
    }, { status: 500 })
  }
}
