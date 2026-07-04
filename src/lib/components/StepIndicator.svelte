<script lang="ts">
  import type { Step, StepState } from '$lib/types'
  import { STEP_LABELS, stepColor } from '$lib/utils'

  let { steps, compact = false }: { steps: Record<Step, StepState>; compact?: boolean } = $props()

  const order: Step[] = ['HEALTHCHECK', 'PAYMENT', 'PHOTO', 'MONTAGE', 'PRINT']
</script>

<div class="flex gap-1" class:gap-0.5={compact}>
  {#each order as step}
    <div
      class="rounded {stepColor(steps[step])} flex items-center justify-center text-[10px] font-medium text-white"
      class:h-2={compact}
      class:flex-1={compact}
      class:w-2={compact}
      class:h-6={!compact}
      class:min-w-[2.5rem]={!compact}
      class:px-1={!compact}
      title="{step}: {steps[step]}"
    >
      {#if !compact}
        {STEP_LABELS[step]}
      {/if}
    </div>
  {/each}
</div>
