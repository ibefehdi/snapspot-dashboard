<script lang="ts">
  import { onMount } from 'svelte'
  import type { AgentState, AlertRecord, AgentStatus } from '$lib/types'
  import AgentCard from '$lib/components/AgentCard.svelte'
  import AlertBell from '$lib/components/AlertBell.svelte'
  import { computeSummary } from '$lib/utils'

  let agents = $state<AgentState[]>([])
  let alerts = $state<AlertRecord[]>([])
  let tailscaleError = $state<string | null>(null)
  let filterStatus = $state<AgentStatus | 'ALL'>('ALL')
  let search = $state('')
  let sortBy = $state<'host' | 'status'>('host')

  const summary = $derived(computeSummary(agents))
  const fleetVersion = $derived(summary.fleet_version)

  const filtered = $derived(
    agents
      .filter((a) => {
        if (filterStatus !== 'ALL' && a.status !== filterStatus) return false
        if (search && !a.host.includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'status') return a.status.localeCompare(b.status)
        return a.host.localeCompare(b.host)
      }),
  )

  onMount(() => {
    void fetch('/api/fleet')
      .then(r => r.json())
      .then((data) => {
        agents = data.agents ?? []
        if (data.tailscale_error?.message) {
          tailscaleError = `Tailscale: ${data.tailscale_error.message}`
        }
      })

    void fetch('/api/alerts')
      .then(r => r.json())
      .then(data => { alerts = data.alerts ?? [] })

    const es = new EventSource('/api/events')

    es.addEventListener('snapshot', (ev) => {
      agents = JSON.parse((ev as MessageEvent).data)
    })

    es.addEventListener('agent', (ev) => {
      const updated = JSON.parse((ev as MessageEvent).data) as AgentState
      const idx = agents.findIndex(a => a.host === updated.host)
      if (idx === -1) {
        agents = [...agents, updated]
      }
      else {
        agents = agents.map(a => a.host === updated.host ? updated : a)
      }
    })

    es.onerror = () => {
      tailscaleError = 'Lost connection to fleet stream — retrying…'
    }

    const alertPoll = setInterval(() => {
      void fetch('/api/alerts')
        .then(r => r.json())
        .then(data => { alerts = data.alerts ?? [] })
    }, 30000)

    return () => {
      es.close()
      clearInterval(alertPoll)
    }
  })
</script>

<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
  <div>
    <h1 class="text-2xl font-bold text-white">Fleet</h1>
    <p class="mt-1 text-sm text-gray-400">
      {summary.running} running · {summary.app_down} app down · {summary.offline} offline · {summary.unreachable} unreachable
      {#if fleetVersion}
        · fleet version <code class="text-xs text-gray-300">{fleetVersion.slice(0, 8)}</code>
      {/if}
    </p>
  </div>
  <AlertBell {alerts} />
</div>

{#if tailscaleError}
  <div class="mb-4 rounded border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
    {tailscaleError}
  </div>
{/if}

<div class="mb-6 flex flex-wrap gap-3">
  <input
    type="search"
    placeholder="Search hostname…"
    bind:value={search}
    class="rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder-gray-500"
  />
  <select bind:value={filterStatus} class="rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white">
    <option value="ALL">All statuses</option>
    <option value="RUNNING">Running</option>
    <option value="APP_DOWN">App Down</option>
    <option value="OFFLINE">Offline</option>
    <option value="UNREACHABLE">Unreachable</option>
  </select>
  <select bind:value={sortBy} class="rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white">
    <option value="host">Sort by hostname</option>
    <option value="status">Sort by status</option>
  </select>
</div>

{#if filtered.length === 0}
  <p class="text-gray-500">No agents match your filters. Waiting for Tailscale discovery…</p>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each filtered as agent (agent.host)}
      <AgentCard {agent} {fleetVersion} />
    {/each}
  </div>
{/if}
