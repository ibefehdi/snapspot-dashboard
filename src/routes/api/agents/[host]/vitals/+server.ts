import { error, json } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { fetchVitalsSamples } from '$lib/server/history'

export async function GET({ params, url }) {
  try {
    assertValidHost(params.host)
  }
  catch {
    throw error(400, 'Invalid hostname')
  }

  const hours = Math.min(Math.max(Number(url.searchParams.get('hours') ?? 24), 1), 168)
  const samples = fetchVitalsSamples(params.host, hours)

  return json({ host: params.host, hours, samples })
}
