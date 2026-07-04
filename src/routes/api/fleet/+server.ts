import { json } from '@sveltejs/kit'
import { fleetStore, getTailscaleBannerError } from '$lib/server/poller'

export function GET() {
  return json({
    agents: fleetStore.getSnapshot(),
    summary: fleetStore.getSummary(),
    tailscale_error: getTailscaleBannerError(),
  })
}
