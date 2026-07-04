<script lang="ts">
  import { onMount } from 'svelte'
  import { FitAddon } from '@xterm/addon-fit'
  import { Terminal } from '@xterm/xterm'
  import '@xterm/xterm/css/xterm.css'

  let { host }: { host: string } = $props()

  let container: HTMLDivElement
  let connected = $state(false)
  let error = $state<string | null>(null)

  onMount(() => {
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0f1419',
        foreground: '#e2e8f0',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal?host=${encodeURIComponent(host)}`)

    ws.onopen = () => {
      connected = true
      term.writeln(`Connected to ${host}…`)
      sendResize()
    }

    ws.onmessage = (ev) => {
      term.write(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data))
    }

    ws.onerror = () => {
      error = 'WebSocket connection failed'
    }

    ws.onclose = () => {
      connected = false
      term.writeln('\r\nConnection closed.')
    }

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    function sendResize() {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      sendResize()
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  })
</script>

<div class="rounded-lg border border-surface-border bg-black">
  <div class="flex items-center justify-between border-b border-surface-border px-3 py-2 text-xs">
    <span class="text-gray-400">SSH terminal — {host}</span>
    <span class={connected ? 'text-emerald-400' : 'text-gray-500'}>{connected ? 'Connected' : 'Disconnected'}</span>
  </div>
  {#if error}
    <p class="p-3 text-sm text-red-400">{error}</p>
  {/if}
  <div bind:this={container} class="h-96 p-2"></div>
</div>
