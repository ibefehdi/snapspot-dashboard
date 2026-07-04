export type Step = 'HEALTHCHECK' | 'PAYMENT' | 'PHOTO' | 'MONTAGE' | 'PRINT'
export type StepState = 'UPCOMING' | 'CURRENT' | 'DONE' | 'ERROR' | 'SKIP'
export type AgentStatus = 'RUNNING' | 'APP_DOWN' | 'OFFLINE' | 'UNREACHABLE'

export interface JourneyState {
  journey_id: string | null
  active: boolean
  steps: Record<Step, StepState>
  started_at: string | null
  last_event: string
  last_event_at: string
  journey_ok: boolean | null
}

export interface AgentVitals {
  cpu_temp_c: number
  mem_used_pct: number
  disk_used_pct: number
  uptime_s: number
  load1: number
}

export interface SessionStats {
  journeys_in_window: number
  last_journey_ok: boolean | null
  last_print_ok: boolean | null
  avg_journey_duration_s: number | null
}

export interface AgentState {
  host: string
  tailscale_ip: string
  online: boolean
  last_seen: string | null
  status: AgentStatus
  services: { cage: string; ustreamer: string; vector: string }
  journey: JourneyState | null
  app_version: string | null
  vitals: AgentVitals | null
  print_queue: number | null
  session_stats: SessionStats | null
  probe_error: string | null
  probed_at: string
}

export interface LogEntry {
  datetime: string
  level: string
  detail: string
  custom: Record<string, unknown>
  host?: string
  raw?: string
}

export interface ParsedLogLine {
  datetime: string
  level: string
  detail: string
  custom: Record<string, unknown>
}

export interface TailscalePeer {
  host: string
  tailscale_ip: string
  online: boolean
  last_seen: string | null
}

export type RemoteAction = 'restart-app' | 'restart-ustreamer' | 'reboot'

export interface AlertRecord {
  id: string
  host: string
  rule: string
  message: string
  severity: 'warning' | 'critical' | 'recovery'
  at: string
}

export interface FleetSummary {
  running: number
  app_down: number
  offline: number
  unreachable: number
  total: number
  fleet_version: string | null
}

export interface HistoryDayStat {
  date: string
  journeys: number
  success_rate: number
}

export interface HistoryStepStat {
  step: string
  total: number
  success: number
  avg_duration_s: number | null
}

export interface HistoryErrorStat {
  detail: string
  count: number
}

export interface FleetHistory {
  journeys_per_day: HistoryDayStat[]
  step_stats: HistoryStepStat[]
  top_errors: HistoryErrorStat[]
}

export interface VersionChange {
  host: string
  at: string
  app_version: string
}

export interface VitalsSample {
  host: string
  at: string
  cpu_temp_c: number
  mem_used_pct: number
  disk_used_pct: number
  load1: number
}

export interface UptimeSegment {
  status: string
  start_at: string
  end_at: string
  duration_ms: number
}

export interface JourneyRecord {
  id: number
  journey_id: string | null
  host: string
  started_at: string
  ended_at: string | null
  is_ok: boolean | null
  duration_s: number | null
  steps: Record<string, string>
}

export interface TailscaleDiscoveryError {
  message: string
  at: string
}
