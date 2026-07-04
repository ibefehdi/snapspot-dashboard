import { chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'

// node-pty 1.1.0 ships spawn-helper without the exec bit on macOS (microsoft/node-pty#850).
if (process.platform === 'darwin') {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const helper = join(process.cwd(), 'node_modules/node-pty/prebuilds', `darwin-${arch}`, 'spawn-helper')
  if (existsSync(helper)) {
    try { chmodSync(helper, 0o755) } catch { /* best effort */ }
  }
}

const HOSTNAME_RE = /^[a-z0-9-]+$/
const SSH_USER = process.env.SSH_USER ?? 'snapspot'
const USE_TAILSCALE_SSH = process.env.USE_TAILSCALE_SSH !== 'false'

const wss = new WebSocketServer({ noServer: true })

function getTerminalCommand(host) {
  if (USE_TAILSCALE_SSH) {
    return ['tailscale', 'ssh', `${SSH_USER}@${host}`]
  }

  const args = [
    'ssh',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=5',
    '-o', 'StrictHostKeyChecking=accept-new',
  ]
  if (process.env.SSH_USE_CONTROL_MASTER !== 'false' && process.platform !== 'win32') {
    args.push('-o', 'ControlMaster=auto', '-o', 'ControlPath=/tmp/snapdash-%r@%h', '-o', 'ControlPersist=120')
  }
  args.push('-t', `${SSH_USER}@${host}`)
  return args
}

function attachPty(ws, host) {
  import('node-pty').then(({ spawn: ptySpawn }) => {
    const cmd = getTerminalCommand(host)
    const pty = ptySpawn(cmd[0], cmd.slice(1), {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      env: process.env,
    })

    pty.onData(data => {
      if (ws.readyState === ws.OPEN) ws.send(data)
    })
    pty.onExit(() => ws.close())

    ws.on('message', (data) => {
      const text = data.toString()
      try {
        const msg = JSON.parse(text)
        if (msg.type === 'resize' && msg.cols && msg.rows) {
          pty.resize(msg.cols, msg.rows)
          return
        }
      }
      catch { /* raw input */ }
      pty.write(text)
    })

    ws.on('close', () => pty.kill())
  }).catch((err) => {
    ws.send(`\r\nFailed to start terminal: ${err.message}\r\n`)
    ws.close()
  })
}

export function handleTerminalUpgrade(req, socket, head) {
  const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
  const host = url.searchParams.get('host')

  if (!host || !HOSTNAME_RE.test(host)) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
    attachPty(ws, host)
  })
}
