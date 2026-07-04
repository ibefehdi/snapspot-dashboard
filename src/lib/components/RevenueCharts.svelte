<script lang="ts">
  import type { RevenueReport } from '$lib/types'

  let { report }: { report: RevenueReport } = $props()

  const maxRevenue = $derived(Math.max(...report.revenue_per_day.map(d => d.revenue), 1))
  const maxHeatmap = $derived(Math.max(...report.heatmap.map(c => c.count), 1))
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  function heatmapCount(weekday: number, hour: number): number {
    return report.heatmap.find(c => c.weekday === weekday && c.hour === hour)?.count ?? 0
  }

  function formatMoney(amount: number): string {
    const prefix = report.currency ? `${report.currency} ` : ''
    return `${prefix}${amount.toFixed(2)}`
  }

  const totalRevenue = $derived(report.revenue_per_day.reduce((sum, d) => sum + d.revenue, 0))
  const totalPaid = $derived(report.revenue_per_day.reduce((sum, d) => sum + d.paid_sessions, 0))
</script>

<div class="mb-6 grid gap-4 sm:grid-cols-3">
  <div class="rounded border border-surface-border bg-surface-raised p-4">
    <div class="text-sm text-gray-400">Total revenue</div>
    <div class="mt-1 text-2xl font-semibold text-white">{formatMoney(totalRevenue)}</div>
  </div>
  <div class="rounded border border-surface-border bg-surface-raised p-4">
    <div class="text-sm text-gray-400">Paid sessions</div>
    <div class="mt-1 text-2xl font-semibold text-white">{totalPaid}</div>
  </div>
  <div class="rounded border border-surface-border bg-surface-raised p-4">
    <div class="text-sm text-gray-400">Conversion</div>
    <div class="mt-1 text-2xl font-semibold text-white">
      {report.funnel.started > 0
        ? `${((report.funnel.completed / report.funnel.started) * 100).toFixed(0)}%`
        : '—'}
    </div>
    <div class="mt-1 text-xs text-gray-500">
      {report.funnel.completed} / {report.funnel.started} journeys completed
    </div>
  </div>
</div>

<div class="space-y-8">
  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Revenue per day</h3>
    {#if report.revenue_per_day.length === 0}
      <p class="text-sm text-gray-500">No payment data yet</p>
    {:else}
      <div class="flex h-32 items-end gap-1">
        {#each report.revenue_per_day as day}
          <div class="group relative flex flex-1 flex-col items-center justify-end">
            <div
              class="w-full rounded-t bg-emerald-500/70 hover:bg-emerald-400"
              style="height: {(day.revenue / maxRevenue) * 100}%"
              title="{day.date}: {formatMoney(day.revenue)}, {day.paid_sessions} paid, {day.free_sessions} free"
            ></div>
            <span class="mt-1 hidden text-[9px] text-gray-500 group-hover:block">{day.date.slice(5)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Conversion funnel</h3>
    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded border border-surface-border bg-surface px-4 py-3">
        <div class="text-xs text-gray-500">Started</div>
        <div class="text-xl font-semibold text-white">{report.funnel.started}</div>
      </div>
      <div class="rounded border border-surface-border bg-surface px-4 py-3">
        <div class="text-xs text-gray-500">Paid</div>
        <div class="text-xl font-semibold text-white">{report.funnel.paid}</div>
      </div>
      <div class="rounded border border-surface-border bg-surface px-4 py-3">
        <div class="text-xs text-gray-500">Completed</div>
        <div class="text-xl font-semibold text-white">{report.funnel.completed}</div>
      </div>
    </div>
  </section>

  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Peak hours</h3>
    {#if report.heatmap.length === 0}
      <p class="text-sm text-gray-500">No journey data yet</p>
    {:else}
      <div class="overflow-x-auto">
        <div class="inline-grid gap-px" style="grid-template-columns: 2.5rem repeat(24, 1.25rem);">
          <div></div>
          {#each Array(24) as _, hour}
            <div class="text-center text-[9px] text-gray-600">{hour}</div>
          {/each}
          {#each weekdays as label, weekday}
            <div class="pr-2 text-right text-[10px] text-gray-500">{label}</div>
            {#each Array(24) as _, hour}
              {@const count = heatmapCount(weekday, hour)}
              <div
                class="aspect-square rounded-sm bg-blue-500"
                style="opacity: {count === 0 ? 0.05 : 0.15 + (count / maxHeatmap) * 0.85}"
                title="{label} {hour}:00 — {count} journeys"
              ></div>
            {/each}
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Payment methods</h3>
    {#if report.payment_methods.length === 0}
      <p class="text-sm text-gray-500">No data</p>
    {:else}
      <ul class="space-y-2 text-sm">
        {#each report.payment_methods as row}
          <li class="flex justify-between rounded border border-surface-border bg-surface px-3 py-2">
            <span class="text-gray-300">{row.method}</span>
            <span class="font-mono text-white">{row.count}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3 class="mb-4 text-lg font-semibold text-white">Revenue by agent</h3>
    {#if report.by_host.length === 0}
      <p class="text-sm text-gray-500">No data</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-border text-left text-gray-400">
              <th class="py-2 pr-4">Host</th>
              <th class="py-2 pr-4">Paid sessions</th>
              <th class="py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {#each report.by_host as row}
              <tr class="border-b border-surface-border/50">
                <td class="py-2 pr-4 text-white">{row.host}</td>
                <td class="py-2 pr-4 text-gray-300">{row.paid_sessions}</td>
                <td class="py-2 text-gray-300">{formatMoney(row.revenue)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
