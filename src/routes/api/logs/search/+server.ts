import { json } from '@sveltejs/kit'
import { searchLogs } from '$lib/server/history'

export async function GET({ url }) {
  const q = url.searchParams.get('q') ?? undefined
  const host = url.searchParams.get('host') ?? undefined
  const level = url.searchParams.get('level') ?? undefined
  const limit = Number(url.searchParams.get('limit') ?? 50)

  const entries = searchLogs({ q, host, level, limit })

  return json({ entries, count: entries.length })
}
