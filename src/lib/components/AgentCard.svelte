<script lang="ts">
  import type { AgentState } from '$lib/types'
  import StepIndicator from './StepIndicator.svelte'
  import VitalsBar from './VitalsBar.svelte'
  import LogsPanel from './LogsPanel.svelte'
  import {
    formatElapsed,
    hasVersionDrift,
    statusColor,
    statusLabel,
    truncateId,
  } from '$lib/utils'

  let {
    agent,
    fleetVersion,
    onOpenLogs,
  }: {
    agent: AgentState
    fleetVersion: string | null
    onOpenLogs?: (host: string) => void
  } = $props()

  let logsOpen = $state(false)
  const drift = $derived(hasVersionDrift(agent, fleetVersion))
</script>

<article class="rounded-lg border border-surface-border bg-surface-raised p-4 transition hover:border-gray-600">
  <div class="flex items-start justify-between gap-2">
    <div>
      <a href="/agent/{agent.host}" class="font-medium text-white hover:text-blue-300">{agent.host}</a>
      <p class="mt-0.5 font-mono text-xs text-gray-500">{agent.tailscale_ip}</p>
    </div>
    <span class="rounded-full px-2 py-0.5 text-xs ring-1 {statusColor(agent.status)}">
      {statusLabel(agent.status)}
    </span>
  </div>

  {#if drift}
    <span class="mt-2 inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300" title="Fleet: {fleetVersion} · Agent: {agent.app_version}">
      Version drift
    </span>
  {/if}

  {#if agent.print_queue !== null && agent.print_queue > 0}
    <span class="mt-2 ml-1 inline-block rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
      {agent.print_queue} print job{agent.print_queue === 1 ? '' : 's'}
    </span>
  {/if}

  <div class="mt-3">
    {#if agent.journey}
      <StepIndicator steps={agent.journey.steps} compact />
      <p class="mt-2 text-xs text-gray-400">
        {#if agent.journey.active}
          <span class="text-blue-300">Active</span> · {truncateId(agent.journey.journey_id)} · {formatElapsed(agent.journey.started_at)}
        {:else}
          Idle · last: {agent.journey.last_event}
        {/if}
      </p>
    {:else}
      <p class="text-xs text-gray-500">No journey data</p>
    {/if}
  </div>

  {#if agent.vitals}
    <div class="mt-3">
      <VitalsBar vitals={agent.vitals} />
    </div>
  {/if}

  {#if agent.session_stats && agent.session_stats.journeys_in_window > 0}
    <p class="mt-2 text-xs text-gray-500">
      Recent: {agent.session_stats.journeys_in_window} journey(s)
      {#if agent.session_stats.avg_journey_duration_s !== null}
        · avg {agent.session_stats.avg_journey_duration_s.toFixed(0)}s
      {/if}
    </p>
  {/if}

  {#if agent.probe_error}
    <p class="mt-2 text-xs text-red-400">{agent.probe_error}</p>
  {/if}

  <div class="mt-4 flex flex-wrap gap-2">
    <button
      type="button"
      class="rounded bg-surface px-2 py-1 text-xs text-gray-300 ring-1 ring-surface-border hover:text-white"
      onclick={() => { logsOpen = true; onOpenLogs?.(agent.host) }}
    >
      Logs
    </button>
    <a
      href="/agent/{agent.host}"
      class="rounded bg-surface px-2 py-1 text-xs text-gray-300 ring-1 ring-surface-border hover:text-white"
    >
      Details
    </a>
  </div>

  <p class="mt-2 text-[10px] text-gray-600">Probed {new Date(agent.probed_at).toLocaleTimeString()}</p>
</article>

<LogsPanel host={agent.host} bind:open={logsOpen} />
