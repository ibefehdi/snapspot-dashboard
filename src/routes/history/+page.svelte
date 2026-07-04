<script lang="ts">
  import { onMount } from 'svelte'
  import type { FleetHistory } from '$lib/types'
  import HistoryCharts from '$lib/components/HistoryCharts.svelte'

  let available = $state(false)
  let history = $state<FleetHistory | null>(null)
  let error = $state<string | null>(null)
  let loading = $state(true)

  onMount(async () => {
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      available = data.available
      history = data.history
      error = data.error ?? null
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load history'
    }
    finally {
      loading = false
    }
  })
</script>

<h1 class="mb-2 text-2xl font-bold text-white">Fleet History</h1>
<p class="mb-6 text-sm text-gray-400">Fleet-wide analytics from ClickHouse (no per-agent hostname in logs yet)</p>

{#if loading}
  <p class="text-gray-500">Loading…</p>
{:else if !available}
  <div class="rounded border border-surface-border bg-surface-raised p-6">
    <p class="text-gray-400">ClickHouse history is not configured or unavailable.</p>
    {#if error}
      <p class="mt-2 text-sm text-red-400">{error}</p>
    {/if}
    <p class="mt-4 text-sm text-gray-500">Set <code>CLICKHOUSE_URL</code>, <code>CLICKHOUSE_USER</code>, and <code>CLICKHOUSE_PASSWORD</code> in your environment.</p>
  </div>
{:else if history}
  <HistoryCharts {history} />
{/if}
