<script lang="ts">
  import type { LogEntry } from '$lib/types'

  let {
    host,
    open = $bindable(false),
  }: {
    host: string
    open?: boolean
  } = $props()

  let entries = $state<LogEntry[]>([])
  let raw = $state('')
  let loading = $state(false)
  let error = $state<string | null>(null)
  let count = $state(5)
  let source = $state<'app' | 'journal'>('app')
  let showRaw = $state(false)

  async function load() {
    loading = true
    error = null
    try {
      const res = await fetch(`/api/agents/${host}/logs?n=${count}&source=${source}&raw=${showRaw}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      entries = data.entries ?? []
      raw = data.raw ?? ''
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load logs'
    }
    finally {
      loading = false
    }
  }

  $effect(() => {
    if (open) {
      void load()
    }
  })

  function levelColor(level: string) {
    if (level === 'ERROR') return 'text-red-400'
    if (level === 'WARN') return 'text-amber-400'
    if (level === 'DEBUG') return 'text-gray-500'
    return 'text-blue-300'
  }
</script>

{#if open}
  <div class="fixed inset-0 z-40 flex justify-end bg-black/40">
    <div class="flex h-full w-full max-w-xl flex-col border-l border-surface-border bg-surface-raised shadow-xl">
      <div class="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h3 class="font-semibold text-white">Logs — {host}</h3>
        <button type="button" class="text-gray-400 hover:text-white" onclick={() => open = false}>✕</button>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-surface-border px-4 py-2">
        <button
          type="button"
          class="rounded px-2 py-1 text-xs {count === 5 ? 'bg-blue-600 text-white' : 'bg-surface text-gray-400'}"
          onclick={() => { count = 5; void load() }}
        >Last 5</button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs {count === 50 ? 'bg-blue-600 text-white' : 'bg-surface text-gray-400'}"
          onclick={() => { count = 50; void load() }}
        >Last 50</button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs {source === 'journal' ? 'bg-blue-600 text-white' : 'bg-surface text-gray-400'}"
          onclick={() => { source = source === 'app' ? 'journal' : 'app'; void load() }}
        >{source === 'app' ? 'App logs' : 'Journal'}</button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs {showRaw ? 'bg-blue-600 text-white' : 'bg-surface text-gray-400'}"
          onclick={() => { showRaw = !showRaw; void load() }}
        >Raw</button>
        <button type="button" class="ml-auto rounded px-2 py-1 text-xs text-gray-400 hover:text-white" onclick={() => load()}>Refresh</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {#if loading}
          <p class="text-gray-500">Loading…</p>
        {:else if error}
          <p class="text-red-400">{error}</p>
        {:else if showRaw || source === 'journal'}
          <pre class="whitespace-pre-wrap text-gray-300">{raw || '(empty)'}</pre>
        {:else if entries.length === 0}
          <p class="text-gray-500">No log entries</p>
        {:else}
          {#each entries as entry}
            <div class="mb-3 rounded border border-surface-border bg-surface p-3">
              <div class="flex gap-2">
                <span class="text-gray-500">{new Date(entry.datetime).toLocaleString()}</span>
                <span class={levelColor(entry.level)}>{entry.level}</span>
              </div>
              <div class="mt-1 font-medium text-white">{entry.detail}</div>
              {#if Object.keys(entry.custom).length > 0}
                <details class="mt-2">
                  <summary class="cursor-pointer text-gray-500">custom</summary>
                  <pre class="mt-1 text-gray-400">{JSON.stringify(entry.custom, null, 2)}</pre>
                </details>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
