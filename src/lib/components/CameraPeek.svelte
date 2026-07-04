<script lang="ts">
  let { host, open = $bindable(false) }: { host: string; open?: boolean } = $props()

  let streamUrl = $derived(open ? `/api/agents/${host}/camera` : '')
</script>

{#if open}
  <div class="rounded-lg border border-surface-border bg-surface-raised p-4">
    <div class="mb-3 flex items-center justify-between">
      <h4 class="text-sm font-medium text-white">Camera peek</h4>
      <button type="button" class="text-xs text-gray-400 hover:text-white" onclick={() => open = false}>Stop</button>
    </div>
    {#if streamUrl}
      <img src={streamUrl} alt="Camera stream for {host}" class="max-h-64 w-full rounded bg-black object-contain" />
    {/if}
  </div>
{/if}
