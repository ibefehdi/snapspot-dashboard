<script lang="ts">
  import type { AlertRecord } from '$lib/types'

  let { alerts }: { alerts: AlertRecord[] } = $props()
  let open = $state(false)
</script>

<div class="relative">
  <button
    type="button"
    class="relative rounded p-2 text-gray-400 hover:text-white"
    onclick={() => open = !open}
    aria-label="Alerts"
  >
    🔔
    {#if alerts.length > 0}
      <span class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
        {Math.min(alerts.length, 9)}
      </span>
    {/if}
  </button>

  {#if open}
    <div class="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-surface-border bg-surface-raised shadow-xl">
      <div class="border-b border-surface-border px-3 py-2 text-sm font-medium text-white">Recent alerts</div>
      <ul class="max-h-64 overflow-y-auto p-2">
        {#if alerts.length === 0}
          <li class="px-2 py-3 text-xs text-gray-500">No alerts yet</li>
        {:else}
          {#each alerts.slice(0, 20) as alert}
            <li class="mb-2 rounded border border-surface-border px-2 py-2 text-xs">
              <div class="flex justify-between gap-2">
                <span class="font-medium text-white">{alert.host}</span>
                <span class="text-gray-500">{new Date(alert.at).toLocaleTimeString()}</span>
              </div>
              <p class="mt-1 text-gray-400">{alert.message}</p>
              <span class="mt-1 inline-block text-[10px] uppercase text-gray-500">{alert.rule}</span>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}
</div>
