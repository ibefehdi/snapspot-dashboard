<script lang="ts">
  import { onMount } from 'svelte'
  import type { LogEntry } from '$lib/types'
  import LogEntryList from '$lib/components/LogEntryList.svelte'

  let query = $state('')
  let host = $state('')
  let level = $state('')
  let entries = $state<LogEntry[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let hosts = $state<string[]>([])

  async function loadHosts() {
    const res = await fetch('/api/history')
    const data = await res.json()
    hosts = data.hosts ?? []
  }

  async function search() {
    loading = true
    error = null
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (host) params.set('host', host)
      if (level) params.set('level', level)
      params.set('limit', '100')

      const res = await fetch(`/api/logs/search?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      entries = data.entries ?? []
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Search failed'
    }
    finally {
      loading = false
    }
  }

  onMount(() => {
    void loadHosts()
    void search()
  })
</script>

<h1 class="mb-2 text-2xl font-bold text-white">Log Search</h1>
<p class="mb-6 text-sm text-gray-400">Search ingested app logs across the fleet</p>

<form
  class="mb-6 flex flex-wrap gap-3"
  onsubmit={(e) => { e.preventDefault(); void search() }}
>
  <input
    type="search"
    placeholder="Search detail or custom fields…"
    class="min-w-[200px] flex-1 rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white"
    bind:value={query}
  />
  <select class="rounded border border-surface-border bg-surface px-2 py-2 text-sm text-white" bind:value={host}>
    <option value="">All hosts</option>
    {#each hosts as h}
      <option value={h}>{h}</option>
    {/each}
  </select>
  <select class="rounded border border-surface-border bg-surface px-2 py-2 text-sm text-white" bind:value={level}>
    <option value="">All levels</option>
    <option value="ERROR">ERROR</option>
    <option value="WARN">WARN</option>
    <option value="INFO">INFO</option>
    <option value="DEBUG">DEBUG</option>
  </select>
  <button type="submit" class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500">Search</button>
</form>

{#if loading}
  <p class="text-gray-500">Searching…</p>
{:else if error}
  <p class="text-red-400">{error}</p>
{:else}
  <p class="mb-4 text-sm text-gray-500">{entries.length} result(s)</p>
  <LogEntryList {entries} showHost />
{/if}
