<script lang="ts">
  import type { AgentVitals } from '$lib/types'
  import { formatUptime } from '$lib/utils'

  let { vitals }: { vitals: AgentVitals } = $props()
</script>

<div class="flex flex-wrap gap-3 text-xs text-gray-400">
  <span title="CPU temperature">{vitals.cpu_temp_c.toFixed(0)}°C</span>
  <span title="Memory">{vitals.mem_used_pct.toFixed(0)}% mem</span>
  <span title="Disk">{vitals.disk_used_pct.toFixed(0)}% disk</span>
  <span title="Load">{vitals.load1.toFixed(1)} load</span>
  <span title="Uptime">{formatUptime(vitals.uptime_s)}</span>
</div>
