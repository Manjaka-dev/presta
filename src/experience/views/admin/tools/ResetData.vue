<script setup>
import { computed, reactive, ref } from 'vue'
import { allResources } from '@/config/resources.js'
import { resourceApi } from '@/api/resources'
import { processQueue, retry } from '@/utils/asyncQueue.js'
import { extractItems } from '@/utils/resourceData.js'

const selectedResources = ref([])
const resources = computed(() => allResources.filter((item) => selectedResources.value.includes(item.key)))

const state = reactive({
  loading: false,
  ids: [],
  errors: [],
  running: false,
  success: 0,
  failed: 0,
  concurrency: 5,
  retries: 3,
  backoffMs: 1000,
})

const canDelete = computed(() => {
  return resources.value.length > 0 && resources.value.every(r => r.methods.includes('delete'))
})

const fetchIds = async () => {
  if (!selectedResources.value.length) {
    return
  }

  state.loading = true
  state.errors = []
  state.ids = []  // Réinitialiser
  state.success = 0
  state.failed = 0

  for (const resourceKey of selectedResources.value) {
    const api = resourceApi(resourceKey)
    try {
      const data = await api.list({ display: '[id]' })
      const items = extractItems(data, api.resource)
      const ids = items
          .map((item) => item.id || item[api.resource.key])
          .filter((value) => value !== undefined && value !== null)

      // Stocker les IDs avec la ressource associée
      state.ids.push(
          ...ids.map(id => ({ resourceKey, id }))
      )
    } catch (error) {
      state.errors.push(`${resourceKey}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  state.loading = false
}

const startReset = async () => {
  if (!selectedResources.value.length || !state.ids.length || state.running) {
    return
  }

  state.running = true
  state.errors = []
  state.success = 0
  state.failed = 0

  const worker = async (item) => {
    const api = resourceApi(item.resourceKey)
    try {
      await retry(() => api.remove(item.id), state.retries, state.backoffMs)
      state.success += 1
    } catch (error) {
      state.failed += 1
      state.errors.push(`${item.resourceKey} (${item.id}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    await processQueue(state.ids, worker, state.concurrency)
  } finally {
    state.running = false
  }
}
</script>

<template>
  <section class="tool-page">
    <header class="tool-page__header">
      <div>
        <h1>Reset data</h1>
        <p class="muted">Delete all records for a resource using concurrent API calls.</p>
      </div>
      <RouterLink to="/admin" class="button button--ghost">Back to admin</RouterLink>
    </header>

    <div class="tool-grid">
      <section class="card">
        <h2>Resource</h2>
        <div class="resource-checkboxes">
          <label v-for="item in allResources" :key="item.key" class="checkbox-label">
            <input type="checkbox" :value="item.key" v-model="selectedResources" />{{ item.label }}
          </label>
        </div>

        <div class="button-row">
          <button class="button button--ghost" type="button" @click="fetchIds" :disabled="state.loading">
            Fetch ids
          </button>
          <button class="button button--danger" type="button" @click="startReset" :disabled="state.running || !canDelete">
            Start delete
          </button>
        </div>

        <p v-if="!canDelete" class="warning">Delete is not allowed for this resource.</p>
      </section>

      <section class="card">
        <h2>Progress</h2>
        <div class="summary-grid">
          <div class="summary-card">Resources: {{ selectedResources.length }}</div>
          <div class="summary-card">Ids: {{ state.ids.length }}</div>
          <div class="summary-card">Success: {{ state.success }}</div>
          <div class="summary-card">Failed: {{ state.failed }}</div>
        </div>

        <div class="form-grid">
          <label>
            Concurrency
            <input v-model.number="state.concurrency" type="number" min="1" max="10" />
          </label>
          <label>
            Retries
            <input v-model.number="state.retries" type="number" min="0" max="10" />
          </label>
          <label>
            Backoff (ms)
            <input v-model.number="state.backoffMs" type="number" min="100" step="100" />
          </label>
        </div>

        <details v-if="state.errors.length" class="raw-block">
          <summary>Errors</summary>
          <ul class="tool-list">
            <li v-for="(error, index) in state.errors" :key="index">{{ error }}</li>
          </ul>
        </details>
      </section>
    </div>
  </section>
</template>

<style>
.resource-checkboxes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.checkbox-label input {
  cursor: pointer;
}
</style>