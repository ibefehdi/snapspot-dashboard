<script lang="ts">
  import type { LogEntry } from '$lib/types'

  let { entries, showHost = false }: { entries: LogEntry[]; showHost?: boolean } = $props()

  function levelColor(level: string) {
    if (level === 'ERROR') return 'text-red-400'
    if (level === 'WARN') return 'text-amber-400'
    if (level === 'DEBUG') return 'text-gray-500'
    return 'text-blue-300'
  }
</script>

{#if entries.length === 0}
  <p class="text-gray-500">No log entries</p>
{:else}
  {#each entries as entry}
    <div class="mb-3 rounded border border-surface-border bg-surface p-3 font-mono text-xs">
      <div class="flex flex-wrap gap-2">
        {#if showHost && entry.host}
          <span class="text-purple-400">{entry.host}</span>
        {/if}
        <span class="text-gray-500">{new Date(entry.datetime).toLocaleString()}</span>
        <span class={levelColor(entry.level)}>{entry.level}</span>
      </div>
      <div class="mt-1 font-medium text-white">{entry.detail}</div>
      {#if Object.keys(entry.custom).length > 0}
        <details class="mt-2">
          <summary class="cursor-pointer text-gray-500">custom</summary>
          <pre class="mt-1 text-gray-400">{JSON.stringify(entry.custom, null, 2)}</pre>
        </details>
      {/if}
    </div>
  {/each}
{/if}
