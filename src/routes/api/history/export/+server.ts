import { error } from '@sveltejs/kit'
import { exportCsv } from '$lib/server/history'

export async function GET({ url }) {
  const dataset = url.searchParams.get('dataset')
  if (dataset !== 'journeys' && dataset !== 'errors' && dataset !== 'vitals') {
    throw error(400, 'dataset must be journeys, errors, or vitals')
  }

  const host = url.searchParams.get('host') || null
  const csv = exportCsv(dataset, host)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="snapdash-${dataset}${host ? `-${host}` : ''}.csv"`,
    },
  })
}
