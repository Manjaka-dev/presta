<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { allResources } from '@/config/resources.js'
import { getRequiredFields } from '@/config/requiredFields.js'
import { resourceApi } from '@/api/resources'
import { processQueue, retry } from '@/utils/asyncQueue.js'
import { buildXmlFromRow, parseCsv, validateRequired, parseXmlRoot } from '@/utils/csv.js'

const resourceKey = ref(allResources[0]?.key || '')
const resource = computed(() => allResources.find((item) => item.key === resourceKey.value))

const options = reactive({
  columnSeparator: ',',
  multiValueSeparator: '|',
  decimalSeparator: '.',
  hasHeader: true,
})

const fileState = reactive({
  name: '',
  content: '',
  headers: [],
  rows: [],
  skipped: [],
})

const importState = reactive({
  running: false,
  total: 0,
  valid: 0,
  skipped: 0,
  success: 0,
  failed: 0,
  errors: [],
  concurrency: 5,
  retries: 3,
  backoffMs: 1000,
  xmlRoot: '',
})

const previewRows = computed(() => fileState.rows.slice(0, 5))

const CREATE_FORBIDDEN_FIELDS = new Set(['id', 'date_add', 'date_upd'])

const sanitizeCreateRow = (row) => {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !CREATE_FORBIDDEN_FIELDS.has(key))
  )
}

const handleFile = async (event) => {
  const file = event.target.files?.[0]
  if (!file) {
    return
  }

  fileState.name = file.name
  fileState.content = await file.text()
  parseFile()
}

const parseFile = () => {
  if (!fileState.content) {
    fileState.headers = []
    fileState.rows = []
    fileState.skipped = []
    return
  }

  const requiredFields = getRequiredFields(resourceKey.value)
  console.info('[CSV Import] Parse', {
    resourceKey: resourceKey.value,
    separators: { ...options },
    requiredFields,
  })
  const parsed = parseCsv(fileState.content, {
    ...options,
    expectedHeaders: requiredFields,
  })
  console.info('[CSV Import] Parsed headers', parsed.headers)

  const validRows = []
  const skipped = []

  parsed.rows.forEach((row, index) => {
    if (!requiredFields.length) {
      validRows.push(row)
      return
    }

    const { isValid, missing } = validateRequired(row, requiredFields)
    if (!isValid) {
      skipped.push({ index: index + 1, missing })
      return
    }

    validRows.push(row)
  })

  fileState.headers = parsed.headers
  fileState.rows = validRows
  fileState.skipped = skipped

  importState.total = parsed.rows.length
  importState.valid = validRows.length
  importState.skipped = skipped.length
  importState.success = 0
  importState.failed = 0
  importState.errors = []
  console.info('[CSV Import] Parse summary', {
    total: importState.total,
    valid: importState.valid,
    skipped: importState.skipped,
  })
}

const startImport = async () => {
  if (!resourceKey.value || !fileState.rows.length || importState.running) {
    return
  }

  const api = resourceApi(resourceKey.value)
  importState.running = true
  importState.success = 0
  importState.failed = 0
  importState.errors = []
  console.info('[CSV Import] Start', {
    resourceKey: resourceKey.value,
    rows: fileState.rows.length,
    concurrency: importState.concurrency,
    retries: importState.retries,
    backoffMs: importState.backoffMs,
  })

  if (!importState.xmlRoot) {
    try {
      const schema = await api.schemaBlank()
      importState.xmlRoot = parseXmlRoot(schema)
      console.info('[CSV Import] Schema root', importState.xmlRoot)
    } catch (error) {
      importState.xmlRoot = ''
      const message = error instanceof Error ? error.message : String(error)
      importState.errors.push(message)
      console.error('[CSV Import] Schema error', message)
    }
  }

  const rows = [...fileState.rows]
  const forbiddenFields = new Set(['id', 'date_add', 'date_upd'])

  const worker = async (row) => {
    const sanitizedRow = sanitizeCreateRow(row)
    const xml = buildXmlFromRow(resourceKey.value, sanitizedRow, importState.xmlRoot, { forbiddenFields })
    console.info('[CSV Import] Send row', {
      keys: Object.keys(sanitizedRow),
      row: sanitizedRow,
      xml,
    })
    try {
      await retry(() => api.create(xml), importState.retries, importState.backoffMs)
      importState.success += 1
    } catch (error) {
      importState.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      importState.errors.push({ row, error: message })
      console.error('[CSV Import] Row error', { row, error: message, xml })
    }
  }

  try {
    await processQueue(rows, worker, importState.concurrency)
  } finally {
    importState.running = false
    console.info('[CSV Import] Done', {
      success: importState.success,
      failed: importState.failed,
    })
  }
}

