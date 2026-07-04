<script lang="ts">
  import { onMount } from 'svelte'
  import type { FleetHistory, VersionChange } from '$lib/types'
  import HistoryCharts from '$lib/components/HistoryCharts.svelte'

  let available = $state(false)
  let history = $state<FleetHistory | null>(null)
  let hosts = $state<string[]>([])
  let versionChanges = $state<VersionChange[]>([])
  let error = $state<string | null>(null)
  let loading = $state(true)
  let selectedHost = $state('')

  async function load() {
    loading = true
    error = null
    try {
      const params = selectedHost ? `?host=${encodeURIComponent(selectedHost)}` : ''
      const res = await fetch(`/api/history${params}`)
      const data = await res.json()
      available = data.available
      history = data.history
      hosts = data.hosts ?? []
      versionChanges = data.version_changes ?? []
      error = data.error ?? null
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load history'
    }
    finally {
      loading = false
    }
  }

  onMount(() => {
    void load()
  })

  function exportUrl(dataset: 'journeys' | 'errors' | 'vitals') {
    const params = new URLSearchParams({ dataset })
    if (selectedHost) params.set('host', selectedHost)
    return `/api/history/export?${params}`
  }
</script>

<h1 class="mb-2 text-2xl font-bold text-white">Fleet History</h1>
<p class="mb-6 text-sm text-gray-400">Local SQLite analytics from probe ingestion</p>

<div class="mb-6 flex flex-wrap items-center gap-3">
  <label class="flex items-center gap-2 text-sm text-gray-400">
    Agent
    <select
      class="rounded border border-surface-border bg-surface px-2 py-1 text-white"
      bind:value={selectedHost}
      onchange={() => load()}
    >
      <option value="">All agents</option>
      {#each hosts as h}
        <option value={h}>{h}</option>
      {/each}
    </select>
  </label>

  <div class="ml-auto flex flex-wrap gap-2">
    <a href={exportUrl('journeys')} class="rounded bg-surface px-3 py-1.5 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white">Export journeys</a>
    <a href={exportUrl('errors')} class="rounded bg-surface px-3 py-1.5 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white">Export errors</a>
    <a href={exportUrl('vitals')} class="rounded bg-surface px-3 py-1.5 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white">Export vitals</a>
  </div>
</div>

{#if loading}
  <p class="text-gray-500">Loading…</p>
{:else if !available}
  <div class="rounded border border-surface-border bg-surface-raised p-6">
    <p class="text-gray-400">History database is not available.</p>
    {#if error}
      <p class="mt-2 text-sm text-red-400">{error}</p>
    {/if}
  </div>
{:else if history}
  <HistoryCharts {history} />

  <section class="mt-8">
    <h3 class="mb-4 text-lg font-semibold text-white">Version rollout</h3>
    {#if versionChanges.length === 0}
      <p class="text-sm text-gray-500">No version changes recorded yet</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-border text-left text-gray-400">
              <th class="py-2 pr-4">When</th>
              <th class="py-2 pr-4">Host</th>
              <th class="py-2">Version</th>
            </tr>
          </thead>
          <tbody>
            {#each versionChanges as change}
              <tr class="border-b border-surface-border/50">
                <td class="py-2 pr-4 text-gray-300">{new Date(change.at).toLocaleString()}</td>
                <td class="py-2 pr-4 text-white">{change.host}</td>
                <td class="py-2 font-mono text-gray-300">{change.app_version.slice(0, 12)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/if}
