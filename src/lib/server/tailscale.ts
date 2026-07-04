import { spawn } from 'node:child_process'
import type { TailscaleDiscoveryError, TailscalePeer } from '$lib/types'
import { getConfig } from './config'

let lastError: TailscaleDiscoveryError | null = null

export function getTailscaleError(): TailscaleDiscoveryError | null {
  return lastError
}

function runTailscaleStatus(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('tailscale', ['status', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('tailscale status timed out after 5s'))
    }, 5000)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout)
      }
      else {
        reject(new Error(stderr.trim() || `tailscale status exited with code ${code}`))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

interface TailscalePeerJson {
  HostName?: string
  TailscaleIPs?: string[]
  Online?: boolean
  LastSeen?: string
  Tags?: string[]
}

interface TailscaleStatusJson {
  Peer?: Record<string, TailscalePeerJson>
}

export async function discoverSnapspotPeers(): Promise<TailscalePeer[]> {
  const tag = getConfig().TAILSCALE_TAG

  try {
    const raw = await runTailscaleStatus()
    const parsed = JSON.parse(raw) as TailscaleStatusJson
    const peers: TailscalePeer[] = []

    for (const peer of Object.values(parsed.Peer ?? {})) {
      if (!peer.Tags?.includes(tag)) {
        continue
      }
      const host = peer.HostName
      const ip = peer.TailscaleIPs?.[0]
      if (!host || !ip) {
        continue
      }
      peers.push({
        host,
        tailscale_ip: ip,
        online: peer.Online ?? false,
        last_seen: peer.LastSeen ?? null,
      })
    }

    peers.sort((a, b) => a.host.localeCompare(b.host))
    lastError = null
    return peers
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastError = { message, at: new Date().toISOString() }
    throw err
  }
}
