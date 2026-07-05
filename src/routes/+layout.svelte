<script lang="ts">
import '../app.css'

let { children } = $props()
</script>

<svelte:head>
  <title>SnapSpot Fleet Dashboard</title>
</svelte:head>

<div class="min-h-screen">
  <header class="border-b border-surface-border bg-surface-raised px-6 py-4">
    <div class="mx-auto flex max-w-7xl items-center justify-between">
      <a href="/" class="text-xl font-semibold tracking-tight text-white">SnapSpot Fleet</a>
      <nav class="flex gap-4 text-sm text-gray-400">
        <a href="/" class="hover:text-white">Fleet</a>
        <a href="/history" class="hover:text-white">History</a>
        <a href="/revenue" class="hover:text-white">Revenue</a>
        <a href="/gallery" class="hover:text-white">Gallery</a>
        <a href="/gallery/sync" class="hover:text-white">Sync</a>
        <a href="/journeys" class="hover:text-white">Journeys</a>
        <a href="/search" class="hover:text-white">Search</a>
      </nav>
    </div>
  </header>
  <main class="mx-auto max-w-7xl px-6 py-6">
    {@render children()}
  </main>
</div>