watch(resourceKey, () => {
  importState.xmlRoot = ''
  if (fileState.content) {
    parseFile()
  }
})
</script>

<template>
  <section class="tool-page">
    <header class="tool-page__header">
      <div>
        <h1>CSV Import</h1>
        <p class="muted">Import CSV rows into a PrestaShop resource.</p>
      </div>
      <RouterLink to="/admin" class="button button--ghost">Back to admin</RouterLink>
    </header>

    <div class="tool-grid">
      <section class="card">
        <h2>Source</h2>
        <label>
          Resource
          <select v-model="resourceKey">
            <option v-for="item in allResources" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </label>

        <div class="form-grid">
          <label>
            Column separator
            <input v-model="options.columnSeparator" type="text" maxlength="1" />
          </label>
          <label>
            Multi-value separator
            <input v-model="options.multiValueSeparator" type="text" maxlength="1" />
          </label>
          <label>
            Decimal separator
            <input v-model="options.decimalSeparator" type="text" maxlength="1" />
          </label>
          <label class="toggle">
            <input v-model="options.hasHeader" type="checkbox" />
            CSV has header
          </label>
        </div>

        <label>
          CSV file
          <input type="file" accept=".csv,text/csv" @change="handleFile" />
        </label>

        <div class="button-row">
          <button class="button button--ghost" type="button" @click="parseFile">Parse file</button>
          <button class="button" type="button" @click="startImport" :disabled="importState.running">
            Start import
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Summary</h2>
        <p class="muted">Resource: {{ resource?.label || '-' }}</p>
        <div class="summary-grid">
          <div class="summary-card">Total: {{ importState.total }}</div>
          <div class="summary-card">Valid: {{ importState.valid }}</div>
          <div class="summary-card">Skipped: {{ importState.skipped }}</div>
          <div class="summary-card">Success: {{ importState.success }}</div>
          <div class="summary-card">Failed: {{ importState.failed }}</div>
        </div>

        <div class="form-grid">
          <label>
            Concurrency
            <input v-model.number="importState.concurrency" type="number" min="1" max="10" />
          </label>
          <label>
            Retries
            <input v-model.number="importState.retries" type="number" min="0" max="10" />
          </label>
          <label>
            Backoff (ms)
            <input v-model.number="importState.backoffMs" type="number" min="100" step="100" />
          </label>
        </div>

        <details v-if="fileState.skipped.length" class="raw-block">
          <summary>Skipped rows (missing required fields)</summary>
          <ul class="tool-list">
            <li v-for="item in fileState.skipped" :key="item.index">
              Row {{ item.index }}: {{ item.missing.join(', ') }}
            </li>
          </ul>
        </details>

        <details v-if="importState.errors.length" class="raw-block">
          <summary>Import errors</summary>
          <ul class="tool-list">
            <li v-for="(item, index) in importState.errors" :key="index">
              {{ item.error }}
            </li>
          </ul>
        </details>
      </section>
    </div>

    <section class="card">
      <h2>Preview</h2>
        <div v-if="previewRows.length" class="list-table">
        <!-- fixed-size preview container with both-axis scrolling (inline styles to ensure enforcement) -->
        <div
          class="list-table__container csv-preview__container"
          style="height:360px; max-height:360px; overflow:auto; display:block;"
          role="region"
          aria-label="Aperçu CSV"
        >
          <table class="list-table__table" style="min-width:max-content; width:auto;">
            <thead>
              <tr>
                <th v-for="header in fileState.headers" :key="header">{{ header }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in previewRows" :key="index">
                <td v-for="header in fileState.headers" :key="`${index}-${header}`">
                  {{ row[header] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else class="muted">No parsed rows.</p>
    </section>
  </section>
</template>


