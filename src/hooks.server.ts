import { startPoller } from '$lib/server/poller'
import type { Handle } from '@sveltejs/kit'

startPoller()

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event)
}
