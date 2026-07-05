import { loadEnv } from './load-env.ts'

loadEnv()

const { initDb, closeDb } = await import('../src/lib/server/db.ts')
const { runGallerySync } = await import('../src/lib/server/gallery-sync.ts')
const { closeRedis } = await import('../src/lib/server/redis.ts')

console.log('Gallery sync starting…')

initDb()

const result = await runGallerySync({
  onProgress(event) {
    const prefix = event.host
      ? `[${event.host}${event.journey_id ? `/${event.journey_id}` : ''}]`
      : '[sync]'
    console.log(`${prefix} ${event.message}`)
  },
})

console.log(
  `\nGallery sync: ${result.hosts} hosts, ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.failed} failed`,
)
if (result.errors.length > 0) {
  console.error('\nErrors:')
  for (const err of result.errors) {
    console.error(`  ${err}`)
  }
}

await closeRedis()
closeDb()

process.exit(result.errors.length > 0 && result.uploaded === 0 && result.skipped === 0 ? 1 : 0)
