<script lang="ts">
  import type { SuppliesStatus } from '$lib/types'

  let {
    supplies,
    onReload,
  }: {
    supplies: SuppliesStatus
    onReload?: () => void | Promise<void>
  } = $props()

  let reloading = $state(false)

  async function handleReload() {
    reloading = true
    try {
      await onReload?.()
    }
    finally {
      reloading = false
    }
  }

  const barColor = $derived(
    supplies.low_media ? 'bg-red-500' : supplies.remaining_pct < 30 ? 'bg-amber-500' : 'bg-emerald-500',
  )
</script>

<div>
  <div class="mb-3 flex items-center justify-between gap-2">
    <h2 class="font-semibold text-white">Printer media</h2>
    {#if supplies.low_media}
      <span class="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">Low media</span>
    {/if}
  </div>

  <div class="mb-3 h-3 overflow-hidden rounded-full bg-surface">
    <div class="{barColor} h-full transition-all" style="width: {supplies.remaining_pct}%"></div>
  </div>

  <dl class="space-y-2 text-sm">
    <div class="flex justify-between">
      <dt class="text-gray-500">Remaining</dt>
      <dd class="text-white">{supplies.remaining} / {supplies.roll_capacity} ({supplies.remaining_pct}%)</dd>
    </div>
    <div class="flex justify-between">
      <dt class="text-gray-500">Prints since reload</dt>
      <dd class="text-white">{supplies.prints_used}</dd>
    </div>
    <div class="flex justify-between">
      <dt class="text-gray-500">Printer</dt>
      <dd class="text-white">{supplies.printer_model ?? '—'}{supplies.print_size ? ` · ${supplies.print_size}` : ''}</dd>
    </div>
    <div class="flex justify-between">
      <dt class="text-gray-500">Last reload</dt>
      <dd class="text-white">{new Date(supplies.reloaded_at).toLocaleString()}</dd>
    </div>
  </dl>

  {#if onReload}
    <button
      type="button"
      class="mt-4 rounded bg-surface px-3 py-2 text-sm text-gray-300 ring-1 ring-surface-border hover:text-white disabled:opacity-50"
      disabled={reloading}
      onclick={() => void handleReload()}
    >
      {reloading ? 'Saving…' : 'Mark media reloaded'}
    </button>
  {/if}
</div>
