<script lang="ts">
  import { onMount } from 'svelte'
  import type { RevenueReport } from '$lib/types'
  import RevenueCharts from '$lib/components/RevenueCharts.svelte'

  let available = $state(false)
  let report = $state<RevenueReport | null>(null)
  let hosts = $state<string[]>([])
  let error = $state<string | null>(null)
  let loading = $state(true)
  let selectedHost = $state('')
  let days = $state(30)

  async function load() {
    loading = true
    error = null
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (selectedHost) params.set('host', selectedHost)
      const res = await fetch(`/api/revenue?${params}`)
      const data = await res.json()
      available = data.available
      report = data.report
      hosts = data.hosts ?? []
      error = data.error ?? null
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load revenue'
    }
    finally {
      loading = false
    }
  }

  onMount(() => {
    void load()
  })
</script>

<h1 class="mb-2 text-2xl font-bold text-white">Revenue & Usage</h1>
<p class="mb-6 text-sm text-gray-400">Payment analytics from ingested journey logs</p>

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

  <label class="flex items-center gap-2 text-sm text-gray-400">
    Period
    <select
      class="rounded border border-surface-border bg-surface px-2 py-1 text-white"
      bind:value={days}
      onchange={() => load()}
    >
      <option value={7}>7 days</option>
      <option value={30}>30 days</option>
      <option value={90}>90 days</option>
    </select>
  </label>
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
{:else if report}
  <RevenueCharts {report} />
{/if}
