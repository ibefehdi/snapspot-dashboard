<script lang="ts">
  import type { UptimeSegment } from '$lib/types'

  let {
    availability_pct,
    segments,
  }: {
    availability_pct: number
    segments: UptimeSegment[]
  } = $props()

  function segmentColor(status: string) {
    switch (status) {
      case 'RUNNING': return 'bg-emerald-500'
      case 'APP_DOWN': return 'bg-amber-500'
      case 'OFFLINE': return 'bg-gray-600'
      case 'UNREACHABLE': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const totalMs = $derived(segments.reduce((sum, s) => sum + s.duration_ms, 0) || 1)
</script>

<div>
  <div class="mb-2 flex items-baseline justify-between text-sm">
    <span class="text-gray-400">Uptime (7d)</span>
    <span class="font-medium text-white">{availability_pct}%</span>
  </div>
  {#if segments.length === 0}
    <p class="text-xs text-gray-500">No status history yet</p>
  {:else}
    <div class="flex h-3 overflow-hidden rounded-full bg-surface">
      {#each segments as seg}
        <div
          class="{segmentColor(seg.status)} h-full"
          style="width: {(seg.duration_ms / totalMs) * 100}%"
          title="{seg.status}: {new Date(seg.start_at).toLocaleString()} – {new Date(seg.end_at).toLocaleString()}"
        ></div>
      {/each}
    </div>
    <div class="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
      <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span> Running</span>
      <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span> App down</span>
      <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-red-500"></span> Unreachable</span>
      <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-gray-600"></span> Offline</span>
    </div>
  {/if}
</div>
