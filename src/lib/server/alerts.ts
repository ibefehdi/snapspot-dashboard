import type { AgentState, AlertRecord } from '$lib/types'
import { getConfig } from './config'
import { getDb } from './db'

const recentAlerts: AlertRecord[] = []
const alertCooldown = new Map<string, number>()
const conditionSince = new Map<string, number>()
const errorStreaks = new Map<string, number>()

interface AlertSink {
  send(title: string, body: string, priority?: number): Promise<void>
}

class NtfySink implements AlertSink {
  constructor(private topic: string) {}

  async send(title: string, body: string, priority = 3) {
    await fetch(`https://ntfy.sh/${this.topic}`, {
      method: 'POST',
      headers: {
        Title: title,
        Priority: String(priority),
        Tags: 'warning',
      },
      body,
    })
  }
}

class TelegramSink implements AlertSink {
  constructor(
    private token: string,
    private chatId: string,
  ) {}

  async send(title: string, body: string) {
    const text = `*${title}*\n${body}`
    await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
      }),
    })
  }
}

function getSinks(): AlertSink[] {
  const cfg = getConfig()
  const sinks: AlertSink[] = []
  if (cfg.NTFY_TOPIC) {
    sinks.push(new NtfySink(cfg.NTFY_TOPIC))
  }
  if (cfg.TELEGRAM_BOT_TOKEN && cfg.TELEGRAM_CHAT_ID) {
    sinks.push(new TelegramSink(cfg.TELEGRAM_BOT_TOKEN, cfg.TELEGRAM_CHAT_ID))
  }
  return sinks
}

function recordAlert(alert: AlertRecord) {
  recentAlerts.unshift(alert)
  if (recentAlerts.length > 100) {
    recentAlerts.pop()
  }

  try {
    getDb().prepare(`
      INSERT OR REPLACE INTO alerts (id, host, rule, message, severity, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(alert.id, alert.host, alert.rule, alert.message, alert.severity, alert.at)
  }
  catch {
    // DB may not be initialized in tests
  }
}

function canFire(key: string): boolean {
  const cfg = getConfig()
  const last = alertCooldown.get(key) ?? 0
  const debounceMs = cfg.ALERT_DEBOUNCE_MIN * 60 * 1000
  return Date.now() - last >= debounceMs
}

async function fireAlert(host: string, rule: string, message: string, severity: AlertRecord['severity']) {
  const key = `${host}:${rule}`
  if (!canFire(key)) {
    return
  }
  alertCooldown.set(key, Date.now())

  const alert: AlertRecord = {
    id: `${key}-${Date.now()}`,
    host,
    rule,
    message,
    severity,
    at: new Date().toISOString(),
  }
  recordAlert(alert)

  const cfg = getConfig()
  if (!cfg.ALERTS_ENABLED) {
    return
  }

  const sinks = getSinks()
  const title = `[SnapSpot] ${host} — ${rule}`
  await Promise.allSettled(sinks.map(s => s.send(title, message, severity === 'critical' ? 5 : 3)))
}

async function fireRecovery(host: string, rule: string, message: string) {
  const key = `${host}:${rule}`
  if (!conditionSince.has(key)) {
    return
  }
  conditionSince.delete(key)
  await fireAlert(host, `${rule}_recovery`, message, 'recovery')
}

export async function evaluateAlerts(prev: AgentState | null, current: AgentState) {
  const cfg = getConfig()
  const host = current.host
  const now = Date.now()

  // Offline > threshold
  if (current.status === 'OFFLINE') {
    const key = `${host}:offline`
    if (!conditionSince.has(key)) {
      conditionSince.set(key, now)
    }
    const since = conditionSince.get(key)!
    if (now - since >= cfg.ALERT_OFFLINE_MIN * 60 * 1000) {
      await fireAlert(host, 'offline', `Agent ${host} has been offline for ${cfg.ALERT_OFFLINE_MIN}+ minutes`, 'critical')
    }
  }
  else {
    await fireRecovery(host, 'offline', `Agent ${host} is back online`)
  }

  // App down > threshold
  if (current.online && current.services.cage !== 'active') {
    const key = `${host}:app_down`
    if (!conditionSince.has(key)) {
      conditionSince.set(key, now)
    }
    const since = conditionSince.get(key)!
    if (now - since >= cfg.ALERT_APP_DOWN_MIN * 60 * 1000) {
      await fireAlert(host, 'app_down', `cage-tty1 not active on ${host} for ${cfg.ALERT_APP_DOWN_MIN}+ minutes`, 'warning')
    }
  }
  else {
    await fireRecovery(host, 'app_down', `App running again on ${host}`)
  }

  // Error streak on journeys
  if (current.journey?.last_event === 'JOURNEY_END' && current.journey.journey_ok === false) {
    const streak = (errorStreaks.get(host) ?? 0) + 1
    errorStreaks.set(host, streak)
    if (streak >= cfg.ALERT_ERROR_STREAK) {
      await fireAlert(host, 'error_streak', `${streak} consecutive failed journeys on ${host}`, 'warning')
      errorStreaks.set(host, 0)
    }
  }
  else if (current.journey?.journey_ok === true) {
    errorStreaks.set(host, 0)
  }

  // High CPU temp
  if (current.vitals && current.vitals.cpu_temp_c > cfg.ALERT_CPU_TEMP_C) {
    const key = `${host}:high_temp`
    if (!conditionSince.has(key)) {
      conditionSince.set(key, now)
    }
    await fireAlert(
      host,
      'high_temp',
      `CPU temperature ${current.vitals.cpu_temp_c.toFixed(1)}°C on ${host}`,
      'warning',
    )
  }
  else {
    await fireRecovery(host, 'high_temp', `CPU temperature normal on ${host}`)
  }
}

export function getRecentAlerts(limit = 100): AlertRecord[] {
  try {
    const rows = getDb().prepare(`
      SELECT id, host, rule, message, severity, at
      FROM alerts
      ORDER BY at DESC
      LIMIT ?
    `).all(limit) as AlertRecord[]

    if (rows.length > 0) {
      return rows
    }
  }
  catch {
    // fall through to in-memory buffer
  }

  return [...recentAlerts]
}
