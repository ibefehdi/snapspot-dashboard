import { getConfig } from './config'
import { inferJourneyFromLogs } from './journey'
import { sshExecScript } from './ssh'
import type { AgentState, AgentStatus, AgentVitals, TailscalePeer } from '$lib/types'

export const PROBE_SCRIPT = `echo '===SERVICES'
systemctl is-active cage-tty1 ustreamer vector 2>&1
echo '===VITALS'
cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || true
free -b | awk 'NR==2{print $2, $3}'
df -B1 --output=size,used / 2>/dev/null | tail -1
awk '{print $1}' /proc/uptime
awk '{print $1}' /proc/loadavg
echo '===PRINTQ'
lpstat -o 2>/dev/null | wc -l
echo '===LOG'
LOGDIR="$HOME/.local/share/com.snapspot.dev/logs"
LATEST=$(ls -t "$LOGDIR"/*.log 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then tail -n 200 "$LATEST"; fi
`

interface ProbeSections {
  services: string[]
  vitals: AgentVitals | null
  print_queue: number | null
  log: string
}

export function parseProbeOutput(stdout: string): ProbeSections {
  const sections = new Map<string, string>()
  const parts = stdout.split(/^===/m).filter(Boolean)

  for (const part of parts) {
    const newline = part.indexOf('\n')
    if (newline === -1) {
      continue
    }
    const name = part.slice(0, newline).trim()
    const body = part.slice(newline + 1).trim()
    sections.set(name, body)
  }

  const servicesRaw = sections.get('SERVICES')?.split(/\s+/).filter(Boolean) ?? []
  const vitals = parseVitals(sections.get('VITALS') ?? '')
  const printRaw = sections.get('PRINTQ')?.trim()
  const print_queue = printRaw !== undefined && printRaw !== '' ? Number.parseInt(printRaw, 10) : null

  return {
    services: servicesRaw,
    vitals,
    print_queue: Number.isFinite(print_queue) ? print_queue : null,
    log: sections.get('LOG') ?? '',
  }
}

function parseVitals(raw: string): AgentVitals | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 5) {
    return null
  }

  try {
    const tempRaw = Number.parseInt(lines[0], 10)
    const cpu_temp_c = Number.isFinite(tempRaw) ? tempRaw / 1000 : 0
    const [memTotal, memUsed] = lines[1].split(/\s+/).map(Number)
    const [diskTotal, diskUsed] = lines[2].split(/\s+/).map(Number)
    const uptime_s = Number.parseFloat(lines[3])
    const load1 = Number.parseFloat(lines[4])

    const mem_used_pct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0
    const disk_used_pct = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0

    return {
      cpu_temp_c,
      mem_used_pct,
      disk_used_pct,
      uptime_s,
      load1,
    }
  }
  catch {
    return null
  }
}

function deriveStatus(online: boolean, probeError: string | null, cageStatus: string): AgentStatus {
  if (!online) {
    return 'OFFLINE'
  }
  if (probeError) {
    return 'UNREACHABLE'
  }
  if (cageStatus !== 'active') {
    return 'APP_DOWN'
  }
  return 'RUNNING'
}

export async function probeAgent(peer: TailscalePeer): Promise<AgentState> {
  const now = new Date().toISOString()
  const base: AgentState = {
    host: peer.host,
    tailscale_ip: peer.tailscale_ip,
    online: peer.online,
    last_seen: peer.last_seen,
    status: peer.online ? 'UNREACHABLE' : 'OFFLINE',
    services: { cage: 'unknown', ustreamer: 'unknown', vector: 'unknown' },
    journey: null,
    app_version: null,
    vitals: null,
    print_queue: null,
    session_stats: null,
    probe_error: null,
    probed_at: now,
  }

  if (!peer.online) {
    base.status = 'OFFLINE'
    return base
  }

  try {
    const { stdout, stderr, code } = await sshExecScript(peer.host, PROBE_SCRIPT.replace(
      '$HOME/.local/share/com.snapspot.dev/logs',
      getConfig().LOG_DIR,
    ))

    if (code !== 0 && !stdout.includes('===SERVICES')) {
      base.probe_error = stderr.trim() || `SSH probe exited with code ${code}`
      base.status = 'UNREACHABLE'
      return base
    }

    const parsed = parseProbeOutput(stdout)
    const [cage = 'unknown', ustreamer = 'unknown', vector = 'unknown'] = parsed.services

    base.services = { cage, ustreamer, vector }
    base.vitals = parsed.vitals
    base.print_queue = parsed.print_queue

    const { journey, app_version, session_stats } = inferJourneyFromLogs(
      parsed.log,
      getConfig().JOURNEY_STALE_MIN,
    )
    base.journey = journey
    base.app_version = app_version
    base.session_stats = session_stats
    base.status = deriveStatus(peer.online, null, cage)

    return base
  }
  catch (err) {
    base.probe_error = err instanceof Error ? err.message : String(err)
    base.status = 'UNREACHABLE'
    return base
  }
}

export async function fetchAgentLogs(host: string, n: number, source: 'app' | 'journal'): Promise<string> {
  const logDir = getConfig().LOG_DIR

  if (source === 'journal') {
    const { stdout, stderr, code } = await sshExec(
      host,
      `journalctl -u cage-tty1 -n ${n} --no-pager -o cat 2>&1`,
    )
    if (code !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `journalctl failed with code ${code}`)
    }
    return stdout
  }

  const { stdout, stderr, code } = await sshExec(
    host,
    `LATEST=$(ls -t "${logDir}"/*.log 2>/dev/null | head -1); if [ -z "$LATEST" ]; then echo ""; else tail -n ${n} "$LATEST"; fi`,
  )

  if (code !== 0) {
    throw new Error(stderr.trim() || `tail failed with code ${code}`)
  }

  return stdout
}
