import { startPoller } from '$lib/server/poller'
import { initDb, startRetentionJob } from '$lib/server/db'
import type { Handle } from '@sveltejs/kit'

initDb()
startRetentionJob()
startPoller()

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event)
}
