import { chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// node-pty 1.1.0 ships spawn-helper without the exec bit on macOS (microsoft/node-pty#850).
const root = join(fileURLToPath(import.meta.url), '../..')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const helper = join(root, 'node_modules/node-pty/prebuilds', `darwin-${arch}`, 'spawn-helper')

if (process.platform === 'darwin' && existsSync(helper)) {
  chmodSync(helper, 0o755)
}
