import type { AgentState, AgentStatus, FleetSummary, Step, StepState } from '$lib/types'

export function statusLabel(status: AgentStatus): string {
  const labels: Record<AgentStatus, string> = {
    RUNNING: 'Running',
    APP_DOWN: 'App Down',
    OFFLINE: 'Offline',
    UNREACHABLE: 'Unreachable',
  }
  return labels[status]
}

export function statusColor(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    RUNNING: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
    APP_DOWN: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
    OFFLINE: 'bg-gray-500/20 text-gray-400 ring-gray-500/30',
    UNREACHABLE: 'bg-red-500/20 text-red-300 ring-red-500/30',
  }
  return colors[status]
}

export function stepColor(state: StepState): string {
  const colors: Record<StepState, string> = {
    UPCOMING: 'bg-gray-600',
    CURRENT: 'bg-blue-500 step-current',
    DONE: 'bg-emerald-500',
    ERROR: 'bg-red-500',
    SKIP: 'bg-gray-700 border border-dashed border-gray-500',
  }
  return colors[state]
}

export const STEP_LABELS: Record<Step, string> = {
  HEALTHCHECK: 'HC',
  PAYMENT: 'Pay',
  PHOTO: 'Photo',
  MONTAGE: 'Mont',
  PRINT: 'Print',
}

export function formatElapsed(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return '0s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function truncateId(id: string | null, len = 8): string {
  if (!id) return '—'
  return id.length > len ? `${id.slice(0, len)}…` : id
}

export function computeSummary(agents: AgentState[]): FleetSummary {
  const versions = agents.map(a => a.app_version).filter((v): v is string => Boolean(v))
  const versionCounts = new Map<string, number>()
  for (const v of versions) {
    versionCounts.set(v, (versionCounts.get(v) ?? 0) + 1)
  }
  let fleet_version: string | null = null
  let maxCount = 0
  for (const [version, count] of versionCounts) {
    if (count > maxCount) {
      maxCount = count
      fleet_version = version
    }
  }

  return {
    running: agents.filter(a => a.status === 'RUNNING').length,
    app_down: agents.filter(a => a.status === 'APP_DOWN').length,
    offline: agents.filter(a => a.status === 'OFFLINE').length,
    unreachable: agents.filter(a => a.status === 'UNREACHABLE').length,
    total: agents.length,
    fleet_version,
  }
}

export function hasVersionDrift(agent: AgentState, fleetVersion: string | null): boolean {
  return Boolean(fleetVersion && agent.app_version && agent.app_version !== fleetVersion)
}
