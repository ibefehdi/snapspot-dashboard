<script lang="ts">
  import type { FleetHistory } from '$lib/types'

  let { history }: { history: FleetHistory } = $props()

  const maxJourneys = $derived(Math.max(...history.journeys_per_day.map(d => d.journeys), 1))
</script>

<div class="space-y-8">
  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Journeys per day (30d)</h3>
    {#if history.journeys_per_day.length === 0}
      <p class="text-sm text-gray-500">No data</p>
    {:else}
      <div class="flex h-32 items-end gap-1">
        {#each history.journeys_per_day as day}
          <div class="group relative flex flex-1 flex-col items-center justify-end">
            <div
              class="w-full rounded-t bg-blue-500/70 hover:bg-blue-400"
              style="height: {(day.journeys / maxJourneys) * 100}%"
              title="{day.date}: {day.journeys} journeys, {day.success_rate.toFixed(0)}% success"
            ></div>
            <span class="mt-1 hidden text-[9px] text-gray-500 group-hover:block">{day.date.slice(5)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Step success rates (30d)</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-surface-border text-left text-gray-400">
            <th class="py-2 pr-4">Step</th>
            <th class="py-2 pr-4">Total</th>
            <th class="py-2 pr-4">Success</th>
            <th class="py-2 pr-4">Rate</th>
            <th class="py-2">Avg duration</th>
          </tr>
        </thead>
        <tbody>
          {#each history.step_stats as row}
            <tr class="border-b border-surface-border/50">
              <td class="py-2 pr-4 text-white">{row.step}</td>
              <td class="py-2 pr-4 text-gray-300">{row.total}</td>
              <td class="py-2 pr-4 text-gray-300">{row.success}</td>
              <td class="py-2 pr-4 text-gray-300">{row.total > 0 ? ((row.success / row.total) * 100).toFixed(1) : 0}%</td>
              <td class="py-2 text-gray-300">{row.avg_duration_s !== null ? `${row.avg_duration_s.toFixed(1)}s` : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Top errors (7d)</h3>
    <ul class="space-y-2 text-sm">
      {#each history.top_errors as err}
        <li class="flex justify-between rounded border border-surface-border bg-surface px-3 py-2">
          <span class="text-gray-300">{err.detail}</span>
          <span class="font-mono text-red-400">{err.count}</span>
        </li>
      {/each}
    </ul>
  </section>
</div>
