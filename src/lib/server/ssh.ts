import { spawn, type SpawnOptions } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { assertValidHost, getConfig } from './config'

class Semaphore {
  private queue: Array<() => void> = []
  private active = 0

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++
      return () => this.release()
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++
        resolve(() => this.release())
      })
    })
  }

  private release() {
    this.active--
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }
}

const semaphore = new Semaphore(getConfig().SSH_CONCURRENCY)

function remoteTarget(host: string): string {
  return `${getConfig().SSH_USER}@${host}`
}

function buildOpenSshArgs(host: string): string[] {
  const cfg = getConfig()
  const args = [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=5',
    '-o',
    'StrictHostKeyChecking=accept-new',
  ]

  if (cfg.SSH_USE_CONTROL_MASTER && process.platform !== 'win32') {
    args.push(
      '-o',
      'ControlMaster=auto',
      '-o',
      `ControlPath=/tmp/snapdash-%r@%h`,
      '-o',
      'ControlPersist=120',
    )
  }

  args.push(remoteTarget(host))
  return args
}

function spawnRemote(host: string, remoteArgs: string[], options: SpawnOptions) {
  const cfg = getConfig()
  if (cfg.USE_TAILSCALE_SSH) {
    return spawn('tailscale', ['ssh', remoteTarget(host), ...remoteArgs], options)
  }
  return spawn('ssh', [...buildOpenSshArgs(host), ...remoteArgs], options)
}

export async function sshExec(host: string, remoteCommand: string): Promise<{ stdout: string; stderr: string; code: number }> {
  assertValidHost(host)
  const release = await semaphore.acquire()

  try {
    return await new Promise((resolve, reject) => {
      const child = spawnRemote(host, [remoteCommand], { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`SSH to ${host} timed out after ${getConfig().SSH_TIMEOUT_MS}ms`))
      }, getConfig().SSH_TIMEOUT_MS)

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ stdout, stderr, code: code ?? 1 })
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }
  finally {
    release()
  }
}

export async function sshExecScript(host: string, script: string): Promise<{ stdout: string; stderr: string; code: number }> {
  assertValidHost(host)
  const release = await semaphore.acquire()

  try {
    return await new Promise((resolve, reject) => {
      const child = spawnRemote(host, ['bash', '-s'], { stdio: ['pipe', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`SSH script to ${host} timed out after ${getConfig().SSH_TIMEOUT_MS}ms`))
      }, getConfig().SSH_TIMEOUT_MS)

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.stdin.write(script)
      child.stdin.end()

      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ stdout, stderr, code: code ?? 1 })
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }
  finally {
    release()
  }
}

export function getSshCommand(host: string): string[] {
  assertValidHost(host)
  const cfg = getConfig()
  if (cfg.USE_TAILSCALE_SSH) {
    return ['tailscale', 'ssh', remoteTarget(host)]
  }
  return ['ssh', '-t', ...buildOpenSshArgs(host)]
}

export async function sshStream(
  host: string,
  remoteCommand: string,
  signal?: AbortSignal,
): Promise<PassThrough> {
  assertValidHost(host)
  const release = await semaphore.acquire()

  return new Promise((resolve, reject) => {
    const child = spawnRemote(host, [remoteCommand], { stdio: ['ignore', 'pipe', 'pipe'] })

    let settled = false
    let stderr = ''

    const cleanup = () => {
      child.kill('SIGTERM')
      release()
    }

    signal?.addEventListener('abort', cleanup, { once: true })

    const failTimer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`SSH stream to ${host} timed out after ${getConfig().SSH_TIMEOUT_MS}ms`))
    }, getConfig().SSH_TIMEOUT_MS)

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.stdout.once('data', (chunk: Buffer) => {
      if (settled) return
      settled = true
      clearTimeout(failTimer)

      const passthrough = new PassThrough()
      passthrough.write(chunk)
      child.stdout.pipe(passthrough)

      child.on('close', () => {
        passthrough.end()
        release()
        signal?.removeEventListener('abort', cleanup)
      })

      resolve(passthrough)
    })

    child.on('close', (code) => {
      clearTimeout(failTimer)
      if (settled) return
      settled = true
      release()
      reject(new Error(stderr.trim() || `SSH stream to ${host} exited with code ${code}`))
    })

    child.on('error', (err) => {
      clearTimeout(failTimer)
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })
  })
}
