import { Readable } from 'node:stream'
import { error } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { fleetStore } from '$lib/server/poller'
import { sshStream } from '$lib/server/ssh'

const STREAM_HEADERS = {
  'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
  'Cache-Control': 'no-cache',
}

export async function GET({ params, request }) {
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

  try {
    const upstream = await fetch(`http://${ip}:8081/stream`, {
      signal: AbortSignal.timeout(5000),
    })

    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        headers: {
          ...STREAM_HEADERS,
          'Content-Type': upstream.headers.get('Content-Type') ?? STREAM_HEADERS['Content-Type'],
        },
      })
    }
  }
  catch {
    // ustreamer typically binds to 127.0.0.1 — fall through to SSH proxy
  }

  try {
    const stream = await sshStream(
      params.host,
      'curl -s -N http://127.0.0.1:8081/stream',
      request.signal,
    )

    return new Response(Readable.toWeb(stream) as ReadableStream, { headers: STREAM_HEADERS })
  }
  catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    throw error(502, `Cannot reach ustreamer on ${params.host} (${reason})`)
  }
}
