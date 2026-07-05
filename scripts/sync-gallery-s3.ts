import { loadEnv } from './load-env.ts'

loadEnv()

const { initDb, closeDb } = await import('../src/lib/server/db.ts')
const { runGallerySync } = await import('../src/lib/server/gallery-sync.ts')
const { closeRedis } = await import('../src/lib/server/redis.ts')

initDb()

const result = await runGallerySync()

console.log(
  `Gallery sync: ${result.hosts} hosts, ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.failed} failed`,
)
if (result.errors.length > 0) {
  for (const err of result.errors) {
    console.error(err)
  }
}

await closeRedis()
closeDb()

process.exit(result.errors.length > 0 && result.uploaded === 0 && result.skipped === 0 ? 1 : 0)
