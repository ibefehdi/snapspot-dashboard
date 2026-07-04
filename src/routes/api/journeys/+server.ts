import { json } from '@sveltejs/kit'
import { fetchJourneys } from '$lib/server/history'

export async function GET({ url }) {
  const host = url.searchParams.get('host') || null
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const journeys = fetchJourneys(host, limit)

  return json({ journeys })
}
