<script setup>
import { computed, reactive, watch, watchEffect } from 'vue'
import { resourceApi } from '@/api/resources'
import { getResource } from '@/config/resources'

const props = defineProps({
  resourceKey: {
    type: String,
    required: true,
  },
})

const resource = computed(() => getResource(props.resourceKey))
const api = computed(() => resourceApi(props.resourceKey))

const listState = reactive({
  loading: false,
  error: '',
  items: [],
  raw: '',
  showRaw: false,
})

const createState = reactive({
  loading: false,
  error: '',
  success: '',
  xml: '',
  manualXml: false,
})

const updateState = reactive({
  loading: false,
  error: '',
  success: '',
  id: '',
  xml: '',
  manualXml: false,
})

const deleteState = reactive({
  loading: false,
  error: '',
  success: '',
  id: '',
})

const listParams = reactive({
  display: 'full',
  limit: '',
  sort: '',
})

const listColumns = reactive({
  available: [],
  selected: [],
})

const createForm = reactive({
  sync: true,
  values: {},
})

const updateForm = reactive({
  sync: true,
  values: {},
})

const visibleColumns = computed(() => {
  if (listColumns.selected.length === 0) {
    return listColumns.available
  }
  return listColumns.available.filter((column) => listColumns.selected.includes(column))
})

const canCreate = computed(() => resource.value?.methods.includes('post'))
const canUpdate = computed(() => resource.value?.methods.includes('put'))
const canPatch = computed(() => resource.value?.methods.includes('patch'))
const canDelete = computed(() => resource.value?.methods.includes('delete'))

const resetMessages = () => {
  listState.error = ''
  createState.error = ''
  createState.success = ''
  updateState.error = ''
  updateState.success = ''
  deleteState.error = ''
  deleteState.success = ''
}

const normalizeColumnKeys = (items) => {
  const columns = new Set()

  items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return
    }
    Object.keys(item).forEach((key) => {
      columns.add(key)
    })
  })

  const sorted = Array.from(columns).sort((a, b) => a.localeCompare(b))
  if (sorted.includes('id')) {
    return ['id', ...sorted.filter((key) => key !== 'id')]
  }
  return sorted
}

const normalizeItems = (items) => {
  if (!Array.isArray(items)) {
    return []
  }

  return items.map((item) => {
    if (item && typeof item === 'object') {
      return item
    }
    return { id: item }
  })
}

const refreshColumns = () => {
  const nextAvailable = normalizeColumnKeys(listState.items)
  listColumns.available = nextAvailable

  if (listColumns.selected.length === 0) {
    listColumns.selected = nextAvailable
    return
  }

  listColumns.selected = listColumns.selected.filter((key) => nextAvailable.includes(key))
  if (listColumns.selected.length === 0) {
    listColumns.selected = nextAvailable
  }
}

const selectAllColumns = () => {
  listColumns.selected = [...listColumns.available]
}

const clearColumns = () => {
  listColumns.selected = []
}

const syncFormValues = () => {
  const keys = listColumns.available

  keys.forEach((key) => {
    if (!(key in createForm.values)) {
      createForm.values[key] = ''
    }
    if (!(key in updateForm.values)) {
      updateForm.values[key] = ''
    }
  })

  Object.keys(createForm.values).forEach((key) => {
    if (!keys.includes(key)) {
      delete createForm.values[key]
    }
  })

  Object.keys(updateForm.values).forEach((key) => {
    if (!keys.includes(key)) {
      delete updateForm.values[key]
    }
  })
}

