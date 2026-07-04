import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { handleTerminalUpgrade } from './terminal-ws.mjs'

function terminalWebSocketPlugin() {
  return {
    name: 'terminal-websocket',
    configureServer(server: import('vite').ViteDevServer) {
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/ws/terminal')) {
          handleTerminalUpgrade(req, socket, head)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [sveltekit(), terminalWebSocketPlugin()],
  server: {
    port: 5173,
  },
})
