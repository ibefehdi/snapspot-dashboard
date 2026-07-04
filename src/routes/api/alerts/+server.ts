import { json } from '@sveltejs/kit'
import { getAlerts } from '$lib/server/poller'

export function GET() {
  return json({ alerts: getAlerts() })
}
