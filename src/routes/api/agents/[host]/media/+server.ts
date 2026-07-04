import { json, error } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { markMediaReloaded } from '$lib/server/supplies'
import { fleetStore } from '$lib/server/poller'

export async function POST({ params, request }) {
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

  let capacity: number | undefined
  try {
    const body = await request.json() as { capacity?: number }
    if (typeof body.capacity === 'number' && body.capacity > 0) {
      capacity = Math.floor(body.capacity)
    }
  }
  catch {
    // empty body is fine
  }

  const state = markMediaReloaded(params.host, capacity)
  return json({ ok: true, state })
}
