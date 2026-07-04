import { spawn } from 'node:child_process'
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

function buildSshArgs(host: string): string[] {
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

  args.push(`${cfg.SSH_USER}@${host}`)
  return args
}

export async function sshExec(host: string, remoteCommand: string): Promise<{ stdout: string; stderr: string; code: number }> {
  assertValidHost(host)
  const release = await semaphore.acquire()

  try {
    return await new Promise((resolve, reject) => {
      const args = [...buildSshArgs(host), remoteCommand]
      const child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] })

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
      const args = [...buildSshArgs(host), 'bash', '-s']
      const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'] })

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
  return ['ssh', '-t', ...buildSshArgs(host)]
}
