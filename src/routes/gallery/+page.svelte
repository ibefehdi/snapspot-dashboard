<script lang="ts">
  import { onMount } from 'svelte'
  import type { GalleryItem } from '$lib/types'

  let items = $state<GalleryItem[]>([])
  let hosts = $state<string[]>([])
  let selectedHost = $state('')
  let loading = $state(true)
  let available = $state(false)
  let lightbox = $state<GalleryItem | null>(null)

  async function load() {
    loading = true
    const params = new URLSearchParams({ limit: '60' })
    if (selectedHost) params.set('host', selectedHost)
    const res = await fetch(`/api/gallery?${params}`)
    const data = await res.json()
    available = data.available
    items = data.items ?? []
    hosts = data.hosts ?? []
    loading = false
  }

  onMount(() => {
    void load()
  })

  function imageUrl(item: GalleryItem): string {
    return `/api/agents/${encodeURIComponent(item.host)}/montage?path=${encodeURIComponent(item.filepath)}&journey_id=${encodeURIComponent(item.journey_id)}`
  }
</script>

<h1 class="mb-2 text-2xl font-bold text-white">Photo Gallery</h1>
<p class="mb-6 text-sm text-gray-400">Recent montage prints fetched from agents over SSH</p>

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
{:else if !available}
  <p class="text-gray-500">Gallery is not available</p>
{:else if items.length === 0}
  <p class="text-gray-500">No montages recorded yet</p>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {#each items as item (item.host + item.journey_id)}
      <button
        type="button"
        class="group overflow-hidden rounded border border-surface-border bg-surface-raised text-left hover:border-gray-600"
        onclick={() => lightbox = item}
      >
        <img
          src={imageUrl(item)}
          alt="Montage from {item.host}"
          loading="lazy"
          class="aspect-[2/3] w-full object-cover"
          onerror={(e) => { (e.currentTarget as HTMLImageElement).classList.add('opacity-30') }}
        />
        <div class="p-2 text-xs text-gray-400">
          <div class="font-medium text-white">{item.host}</div>
          <div>{new Date(item.datetime).toLocaleString()}</div>
        </div>
      </button>
    {/each}
  </div>
{/if}

{#if lightbox}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    onclick={() => lightbox = null}
    onkeydown={(e) => { if (e.key === 'Escape') lightbox = null }}
    role="dialog"
    aria-modal="true"
    aria-label="Montage preview"
    tabindex="-1"
  >
    <figure class="max-h-[90vh] max-w-3xl" onclick={(e) => e.stopPropagation()}>
      <img
        src={imageUrl(lightbox)}
        alt="Montage from {lightbox.host}"
        class="max-h-[80vh] w-full rounded object-contain"
      />
      <figcaption class="mt-3 text-center text-sm text-gray-300">
        {lightbox.host} · {new Date(lightbox.datetime).toLocaleString()}
        {#if lightbox.printer_model}
          · {lightbox.printer_model}
        {/if}
      </figcaption>
      <button
        type="button"
        class="mt-3 w-full rounded bg-surface px-4 py-2 text-sm text-gray-300 hover:text-white"
        onclick={() => lightbox = null}
      >
        Close
      </button>
    </figure>
  </div>
{/if}
