import { error } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { fleetStore } from '$lib/server/poller'

export async function GET({ params }) {
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

  const ip = agent?.tailscale_ip ?? peer?.tailscale_ip
  if (!ip) {
    throw error(404, 'Agent IP unknown')
  }

  const upstream = await fetch(`http://${ip}:8081/stream`, {
    signal: AbortSignal.timeout(30000),
  })

  if (!upstream.ok || !upstream.body) {
    throw error(502, 'Failed to connect to camera stream')
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache',
    },
  })
}
