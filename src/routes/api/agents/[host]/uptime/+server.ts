import { error, json } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { computeUptime } from '$lib/server/history'

export async function GET({ params, url }) {
  try {
    assertValidHost(params.host)
  }
  catch {
    throw error(400, 'Invalid hostname')
  }

  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 7), 1), 30)
  const uptime = computeUptime(params.host, days)

  return json({ host: params.host, days, ...uptime })
}
