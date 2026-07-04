<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import type { AgentState, UptimeSegment, VitalsSample } from '$lib/types'
  import StepIndicator from '$lib/components/StepIndicator.svelte'
  import VitalsBar from '$lib/components/VitalsBar.svelte'
  import Sparkline from '$lib/components/Sparkline.svelte'
  import UptimeBar from '$lib/components/UptimeBar.svelte'
  import LogsPanel from '$lib/components/LogsPanel.svelte'
  import CameraPeek from '$lib/components/CameraPeek.svelte'
  import type { Component } from 'svelte'
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
  import SuppliesCard from '$lib/components/SuppliesCard.svelte'
  import type { SuppliesStatus } from '$lib/types'
  import {
    formatElapsed,
    hasVersionDrift,
    statusColor,
    statusLabel,
    truncateId,
  } from '$lib/utils'

  const host = $derived($page.params.host!)

  let agent = $state<AgentState | null>(null)
  let fleetVersion = $state<string | null>(null)
  let logsOpen = $state(false)
  let cameraOpen = $state(false)
  let confirmReboot = $state(false)
  let actionMessage = $state<string | null>(null)
  let actionError = $state<string | null>(null)
  let tab = $state<'overview' | 'terminal'>('overview')
  let Terminal = $state<Component<{ host: string }> | null>(null)

  async function showTerminal() {
    tab = 'terminal'
    if (!Terminal) {
      const mod = await import('$lib/components/Terminal.svelte')
      Terminal = mod.default
    }
  }
  let vitalsSamples = $state<VitalsSample[]>([])
  let uptimePct = $state(100)
  let uptimeSegments = $state<UptimeSegment[]>([])
  let supplies = $state<SuppliesStatus | null>(null)
  let confirmReload = $state(false)

  async function loadHistory() {
    const [vitalsRes, uptimeRes, suppliesRes] = await Promise.all([
      fetch(`/api/agents/${host}/vitals?hours=24`),
      fetch(`/api/agents/${host}/uptime?days=7`),
      fetch(`/api/supplies?host=${encodeURIComponent(host)}`),
    ])
    if (vitalsRes.ok) {
      const data = await vitalsRes.json()
      vitalsSamples = data.samples ?? []
    }
    if (uptimeRes.ok) {
      const data = await uptimeRes.json()
      uptimePct = data.availability_pct ?? 100
      uptimeSegments = data.segments ?? []
    }
    if (suppliesRes.ok) {
      const data = await suppliesRes.json()
      supplies = (data.supplies as SuppliesStatus[] | undefined)?.[0] ?? null
    }
  }

  async function markMediaReloaded() {
    const res = await fetch(`/api/agents/${host}/media`, { method: 'POST' })
    if (res.ok) {
      await loadHistory()
      actionMessage = 'Media reload recorded'
    }
    else {
      actionError = 'Failed to record media reload'
    }
  }

  async function loadAgent() {
    const res = await fetch('/api/fleet')
    const data = await res.json()
    agent = (data.agents as AgentState[]).find(a => a.host === host) ?? null
    fleetVersion = data.summary?.fleet_version ?? null
  }

  async function runAction(action: 'restart-app' | 'restart-ustreamer' | 'reboot') {
    actionMessage = null
    actionError = null
    const res = await fetch(`/api/agents/${host}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (data.ok) {
      actionMessage = data.message || 'Action completed'
    }
    else {
      actionError = data.message || 'Action failed'
    }
  }

  onMount(() => {
    void loadAgent()
    void loadHistory()
    const es = new EventSource('/api/events')
    es.addEventListener('agent', (ev) => {
      const updated = JSON.parse((ev as MessageEvent).data) as AgentState
      if (updated.host === host) agent = updated
    })
    es.addEventListener('snapshot', (ev) => {
      const all = JSON.parse((ev as MessageEvent).data) as AgentState[]
      agent = all.find(a => a.host === host) ?? agent
    })
    return () => es.close()
  })
</script>

<div class="mb-4">
  <a href="/" class="text-sm text-gray-400 hover:text-white">← Fleet</a>
</div>

{#if !agent}
  <p class="text-gray-500">Loading agent {host}…</p>
{:else}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-white">{agent.host}</h1>
      <p class="mt-1 font-mono text-sm text-gray-500">{agent.tailscale_ip}</p>
    </div>
    <span class="rounded-full px-3 py-1 text-sm ring-1 {statusColor(agent.status)}">
      {statusLabel(agent.status)}
    </span>
  </div>

  {#if hasVersionDrift(agent, fleetVersion)}
    <div class="mb-4 rounded border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      Version drift: agent <code>{agent.app_version?.slice(0, 8)}</code> vs fleet <code>{fleetVersion?.slice(0, 8)}</code>
    </div>
  {/if}

  {#if actionMessage}
    <div class="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{actionMessage}</div>
  {/if}
  {#if actionError}
    <div class="mb-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{actionError}</div>
  {/if}

  <div class="mb-6 flex gap-2 border-b border-surface-border">
    <button
      type="button"
      class="px-4 py-2 text-sm {tab === 'overview' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}"
      onclick={() => tab = 'overview'}
    >Overview</button>
    <button
      type="button"
      class="px-4 py-2 text-sm {tab === 'terminal' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}"
      onclick={() => void showTerminal()}
    >SSH Terminal</button>
  </div>

  {#if tab === 'overview'}
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="rounded-lg border border-surface-border bg-surface-raised p-4">
        <h2 class="mb-3 font-semibold text-white">Journey</h2>
        {#if agent.journey}
          <StepIndicator steps={agent.journey.steps} />
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-gray-500">Status</dt><dd class="text-white">{agent.journey.active ? 'Active' : 'Idle'}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Journey ID</dt><dd class="font-mono text-white">{truncateId(agent.journey.journey_id, 21)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Elapsed</dt><dd class="text-white">{formatElapsed(agent.journey.started_at)}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Last event</dt><dd class="text-white">{agent.journey.last_event}</dd></div>
          </dl>
        {:else}
          <p class="text-gray-500">No journey data</p>
        {/if}
      </section>

      <section class="rounded-lg border border-surface-border bg-surface-raised p-4">
        <h2 class="mb-3 font-semibold text-white">Services</h2>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-gray-500">cage-tty1</dt><dd class="text-white">{agent.services.cage}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-500">ustreamer</dt><dd class="text-white">{agent.services.ustreamer}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-500">vector</dt><dd class="text-white">{agent.services.vector}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-500">App version</dt><dd class="font-mono text-white">{agent.app_version?.slice(0, 12) ?? '—'}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-500">Print queue</dt><dd class="text-white">{agent.print_queue ?? '—'}</dd></div>
        </dl>
        {#if agent.vitals}
          <div class="mt-4 border-t border-surface-border pt-4">
            <VitalsBar vitals={agent.vitals} />
            {#if vitalsSamples.length > 0}
              <div class="mt-4 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div class="mb-1 text-gray-500">Temp 24h</div>
                  <Sparkline values={vitalsSamples.map(s => s.cpu_temp_c)} color="#f97316" />
                </div>
                <div>
                  <div class="mb-1 text-gray-500">Mem 24h</div>
                  <Sparkline values={vitalsSamples.map(s => s.mem_used_pct)} color="#3b82f6" />
                </div>
                <div>
                  <div class="mb-1 text-gray-500">Disk 24h</div>
                  <Sparkline values={vitalsSamples.map(s => s.disk_used_pct)} color="#a855f7" />
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <section class="rounded-lg border border-surface-border bg-surface-raised p-4">
        <UptimeBar availability_pct={uptimePct} segments={uptimeSegments} />
      </section>

      {#if supplies}
        <section class="rounded-lg border border-surface-border bg-surface-raised p-4">
          <SuppliesCard {supplies} onReload={() => { confirmReload = true }} />
        </section>
      {/if}

      {#if agent.session_stats}
        <section class="rounded-lg border border-surface-border bg-surface-raised p-4">
          <h2 class="mb-3 font-semibold text-white">Recent session stats</h2>
          <p class="text-xs text-gray-500 mb-3">From last 200 log lines only</p>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-gray-500">Journeys in window</dt><dd class="text-white">{agent.session_stats.journeys_in_window}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Last journey OK</dt><dd class="text-white">{agent.session_stats.last_journey_ok === null ? '—' : agent.session_stats.last_journey_ok ? 'Yes' : 'No'}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Last print OK</dt><dd class="text-white">{agent.session_stats.last_print_ok === null ? '—' : agent.session_stats.last_print_ok ? 'Yes' : 'No'}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Avg journey duration</dt><dd class="text-white">{agent.session_stats.avg_journey_duration_s !== null ? `${agent.session_stats.avg_journey_duration_s.toFixed(1)}s` : '—'}</dd></div>
          </dl>
        </section>
      {/if}

      <section class="rounded-lg border border-surface-border bg-surface-raised p-4">
        <h2 class="mb-3 font-semibold text-white">Actions</h2>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500" onclick={() => logsOpen = true}>View logs</button>
          <button type="button" class="rounded bg-surface px-3 py-2 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white" onclick={() => cameraOpen = true}>Camera peek</button>
          <button type="button" class="rounded bg-surface px-3 py-2 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white" onclick={() => runAction('restart-app')}>Restart app</button>
          <button type="button" class="rounded bg-surface px-3 py-2 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white" onclick={() => runAction('restart-ustreamer')}>Restart ustreamer</button>
          <button type="button" class="rounded bg-red-600/80 px-3 py-2 text-sm text-white hover:bg-red-500" onclick={() => confirmReboot = true}>Reboot</button>
        </div>
      </section>
    </div>

    <CameraPeek {host} bind:open={cameraOpen} />
  {:else if Terminal}
    <Terminal {host} />
  {:else}
    <p class="text-gray-500">Loading terminal…</p>
  {/if}

  <LogsPanel {host} bind:open={logsOpen} />

  <ConfirmDialog
    bind:open={confirmReboot}
    title="Reboot device"
    message="This will reboot {host}. The photobooth will be unavailable until it comes back."
    confirmText="Reboot"
    requireTyped={host}
    onConfirm={() => runAction('reboot')}
  />

  <ConfirmDialog
    bind:open={confirmReload}
    title="Mark media reloaded"
    message="Reset the print counter for {host}. Only do this after installing a new media roll."
    confirmText="Mark reloaded"
    onConfirm={() => markMediaReloaded()}
  />
{/if}
