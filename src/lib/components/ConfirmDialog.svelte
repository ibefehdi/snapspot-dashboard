<script lang="ts">
  let {
    open = $bindable(false),
    title,
    message,
    confirmText = 'Confirm',
    requireTyped,
    onConfirm,
  }: {
    open?: boolean
    title: string
    message: string
    confirmText?: string
    requireTyped?: string
    onConfirm: () => void | Promise<void>
  } = $props()

  let typed = $state('')
  let loading = $state(false)

  const canConfirm = $derived(!requireTyped || typed === requireTyped)

  async function handleConfirm() {
    if (!canConfirm) return
    loading = true
    try {
      await onConfirm()
      open = false
      typed = ''
    }
    finally {
      loading = false
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-lg border border-surface-border bg-surface-raised p-6 shadow-xl">
      <h3 class="text-lg font-semibold text-white">{title}</h3>
      <p class="mt-2 text-sm text-gray-400">{message}</p>

      {#if requireTyped}
        <p class="mt-3 text-xs text-gray-500">Type <code class="text-amber-300">{requireTyped}</code> to confirm</p>
        <input
          type="text"
          bind:value={typed}
          class="mt-2 w-full rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white"
        />
      {/if}

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded px-4 py-2 text-sm text-gray-400 hover:text-white"
          onclick={() => { open = false; typed = '' }}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          disabled={!canConfirm || loading}
          onclick={handleConfirm}
        >
          {loading ? 'Working…' : confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
