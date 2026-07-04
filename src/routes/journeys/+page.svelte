<script lang="ts">
  import { onMount } from 'svelte'
  import type { JourneyRecord } from '$lib/types'

  let journeys = $state<JourneyRecord[]>([])
  let hosts = $state<string[]>([])
  let selectedHost = $state('')
  let expandedId = $state<number | null>(null)
  let loading = $state(true)

  async function loadHosts() {
    const res = await fetch('/api/history')
    const data = await res.json()
    hosts = data.hosts ?? []
  }

  async function load() {
    loading = true
    const params = new URLSearchParams({ limit: '100' })
    if (selectedHost) params.set('host', selectedHost)
    const res = await fetch(`/api/journeys?${params}`)
    const data = await res.json()
    journeys = data.journeys ?? []
    loading = false
  }

  onMount(async () => {
    await loadHosts()
    await load()
  })

  function toggle(id: number) {
    expandedId = expandedId === id ? null : id
  }

  function statusLabel(j: JourneyRecord) {
    if (j.ended_at === null) return 'In progress'
    if (j.is_ok === true) return 'OK'
    if (j.is_ok === false) return 'Failed'
    return 'Unknown'
  }

  function statusClass(j: JourneyRecord) {
    if (j.ended_at === null) return 'text-blue-400'
    if (j.is_ok === true) return 'text-emerald-400'
    if (j.is_ok === false) return 'text-red-400'
    return 'text-gray-400'
  }
</script>

<h1 class="mb-2 text-2xl font-bold text-white">Journey Explorer</h1>
<p class="mb-6 text-sm text-gray-400">Browse completed and in-progress journeys from ingested logs</p>

<div class="mb-6">
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
</div>

{#if loading}
  <p class="text-gray-500">Loading…</p>
{:else if journeys.length === 0}
  <p class="text-gray-500">No journeys recorded yet</p>
{:else}
  <div class="space-y-2">
    {#each journeys as journey}
      <div class="rounded border border-surface-border bg-surface-raised">
        <button
          type="button"
          class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface"
          onclick={() => toggle(journey.id)}
        >
          <div>
            <span class="font-medium text-white">{journey.host}</span>
            <span class="ml-3 text-sm text-gray-500">{new Date(journey.started_at).toLocaleString()}</span>
            {#if journey.duration_s !== null}
              <span class="ml-2 text-sm text-gray-500">{journey.duration_s.toFixed(1)}s</span>
            {/if}
          </div>
          <span class="text-sm {statusClass(journey)}">{statusLabel(journey)}</span>
        </button>

        {#if expandedId === journey.id}
          <div class="border-t border-surface-border px-4 py-3">
            <dl class="mb-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt class="text-gray-500">Journey ID</dt><dd class="font-mono text-white">{journey.journey_id ?? '—'}</dd></div>
              <div><dt class="text-gray-500">Ended</dt><dd class="text-white">{journey.ended_at ? new Date(journey.ended_at).toLocaleString() : '—'}</dd></div>
            </dl>
            <h4 class="mb-2 text-sm font-medium text-gray-400">Steps</h4>
            <div class="flex flex-wrap gap-2">
              {#each Object.entries(journey.steps) as [step, state]}
                <span class="rounded px-2 py-1 text-xs ring-1 ring-surface-border
                  {state === 'DONE' ? 'bg-emerald-500/10 text-emerald-300' : ''}
                  {state === 'ERROR' ? 'bg-red-500/10 text-red-300' : ''}
                  {state === 'CURRENT' ? 'bg-blue-500/10 text-blue-300' : ''}
                  {state === 'SKIP' ? 'bg-gray-500/10 text-gray-400' : ''}
                  {state === 'UPCOMING' ? 'bg-surface text-gray-500' : ''}
                ">
                  {step}: {state}
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
