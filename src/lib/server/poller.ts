import { EventEmitter } from 'node:events'
import type { AgentState, AlertRecord, FleetSummary, TailscalePeer } from '$lib/types'
import { getConfig } from './config'
import { probeAgent } from './probe'
import { discoverSnapspotPeers, getTailscaleError } from './tailscale'
import { evaluateAlerts, getRecentAlerts } from './alerts'

type FleetEvents = {
  snapshot: AgentState[]
  agent: AgentState
}

declare global {
  // eslint-disable-next-line no-var
  var __snapdashPollerStarted: boolean | undefined
}

class FleetStore extends EventEmitter {
  private agents = new Map<string, AgentState>()
  private peers = new Map<string, TailscalePeer>()
  private tailscaleTimer: ReturnType<typeof setInterval> | null = null
  private agentTimer: ReturnType<typeof setInterval> | null = null
  private probing = false

  getSnapshot(): AgentState[] {
    return [...this.agents.values()].sort((a, b) => a.host.localeCompare(b.host))
  }

  getAgent(host: string): AgentState | undefined {
    return this.agents.get(host)
  }

  getPeer(host: string): TailscalePeer | undefined {
    return this.peers.get(host)
  }

  getSummary(): FleetSummary {
    const snapshot = this.getSnapshot()
    const versions = snapshot
      .map(a => a.app_version)
      .filter((v): v is string => Boolean(v))
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
      running: snapshot.filter(a => a.status === 'RUNNING').length,
      app_down: snapshot.filter(a => a.status === 'APP_DOWN').length,
      offline: snapshot.filter(a => a.status === 'OFFLINE').length,
      unreachable: snapshot.filter(a => a.status === 'UNREACHABLE').length,
      total: snapshot.length,
      fleet_version,
    }
  }

  async refreshTailscale() {
    try {
      const peers = await discoverSnapspotPeers()
      const peerMap = new Map(peers.map(p => [p.host, p]))
      this.peers = peerMap

      for (const peer of peers) {
        const existing = this.agents.get(peer.host)
        if (existing) {
          const updated: AgentState = {
            ...existing,
            online: peer.online,
            last_seen: peer.last_seen,
            tailscale_ip: peer.tailscale_ip,
            status: peer.online
              ? existing.status === 'OFFLINE'
                ? 'UNREACHABLE'
                : existing.status
              : 'OFFLINE',
          }
          this.agents.set(peer.host, updated)
          this.emit('agent', updated)
        }
        else {
          const placeholder: AgentState = {
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
            probed_at: new Date().toISOString(),
          }
          this.agents.set(peer.host, placeholder)
          this.emit('agent', placeholder)
        }
      }

      for (const host of [...this.agents.keys()]) {
        if (!peerMap.has(host)) {
          this.agents.delete(host)
        }
      }
    }
    catch {
      // error stored in getTailscaleError()
    }
  }

  async refreshAgents() {
    if (this.probing) {
      return
    }
    this.probing = true

    try {
      const onlinePeers = [...this.peers.values()].filter(p => p.online)
      const results = await Promise.all(onlinePeers.map(peer => probeAgent(peer)))

      for (const state of results) {
        const prev = this.agents.get(state.host)
        this.agents.set(state.host, state)

        if (!prev || JSON.stringify(prev) !== JSON.stringify(state)) {
          this.emit('agent', state)
          void evaluateAlerts(prev ?? null, state)
        }
      }
    }
    finally {
      this.probing = false
    }
  }

  start() {
    const cfg = getConfig()

    void this.refreshTailscale().then(() => this.refreshAgents())

    this.tailscaleTimer = setInterval(() => {
      void this.refreshTailscale()
    }, cfg.POLL_TAILSCALE_MS)

    this.agentTimer = setInterval(() => {
      void this.refreshAgents()
    }, cfg.POLL_AGENT_MS)
  }

  stop() {
    if (this.tailscaleTimer) {
      clearInterval(this.tailscaleTimer)
    }
    if (this.agentTimer) {
      clearInterval(this.agentTimer)
    }
  }
}

export const fleetStore = new FleetStore()

export function startPoller() {
  if (globalThis.__snapdashPollerStarted) {
    return
  }
  globalThis.__snapdashPollerStarted = true
  fleetStore.start()
}

export function getTailscaleBannerError() {
  return getTailscaleError()
}

export function getAlerts(): AlertRecord[] {
  return getRecentAlerts()
}

export type { FleetEvents }
