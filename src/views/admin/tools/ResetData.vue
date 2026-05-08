<script setup>
import { computed, reactive, ref } from 'vue'
import { allResources } from '@/config/resources.js'
import { resourceApi } from '../../../api/resources'
import { processQueue, retry } from '@/utils/asyncQueue.js'
import { extractItems } from '@/utils/resourceData.js'

const resourceKey = ref(allResources[0]?.key || '')
const resource = computed(() => allResources.find((item) => item.key === resourceKey.value))

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

const canDelete = computed(() => resource.value?.methods.includes('delete'))

const fetchIds = async () => {
  if (!resourceKey.value) {
    return
  }

  const api = resourceApi(resourceKey.value)
  state.loading = true
  state.errors = []
  state.ids = []
  state.success = 0
  state.failed = 0

  try {
    const data = await api.list({ display: '[id]' })
    const items = extractItems(data, api.resource)
    state.ids = items
      .map((item) => item.id || item[api.resource.key])
      .filter((value) => value !== undefined && value !== null)
  } catch (error) {
    state.errors = [error instanceof Error ? error.message : String(error)]
  } finally {
    state.loading = false
  }
}

const startReset = async () => {
  if (!resourceKey.value || !state.ids.length || state.running) {
    return
  }

  const api = resourceApi(resourceKey.value)
  state.running = true
  state.errors = []
  state.success = 0
  state.failed = 0

  const worker = async (id) => {
    try {
      await retry(() => api.remove(id), state.retries, state.backoffMs)
      state.success += 1
    } catch (error) {
      state.failed += 1
      state.errors.push(error instanceof Error ? error.message : String(error))
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
        <label>
          Resource
          <select v-model="resourceKey">
            <option v-for="item in allResources" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

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

