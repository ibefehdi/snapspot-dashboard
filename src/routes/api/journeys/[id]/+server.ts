import { error, json } from '@sveltejs/kit'
import { fetchJourneyById } from '$lib/server/history'

export async function GET({ params }) {
  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    throw error(400, 'Invalid journey id')
  }

  const journey = fetchJourneyById(id)
  if (!journey) {
    throw error(404, 'Journey not found')
  }

  return json({ journey })
}
