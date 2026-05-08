<script setup>
import { categories } from '../config/resources'

const tools = [
  { key: 'import-csv', label: 'CSV import', route: '/admin/tools/import-csv' },
  { key: 'reset-data', label: 'Reset data', route: '/admin/tools/reset-data' },
]
</script>

<template>
  <nav class="admin-nav">
    <div class="admin-nav__brand">
      <RouterLink to="/admin" class="admin-nav__brand-link">Presta Admin</RouterLink>
    </div>

    <div class="admin-nav__sections">
      <div class="admin-nav__section">
        <div class="admin-nav__title">Tools</div>
        <div class="admin-nav__links">
          <RouterLink
            v-for="tool in tools"
            :key="tool.key"
            :to="tool.route"
            class="admin-nav__link"
          >
            {{ tool.label }}
          </RouterLink>
        </div>
      </div>

      <div v-for="category in categories" :key="category.key" class="admin-nav__section">
        <div class="admin-nav__title">{{ category.label }}</div>
        <div class="admin-nav__links">
          <RouterLink
            v-for="resource in category.resources"
            :key="resource.key"
            :to="resource.route"
            class="admin-nav__link"
          >
            {{ resource.label }}
          </RouterLink>
        </div>
      </div>
    </div>
  </nav>
</template>

