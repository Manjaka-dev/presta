<script setup>
import { categories } from '@/config/resources.js'

const tools = [
  { key: 'import-csv', label: 'CSV import', route: '/admin/tools/import-csv' },
  { key: 'reset-data', label: 'Reset data', route: '/admin/tools/reset-data' },
]
</script>

<template>
  <section class="admin-home">
    <header class="admin-home__header">
      <div>
        <h1>Admin resources</h1>
        <p class="muted">Select a category to manage its resources.</p>
      </div>
      <RouterLink to="/" class="button button--ghost">Back to home</RouterLink>
    </header>

    <div class="admin-home__grid">
      <div class="card">
        <h2>Tools</h2>
        <div class="admin-home__links">
          <RouterLink v-for="tool in tools" :key="tool.key" :to="tool.route" class="pill">
            {{ tool.label }}
          </RouterLink>
        </div>
      </div>

      <div v-for="category in categories" :key="category.key" class="card">
        <h2>{{ category.label }}</h2>
        <div class="admin-home__links">
          <RouterLink
            v-for="resource in category.resources"
            :key="resource.key"
            :to="resource.route"
            class="pill"
          >
            {{ resource.label }}
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
