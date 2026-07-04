import { Readable } from 'node:stream'
import { error } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { fetchMontageImage, validateMontagePath } from '$lib/server/gallery'
import { fleetStore } from '$lib/server/poller'

export async function GET({ params, url }) {
  try {
    assertValidHost(params.host)
  }
  catch {
    throw error(400, 'Invalid hostname')
  }

  const agent = fleetStore.getAgent(params.host)
  const peer = fleetStore.getPeer(params.host)
  if (!agent && !peer) {
    throw error(404, 'Agent not found')
  }

  const filepath = url.searchParams.get('path')
  const journeyId = url.searchParams.get('journey_id')

  if (!filepath || !journeyId) {
    throw error(400, 'path and journey_id are required')
  }

  if (!validateMontagePath(filepath)) {
    throw error(400, 'Invalid montage path')
  }

  try {
    const { stream } = await fetchMontageImage(params.host, filepath, journeyId)
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }
  catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    throw error(502, `Cannot fetch montage from ${params.host} (${reason})`)
  }
}
