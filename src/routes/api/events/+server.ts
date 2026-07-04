import { fleetStore } from '$lib/server/poller'
import type { AgentState } from '$lib/types'

export function GET() {
  let cleanup: (() => void) | undefined

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('snapshot', fleetStore.getSnapshot())

      const onAgent = (agent: AgentState) => {
        send('agent', agent)
      }

      fleetStore.on('agent', onAgent)

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 25000)

      cleanup = () => {
        clearInterval(heartbeat)
        fleetStore.off('agent', onAgent)
      }
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
