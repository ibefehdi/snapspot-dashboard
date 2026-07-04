import { json } from '@sveltejs/kit'
import { fetchMontageByJourney, montageImageUrl } from '$lib/server/gallery'
import { fetchJourneys } from '$lib/server/history'

export async function GET({ url }) {
  const host = url.searchParams.get('host') || null
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const journeys = fetchJourneys(host, limit).map(journey => {
    if (!journey.journey_id) {
      return { ...journey, montage_url: null as string | null }
    }
    const montage = fetchMontageByJourney(journey.host, journey.journey_id)
    return {
      ...journey,
      montage_url: montage
        ? montageImageUrl(montage.host, montage.filepath, montage.journey_id)
        : null,
    }
  })

  return json({ journeys })
}
