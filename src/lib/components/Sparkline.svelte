<script lang="ts">
  let {
    values,
    color = '#3b82f6',
    height = 32,
    width = 120,
  }: {
    values: number[]
    color?: string
    height?: number
    width?: number
  } = $props()

  const points = $derived.by(() => {
    if (values.length === 0) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const step = values.length > 1 ? width / (values.length - 1) : 0

    return values.map((v, i) => {
      const x = i * step
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${x},${y}`
    }).join(' ')
  })
</script>

{#if values.length > 0}
  <svg {width} {height} class="inline-block" aria-hidden="true">
    <polyline
      fill="none"
      stroke={color}
      stroke-width="1.5"
      points={points}
    />
  </svg>
{:else}
  <span class="text-xs text-gray-500">—</span>
{/if}