const escapeXml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const buildXmlFromValues = (values, idValue = '') => {
  const tag = resource.value?.key || 'resource'
  const entries = []

  if (idValue && !Object.prototype.hasOwnProperty.call(values, 'id')) {
    entries.push({ key: 'id', value: idValue })
  }

  Object.entries(values).forEach(([key, value]) => {
    if (!key.trim()) {
      return
    }
    if (value === undefined || value === null || value === '') {
      return
    }
    entries.push({ key, value })
  })

  const body = entries
    .map((entry) => `    <${entry.key}>${escapeXml(entry.value)}</${entry.key}>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n  <${tag}>\n${body || '    '}\n  </${tag}>\n</prestashop>`
}

const syncCreateXml = () => {
  createState.xml = buildXmlFromValues(createForm.values)
  createState.manualXml = false
}

const syncUpdateXml = () => {
  updateState.xml = buildXmlFromValues(updateForm.values, updateState.id)
  updateState.manualXml = false
}

const onCreateXmlInput = () => {
  createState.manualXml = true
  createForm.sync = false
}

const onUpdateXmlInput = () => {
  updateState.manualXml = true
  updateForm.sync = false
}

const formatCell = (value) => {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

watch(
  () => listState.items,
  () => {
    refreshColumns()
    syncFormValues()
  },
  { deep: true }
)

watchEffect(() => {
  if (!createForm.sync) {
    return
  }
  createState.xml = buildXmlFromValues(createForm.values)
})

watchEffect(() => {
  if (!updateForm.sync) {
    return
  }
  updateState.xml = buildXmlFromValues(updateForm.values, updateState.id)
})

const logInfo = (message, payload) => {
  if (payload !== undefined) {
    console.info(`[ResourceCrud] ${message}`, payload)
    return
  }
  console.info(`[ResourceCrud] ${message}`)
}

const logError = (message, error) => {
  console.error(`[ResourceCrud] ${message}`, error)
}

const fetchList = async () => {
  resetMessages()
  listState.loading = true
  listState.error = ''
  listState.raw = ''

  try {
    const params = Object.fromEntries(
      Object.entries(listParams).filter(([, value]) => value !== '')
    )
    logInfo('Fetch list', { resourceKey: props.resourceKey, params })
    const data = await api.value.list(params)
    logInfo('List response', data)
    listState.items = normalizeItems(extractItems(data))
    logInfo('Items extracted', listState.items)
  } catch (error) {
    logError('List error', error)
    listState.error = error instanceof Error ? error.message : String(error)
  } finally {
    listState.loading = false
  }
}

const loadBlankSchema = async () => {
  resetMessages()
  createState.loading = true

  try {
    logInfo('Load blank schema', { resourceKey: props.resourceKey })
    const xml = await api.value.schemaBlank()
    createState.xml = xml
    logInfo('Blank schema loaded')
  } catch (error) {
    logError('Blank schema error', error)
    createState.error = error instanceof Error ? error.message : String(error)
  } finally {
    createState.loading = false
  }
}

const loadSynopsisSchema = async () => {
  resetMessages()
  createState.loading = true

  try {
    logInfo('Load synopsis schema', { resourceKey: props.resourceKey })
    const xml = await api.value.schemaSynopsis()
    createState.xml = xml
    logInfo('Synopsis schema loaded')
  } catch (error) {
    logError('Synopsis schema error', error)
    createState.error = error instanceof Error ? error.message : String(error)
  } finally {
    createState.loading = false
  }
}

const createResource = async () => {
  resetMessages()
  createState.loading = true

  try {
    logInfo('Create resource', { resourceKey: props.resourceKey })
    await api.value.create(createState.xml)
    createState.success = 'Created'
    await fetchList()
  } catch (error) {
    logError('Create error', error)
    createState.error = error instanceof Error ? error.message : String(error)
  } finally {
    createState.loading = false
  }
}

const parseXmlValues = (xmlText) => {
  if (!xmlText) {
    return {}
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  const resourceNode = doc.querySelector('prestashop > *') || doc.documentElement
  const values = {}

  if (!resourceNode) {
    return values
  }

  Array.from(resourceNode.children).forEach((child) => {
    if (!child) {
      return
    }
    values[child.tagName] = child.textContent || ''
  })

  return values
}

const loadUpdateXml = async () => {
  resetMessages()
  updateState.loading = true

  try {
    logInfo('Load current XML', { resourceKey: props.resourceKey, id: updateState.id })
    updateState.xml = await api.value.getRawXml(updateState.id)
    updateForm.values = {
      ...updateForm.values,
      ...parseXmlValues(updateState.xml),
    }
    updateForm.sync = false
    updateState.manualXml = true
    logInfo('Current XML loaded')
  } catch (error) {
    logError('Load current XML error', error)
    updateState.error = error instanceof Error ? error.message : String(error)
  } finally {
    updateState.loading = false
  }
}

const updateResource = async () => {
  resetMessages()
  updateState.loading = true

  try {
    logInfo('Update resource', { resourceKey: props.resourceKey, id: updateState.id })
    await api.value.update(updateState.id, updateState.xml)
    updateState.success = 'Updated'
    await fetchList()
  } catch (error) {
    logError('Update error', error)
    updateState.error = error instanceof Error ? error.message : String(error)
  } finally {
    updateState.loading = false
  }
}

const patchResource = async () => {
  resetMessages()
  updateState.loading = true

  try {
    logInfo('Patch resource', { resourceKey: props.resourceKey, id: updateState.id })
    await api.value.patch(updateState.id, updateState.xml)
    updateState.success = 'Patched'
    await fetchList()
  } catch (error) {
    logError('Patch error', error)
    updateState.error = error instanceof Error ? error.message : String(error)
  } finally {
    updateState.loading = false
  }
}

const deleteResource = async () => {
  resetMessages()
  deleteState.loading = true

  try {
    logInfo('Delete resource', { resourceKey: props.resourceKey, id: deleteState.id })
    await api.value.remove(deleteState.id)
    deleteState.success = 'Deleted'
    await fetchList()
  } catch (error) {
    logError('Delete error', error)
    deleteState.error = error instanceof Error ? error.message : String(error)
  } finally {
    deleteState.loading = false
  }
}

const confirmDelete = async () => {
  if (!deleteState.id) {
    deleteState.error = 'Missing id'
    return
  }

  const confirmed = window.confirm(`Delete ${resource.value.label} #${deleteState.id}?`)
  if (!confirmed) {
    return
  }

  await deleteResource()
}

const extractItems = (payload) => {
  if (!payload) {
    return []
  }

  if (payload.__raw) {
    listState.raw = payload.__raw
    return []
  }

  let data = payload
  if (data.prestashop) {
    data = data.prestashop
  }

  if (Array.isArray(data)) {
    return data
  }

  const preferredKeys = [resource.value?.endpoint, resource.value?.key]
  for (const key of preferredKeys) {
    if (key && Array.isArray(data[key])) {
      return data[key]
    }
  }

  const firstArray = Object.values(data).find((value) => Array.isArray(value))
  if (firstArray) {
    return firstArray
  }

  return []
}
</script>

<template>
  <section class="resource">
    <header class="resource__header">
      <div>
        <h1>{{ resource.label }}</h1>
        <p class="resource__endpoint">Endpoint: /api/{{ resource.endpoint }}</p>
      </div>
      <button class="button" @click="fetchList" :disabled="listState.loading">Refresh list</button>
    </header>

    <div class="resource__grid">
      <section class="card card--list">
        <h2>List</h2>
        <div class="form-grid">
          <label>
            Display
            <input v-model="listParams.display" type="text" placeholder="full" />
          </label>
          <label>
            Limit
            <input v-model="listParams.limit" type="text" placeholder="20,10" />
          </label>
          <label>
            Sort
            <input v-model="listParams.sort" type="text" placeholder="name_ASC" />
          </label>
        </div>

        <div class="column-filter">
          <div class="column-filter__header">
            <span class="pill">{{ listColumns.available.length }} columns</span>
            <div class="button-row">
              <button class="button button--ghost" type="button" @click="selectAllColumns">All</button>
              <button class="button button--ghost" type="button" @click="clearColumns">None</button>
              <label class="toggle">
                <input type="checkbox" v-model="listState.showRaw" />
                Raw
              </label>
            </div>
          </div>
          <div class="column-filter__list">
            <label v-for="column in listColumns.available" :key="column" class="column-filter__item">
              <input type="checkbox" :value="column" v-model="listColumns.selected" />
              {{ column }}
            </label>
          </div>
        </div>

        <p v-if="listState.error" class="error">{{ listState.error }}</p>
        <details v-if="listState.raw && listState.showRaw" class="raw-block">
          <summary>Raw response</summary>
          <pre class="code-block">{{ listState.raw }}</pre>
        </details>

        <div class="list-table" v-if="listState.items.length">
          <div class="list-table__container">
            <table class="list-table__table">
              <thead>
                <tr>
                  <th v-for="column in visibleColumns" :key="`head-${column}`">{{ column }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in listState.items" :key="item.id || index">
                  <td v-for="column in visibleColumns" :key="`${index}-${column}`">
                    {{ formatCell(item?.[column]) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else-if="!listState.loading" class="muted">No items loaded.</p>
      </section>

      <section class="card" v-if="canCreate">
        <h2>Create</h2>
        <div class="form-section">
          <div class="form-section__header">
            <h3>Form</h3>
            <label class="toggle">
              <input type="checkbox" v-model="createForm.sync" />
              Sync XML
            </label>
          </div>
          <div v-if="listColumns.available.length" class="form-rows">
            <div v-for="column in listColumns.available" :key="`create-${column}`" class="form-row">
              <input :value="column" type="text" disabled />
              <input v-model="createForm.values[column]" type="text" placeholder="value" />
            </div>
          </div>
          <p v-else class="muted">Load the list to populate form fields.</p>
          <div class="button-row">
            <button class="button button--ghost" type="button" @click="syncCreateXml">Sync XML now</button>
          </div>
        </div>

        <div class="button-row">
          <button class="button" @click="loadBlankSchema" :disabled="createState.loading">Load blank schema</button>
          <button class="button button--ghost" @click="loadSynopsisSchema" :disabled="createState.loading">
            Load synopsis schema
          </button>
        </div>
        <textarea
          v-model="createState.xml"
          rows="12"
          class="textarea"
          placeholder="XML payload"
          @input="onCreateXmlInput"
        ></textarea>
        <div class="button-row">
          <button class="button" @click="createResource" :disabled="createState.loading || !createState.xml">
            Create
          </button>
          <span v-if="createState.success" class="success">{{ createState.success }}</span>
        </div>
        <p v-if="createState.error" class="error">{{ createState.error }}</p>
      </section>

      <section class="card" v-if="canUpdate || canPatch">
        <h2>Update</h2>
        <label>
          ID
          <input v-model="updateState.id" type="text" placeholder="1" />
        </label>
        <div class="form-section">
          <div class="form-section__header">
            <h3>Form</h3>
            <label class="toggle">
              <input type="checkbox" v-model="updateForm.sync" />
              Sync XML
            </label>
          </div>
          <div v-if="listColumns.available.length" class="form-rows">
            <div v-for="column in listColumns.available" :key="`update-${column}`" class="form-row">
              <input :value="column" type="text" disabled />
              <input v-model="updateForm.values[column]" type="text" placeholder="value" />
            </div>
          </div>
          <p v-else class="muted">Load the list to populate form fields.</p>
          <div class="button-row">
            <button class="button button--ghost" type="button" @click="syncUpdateXml">Sync XML now</button>
          </div>
        </div>

        <div class="button-row">
          <button class="button button--ghost" @click="loadUpdateXml" :disabled="updateState.loading || !updateState.id">
            Load current XML
          </button>
        </div>
        <textarea
          v-model="updateState.xml"
          rows="12"
          class="textarea"
          placeholder="XML payload"
          @input="onUpdateXmlInput"
        ></textarea>
        <div class="button-row">
          <button
            v-if="canUpdate"
            class="button"
            @click="updateResource"
            :disabled="updateState.loading || !updateState.id || !updateState.xml"
          >
            Save (PUT)
          </button>
          <button
            v-if="canPatch"
            class="button button--ghost"
            @click="patchResource"
            :disabled="updateState.loading || !updateState.id || !updateState.xml"
          >
            Patch
          </button>
          <span v-if="updateState.success" class="success">{{ updateState.success }}</span>
        </div>
        <p v-if="updateState.error" class="error">{{ updateState.error }}</p>
      </section>

      <section class="card" v-if="canDelete">
        <h2>Delete</h2>
        <label>
          ID
          <input v-model="deleteState.id" type="text" placeholder="1" />
        </label>
        <div class="button-row">
          <button class="button button--danger" @click="confirmDelete" :disabled="deleteState.loading || !deleteState.id">
            Delete
          </button>
          <span v-if="deleteState.success" class="success">{{ deleteState.success }}</span>
        </div>
        <p v-if="deleteState.error" class="error">{{ deleteState.error }}</p>
      </section>
    </div>
  </section>
</template>

