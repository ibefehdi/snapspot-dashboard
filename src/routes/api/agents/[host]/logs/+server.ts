import { error, json } from '@sveltejs/kit'
import { assertValidHost } from '$lib/server/config'
import { fetchAgentLogs } from '$lib/server/probe'
import { parseLogEntries } from '$lib/server/journey'

export async function GET({ params, url }) {
  try {
    assertValidHost(params.host)
  }
  catch {
    throw error(400, 'Invalid hostname')
  }

  const n = Math.min(Number(url.searchParams.get('n') ?? 5), 200)
  const source = url.searchParams.get('source') === 'journal' ? 'journal' : 'app'
  const raw = url.searchParams.get('raw') === 'true'

  try {
    const text = await fetchAgentLogs(params.host, n, source)

    if (raw || source === 'journal') {
      return json({ source, raw: text, entries: source === 'app' ? parseLogEntries(text) : [] })
    }

    return json({ source, entries: parseLogEntries(text) })
  }
  catch (err) {
    throw error(502, err instanceof Error ? err.message : 'Failed to fetch logs')
  }
}
