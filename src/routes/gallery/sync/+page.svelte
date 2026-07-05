<script lang="ts">
  import { onMount } from 'svelte'
  import type { GallerySyncStatus } from '$lib/server/gallery-sync'

  let status = $state<GallerySyncStatus | null>(null)
  let error = $state<string | null>(null)
  let loading = $state(true)
  let syncing = $state(false)
  let syncMessage = $state<string | null>(null)

  async function load() {
    loading = true
    error = null
    const res = await fetch('/api/gallery/sync')
    const data = await res.json()
    if (data.error && !data.enabled) {
      error = data.error
      status = data
    }
    else {
      status = data
    }
    loading = false
  }

  async function runSync() {
    syncing = true
    error = null
    syncMessage = null
    const res = await fetch('/api/gallery/sync', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      error = data.error ?? 'Sync failed'
    }
    else {
      status = data.status
      const r = data.result
      if (r) {
        syncMessage = `${r.uploaded} uploaded, ${r.skipped} skipped, ${r.failed} failed`
        if (r.errors?.length > 0) {
          error = r.errors.join('\n')
        }
      }
    }
    syncing = false
  }

  async function clearLock() {
    error = null
    syncMessage = null
    const res = await fetch('/api/gallery/sync', { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      error = data.error ?? 'Failed to clear lock'
      return
    }
    status = data.status
    syncMessage = data.cleared ? 'Sync lock cleared' : 'No lock was held'
  }

  onMount(() => {
    void load()
    const timer = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(timer)
  })

  function formatWhen(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
  }

  const totalPending = $derived(status?.hosts.reduce((sum, h) => sum + h.pending_count, 0) ?? 0)
</script>

<div class="mb-4">
  <a href="/gallery" class="text-sm text-gray-400 hover:text-white">← Gallery</a>
</div>

<h1 class="mb-2 text-2xl font-bold text-white">Gallery S3 Sync</h1>
<p class="mb-6 text-sm text-gray-400">
  Pending montage uploads and hourly sync schedule. Online agents are synced to S3 by the systemd timer.
</p>

{#if loading && !status}
  <p class="text-gray-500">Loading…</p>
{:else if !status?.enabled}
  <div class="rounded border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
    Gallery sync is not enabled. Set <code class="text-amber-100">GALLERY_SYNC_ENABLED=true</code> with Redis and S3 credentials in <code class="text-amber-100">.env</code>.
  </div>
{:else if status}
  <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div class="rounded border border-surface-border bg-surface-raised p-4">
      <p class="text-xs text-gray-500">Status</p>
      <p class="mt-1 text-lg font-medium text-white">
        {#if status.running}
          <span class="text-blue-400">Syncing…</span>
          {#if status.lock_ttl_sec !== null}
            <span class="ml-1 text-sm text-gray-500">(lock {status.lock_ttl_sec}s left)</span>
          {/if}
        {:else}
          Idle
        {/if}
      </p>
    </div>
    <div class="rounded border border-surface-border bg-surface-raised p-4">
      <p class="text-xs text-gray-500">Next run (est.)</p>
      <p class="mt-1 text-lg font-medium text-white">{formatWhen(status.next_run_at)}</p>
    </div>
    <div class="rounded border border-surface-border bg-surface-raised p-4">
      <p class="text-xs text-gray-500">Last run</p>
      <p class="mt-1 text-lg font-medium text-white">{formatWhen(status.last_run_at)}</p>
    </div>
    <div class="rounded border border-surface-border bg-surface-raised p-4">
      <p class="text-xs text-gray-500">Pending uploads</p>
      <p class="mt-1 text-lg font-medium text-white">{totalPending}</p>
    </div>
  </div>

  {#if status.running && !status.last_run_at}
    <div class="mb-6 rounded border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      A sync lock is held but no run has finished yet. This may be a long run (many montages over SSH),
      or a stale lock from a crashed process. If uploads are not progressing, use <strong>Clear lock</strong> then run sync from the server with <code class="text-amber-100">npm run sync:gallery</code> to see errors.
    </div>
  {/if}

  <div class="mb-6 flex flex-wrap gap-3">
    <button
      type="button"
      class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      disabled={syncing || status.running}
      onclick={() => runSync()}
    >
      {syncing ? 'Running sync…' : 'Run sync now'}
    </button>
    <button
      type="button"
      class="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
      disabled={syncing}
      onclick={() => clearLock()}
    >
      Clear lock
    </button>
    <button
      type="button"
      class="rounded border border-surface-border bg-surface px-4 py-2 text-sm text-gray-300 hover:text-white"
      onclick={() => load()}
    >
      Refresh
    </button>
  </div>

  {#if status.last_result}
    <div class="mb-6 rounded border border-surface-border bg-surface-raised p-4 text-sm">
      <h2 class="mb-2 font-medium text-white">Last sync result</h2>
      <p class="text-gray-400">
        {status.last_result.uploaded} uploaded · {status.last_result.skipped} skipped · {status.last_result.failed} failed
        · {status.last_result.hosts} online host{status.last_result.hosts === 1 ? '' : 's'}
        {#if status.last_result.finished_at}
          · {formatWhen(status.last_result.finished_at)}
        {/if}
      </p>
      {#if status.last_result.errors.length > 0}
        <ul class="mt-2 space-y-1 text-red-300">
          {#each status.last_result.errors as err, i (i)}
            <li>{err}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if syncMessage}
    <p class="mb-4 text-sm text-gray-300">{syncMessage}</p>
  {/if}

  {#if error}
    <pre class="mb-4 overflow-x-auto rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 whitespace-pre-wrap">{error}</pre>
  {/if}

  <h2 class="mb-3 text-lg font-medium text-white">Per agent</h2>
  {#if status.hosts.length === 0}
    <p class="text-gray-500">No agents found</p>
  {:else}
    <div class="space-y-3">
      {#each status.hosts as host (host.host)}
        <div class="rounded border border-surface-border bg-surface-raised p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="font-medium text-white">{host.host}</span>
              <span class="ml-2 text-xs {host.online ? 'text-emerald-400' : 'text-gray-500'}">
                {host.online ? 'online' : 'offline'}
              </span>
            </div>
            <div class="text-sm text-gray-400">
              {host.synced_count}/{host.total_montages} in S3
              {#if host.pending_count > 0}
                · <span class="text-amber-300">{host.pending_count} pending</span>
              {/if}
            </div>
          </div>
          <p class="mt-1 text-xs text-gray-500">Last synced: {formatWhen(host.last_sync_at)}</p>

          {#if host.pending.length > 0}
            <div class="mt-3">
              <p class="mb-2 text-xs font-medium text-gray-500">Upcoming uploads</p>
              <ul class="space-y-1 text-sm text-gray-300">
                {#each host.pending as item (item.journey_id)}
                  <li class="flex justify-between gap-4 font-mono text-xs">
                    <span>{item.journey_id}</span>
                    <span class="text-gray-500">{new Date(item.datetime).toLocaleString()}</span>
                  </li>
                {/each}
              </ul>
              {#if host.pending_count > host.pending.length}
                <p class="mt-1 text-xs text-gray-500">
                  +{host.pending_count - host.pending.length} more
                </p>
              {/if}
            </div>
          {:else if host.total_montages > 0}
            <p class="mt-2 text-xs text-emerald-400">All montages synced to S3</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/if}
