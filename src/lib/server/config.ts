import { z } from 'zod'

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  SSH_USER: z.string().default('snapspot'),
  SSH_CONCURRENCY: z.coerce.number().default(15),
  SSH_USE_CONTROL_MASTER: z
    .string()
    .default('true')
    .transform(v => v === 'true' || v === '1'),
  USE_TAILSCALE_SSH: z
    .string()
    .default('true')
    .transform(v => v === 'true' || v === '1'),
  SSH_TIMEOUT_MS: z.coerce.number().default(10000),
  POLL_TAILSCALE_MS: z.coerce.number().default(15000),
  POLL_AGENT_MS: z.coerce.number().default(30000),
  JOURNEY_STALE_MIN: z.coerce.number().default(15),
  LOG_DIR: z.string().default('/home/snapspot/.local/share/com.snapspot.dev/logs'),
  TAILSCALE_TAG: z.string().default('tag:snapspot'),
  ALERTS_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  NTFY_TOPIC: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  ALERT_OFFLINE_MIN: z.coerce.number().default(5),
  ALERT_APP_DOWN_MIN: z.coerce.number().default(2),
  ALERT_ERROR_STREAK: z.coerce.number().default(3),
  ALERT_CPU_TEMP_C: z.coerce.number().default(80),
  ALERT_DEBOUNCE_MIN: z.coerce.number().default(60),
  SQLITE_PATH: z.string().default('./data/snapdash.db'),
  HISTORY_RETENTION_DAYS: z.coerce.number().default(90),
  CURRENCY: z.string().default(''),
  PRINT_ROLL_CAPACITY: z.coerce.number().default(700),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  GALLERY_SYNC_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  AWS_REGION: z.string().default(''),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_PREFIX: z.string().default(''),
})

export type Config = z.infer<typeof envSchema>

let cached: Config | null = null

export function resetConfig(): void {
  cached = null
}

export function getConfig(): Config {
  if (!cached) {
    cached = envSchema.parse(process.env)
  }
  return cached
}

export const HOSTNAME_RE = /^[a-z0-9-]+$/

export function assertValidHost(host: string): void {
  if (!HOSTNAME_RE.test(host)) {
    throw new Error(`Invalid hostname: ${host}`)
  }
}

export function isGallerySyncEnabled(): boolean {
  const cfg = getConfig()
  return cfg.GALLERY_SYNC_ENABLED
    && Boolean(cfg.S3_BUCKET)
    && Boolean(cfg.AWS_REGION)
    && Boolean(cfg.REDIS_URL)
}

