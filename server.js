import { createServer } from 'node:http'
import { handler } from './build/handler.js'
import { handleTerminalUpgrade } from './terminal-ws.mjs'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const server = createServer(handler)

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws/terminal')) {
    handleTerminalUpgrade(req, socket, head)
  }
  else {
    socket.destroy()
  }
})

server.listen(port, host, () => {
  console.log(`SnapSpot dashboard listening on http://${host}:${port}`)
})
