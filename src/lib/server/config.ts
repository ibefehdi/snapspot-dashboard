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
  CLICKHOUSE_URL: z.string().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  CLICKHOUSE_DATABASE: z.string().default('default'),
  CLICKHOUSE_TABLE: z.string().default('app_logs_etl'),
})

export type Config = z.infer<typeof envSchema>

let cached: Config | null = null

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

export function isClickHouseConfigured(): boolean {
  const cfg = getConfig()
  return Boolean(cfg.CLICKHOUSE_URL && cfg.CLICKHOUSE_USER && cfg.CLICKHOUSE_PASSWORD)
}
