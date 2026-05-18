<script setup>
import { ref, reactive } from 'vue'
import { parseCsvFile, validateHeaders } from '@/api/import/csvParser'
import { runImport } from '@/api/import/importService'
import { runReset } from '@/api/import/resetService'

const sections = reactive({
  products: { file: null, rows: [], headers: [], status: '', running: false, result: null },
  stocks: { file: null, rows: [], headers: [], status: '', running: false, result: null },
  orders: { file: null, rows: [], headers: [], status: '', running: false, result: null },
  images: { files: [], status: '', running: false, result: null }
})

const logs = ref([])

function addLog(msg) {
  logs.value.push({ time: new Date().toLocaleTimeString(), msg })
  if (logs.value.length > 200) logs.value.shift()
}

async function onCsvSelected(section, event) {
  const file = event.target?.files?.[0]
  section.file = file || null
  section.rows = []
  section.headers = []
  section.status = ''
  section.result = null
  if (!file) return
  try {
    const parsed = await parseCsvFile(file)
    section.rows = parsed.rows
    section.headers = parsed.normalizedHeaders
    section.status = `${parsed.rows.length} ligne(s) chargée(s)`
  } catch (error) {
    section.status = `Erreur de parsing: ${error.message}`
  }
}

function onImagesSelected(event) {
  const files = event.target?.files
  sections.images.files = files ? Array.from(files) : []
  sections.images.status = sections.images.files.length
    ? `${sections.images.files.length} fichier(s) sélectionné(s)`
    : ''
  sections.images.result = null
}

async function startImport(target) {
  const section = sections[target]
  if (section.running) return

  if (target === 'images') {
    if (!section.files.length) {
      section.status = 'Chargez des images ou un fichier ZIP d\'abord.'
      return
    }
  } else {
    if (!section.rows.length) {
      section.status = 'Chargez un fichier CSV d\'abord.'
      return
    }
  }

  section.running = true
  section.status = 'Import en cours...'
  section.result = null
  addLog(`▶ Début import ${target}`)

  try {
    if (target !== 'images') {
      validateHeaders(target, section.headers)
    }

    const result = await runImport({
      target,
      rows: section.rows,
      files: section.files,
      onProgress: (msg) => addLog(msg)
    })
    section.result = result
    section.status = `Import terminé: ${result.success}/${result.total} réussi(s)`
    addLog(`✅ Import ${target} terminé: ${result.success}/${result.total}`)
  } catch (error) {
    section.status = `Erreur: ${error.message}`
    addLog(`❌ Import ${target} échoué: ${error.message}`)
    throw error // Re-throw to be caught by startAll or handle reset here
  } finally {
    section.running = false
  }
}

const anyRunning = ref(false)

async function startAll() {
  if (anyRunning.value) return
  anyRunning.value = true
  logs.value = []

  const steps = [
    { target: 'products', label: 'Produits' },
    { target: 'stocks', label: 'Stocks' },
    { target: 'orders', label: 'Commandes' },
    { target: 'images', label: 'Images' }
  ]

  try {
    for (const step of steps) {
      const section = sections[step.target]
      const hasData = step.target === 'images' ? section.files.length > 0 : section.rows.length > 0
      if (hasData) {
        addLog(`━━━ ${step.label} ━━━`)
        await startImport(step.target)
      }
    }
  } catch (error) {
    addLog(`🛑 IMPORT ARRÊTÉ SUITE À UNE ERREUR CRITIQUE. Lancement du Rollback...`)
    try {
      await runReset()
      addLog(`♻️ Base de données réinitialisée (Rollback terminé)`)
    } catch (resetErr) {
      addLog(`❌ Échec critique lors du Rollback: ${resetErr.message}`)
    }
  }

  anyRunning.value = false
}
</script>

<template>
  <section class="import-page">
    <div class="import-page__header">
      <RouterLink to="/back" class="import-page__back">← Retour</RouterLink>
      <h1 class="import-page__title">Import CSV</h1>
      <p class="import-page__subtitle">
        Importez vos données produits, stocks, commandes et images vers PrestaShop
      </p>
    </div>

    <div class="import-page__grid">
      <!-- Produits -->
      <div class="import-card" :class="{ 'import-card--running': sections.products.running }">
        <div class="import-card__icon">📦</div>
        <h2 class="import-card__title">Produits</h2>
        <p class="import-card__desc">Fichier CSV produit (nom, référence, prix, catégorie)</p>
        <label class="import-card__input-wrap">
          <input
            type="file"
            accept=".csv,text/csv"
            class="import-card__file"
            @change="onCsvSelected(sections.products, $event)"
            :disabled="sections.products.running"
          />
        </label>
        <p v-if="sections.products.status" class="import-card__status" :class="{ 'import-card__status--error': sections.products.status.startsWith('Erreur') }">
          {{ sections.products.status }}
        </p>
        <div v-if="sections.products.result" class="import-card__result">
          {{ sections.products.result.success }}/{{ sections.products.result.total }} importé(s)
        </div>
        <button
          class="import-card__btn"
          :disabled="sections.products.running || !sections.products.rows.length"
          @click="startImport('products')"
        >
          {{ sections.products.running ? 'Import en cours...' : 'Importer les produits' }}
        </button>
      </div>

      <!-- Stocks -->
      <div class="import-card" :class="{ 'import-card--running': sections.stocks.running }">
        <div class="import-card__icon">📊</div>
        <h2 class="import-card__title">Stocks</h2>
        <p class="import-card__desc">Fichier CSV stock (référence, spécificité, quantité)</p>
        <label class="import-card__input-wrap">
          <input
            type="file"
            accept=".csv,text/csv"
            class="import-card__file"
            @change="onCsvSelected(sections.stocks, $event)"
            :disabled="sections.stocks.running"
          />
        </label>
        <p v-if="sections.stocks.status" class="import-card__status" :class="{ 'import-card__status--error': sections.stocks.status.startsWith('Erreur') }">
          {{ sections.stocks.status }}
        </p>
        <div v-if="sections.stocks.result" class="import-card__result">
          {{ sections.stocks.result.success }}/{{ sections.stocks.result.total }} importé(s)
        </div>
        <button
          class="import-card__btn"
          :disabled="sections.stocks.running || !sections.stocks.rows.length"
          @click="startImport('stocks')"
        >
          {{ sections.stocks.running ? 'Import en cours...' : 'Importer les stocks' }}
        </button>
      </div>

      <!-- Commandes -->
      <div class="import-card" :class="{ 'import-card--running': sections.orders.running }">
        <div class="import-card__icon">🛒</div>
        <h2 class="import-card__title">Commandes</h2>
        <p class="import-card__desc">Fichier CSV commande (client, achat, état)</p>
        <label class="import-card__input-wrap">
          <input
            type="file"
            accept=".csv,text/csv"
            class="import-card__file"
            @change="onCsvSelected(sections.orders, $event)"
            :disabled="sections.orders.running"
          />
        </label>
        <p v-if="sections.orders.status" class="import-card__status" :class="{ 'import-card__status--error': sections.orders.status.startsWith('Erreur') }">
          {{ sections.orders.status }}
        </p>
        <div v-if="sections.orders.result" class="import-card__result">
          {{ sections.orders.result.success }}/{{ sections.orders.result.total }} importé(s)
        </div>
        <button
          class="import-card__btn"
          :disabled="sections.orders.running || !sections.orders.rows.length"
          @click="startImport('orders')"
        >
          {{ sections.orders.running ? 'Import en cours...' : 'Importer les commandes' }}
        </button>
      </div>

      <!-- Images -->
      <div class="import-card" :class="{ 'import-card--running': sections.images.running }">
        <div class="import-card__icon">🖼️</div>
        <h2 class="import-card__title">Images</h2>
        <p class="import-card__desc">Images produit (.zip ou images, nom du fichier = référence)</p>
        <label class="import-card__input-wrap">
          <input
            type="file"
            accept=".zip,image/*"
            multiple
            class="import-card__file"
            @change="onImagesSelected($event)"
            :disabled="sections.images.running"
          />
        </label>
        <p v-if="sections.images.status" class="import-card__status">
          {{ sections.images.status }}
        </p>
        <div v-if="sections.images.result" class="import-card__result">
          {{ sections.images.result.success }}/{{ sections.images.result.total }} importée(s)
        </div>
        <button
          class="import-card__btn"
          :disabled="sections.images.running || !sections.images.files.length"
          @click="startImport('images')"
        >
          {{ sections.images.running ? 'Import en cours...' : 'Importer les images' }}
        </button>
      </div>
    </div>

    <!-- Bouton tout importer -->
    <div class="import-page__actions">
      <button
        class="import-page__btn-all"
        :disabled="anyRunning"
        @click="startAll"
      >
        {{ anyRunning ? 'Import séquentiel en cours...' : '🚀 Tout importer (séquentiel)' }}
      </button>
    </div>

    <!-- Journal -->
    <div v-if="logs.length" class="import-page__log">
      <h3 class="import-page__log-title">Journal d'import</h3>
      <div class="import-page__log-scroll" ref="logScroll">
        <div v-for="(entry, i) in logs" :key="i" class="log-entry">
          <span class="log-entry__time">{{ entry.time }}</span>
          <span class="log-entry__msg">{{ entry.msg }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.import-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.import-page__header {
  margin-bottom: 2rem;
}

.import-page__back {
  font-size: 0.85rem;
  color: var(--muted, #6b7280);
  text-decoration: none;
  display: inline-block;
  margin-bottom: 0.5rem;
}

.import-page__back:hover {
  color: var(--primary, #375dfb);
}

.import-page__title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  color: var(--text, #1a1a2e);
}

.import-page__subtitle {
  color: var(--muted, #6b7280);
  font-size: 0.95rem;
  margin: 0;
}

.import-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.import-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.import-card:hover {
  border-color: var(--primary, #375dfb);
  box-shadow: 0 4px 16px rgba(55, 93, 251, 0.08);
}

.import-card--running {
  border-color: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.12);
}

.import-card__icon {
  font-size: 1.8rem;
}

.import-card__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  color: var(--text, #1a1a2e);
}

.import-card__desc {
  font-size: 0.82rem;
  color: var(--muted, #6b7280);
  margin: 0;
  line-height: 1.4;
}

.import-card__input-wrap {
  display: block;
}

.import-card__file {
  width: 100%;
  font-size: 0.85rem;
  padding: 0.5rem;
  border: 1px dashed var(--border, #d1d5db);
  border-radius: 8px;
  background: #f9fafb;
  cursor: pointer;
}

.import-card__file:hover {
  border-color: var(--primary, #375dfb);
  background: #f0f4ff;
}

.import-card__status {
  font-size: 0.82rem;
  color: var(--muted, #6b7280);
  margin: 0;
}

.import-card__status--error {
  color: #dc2626;
}

.import-card__result {
  font-size: 0.85rem;
  font-weight: 600;
  color: #059669;
  padding: 0.35rem 0.6rem;
  background: #ecfdf5;
  border-radius: 6px;
  text-align: center;
}

.import-card__btn {
  padding: 0.55rem 1rem;
  border-radius: 8px;
  border: none;
  background: var(--primary, #375dfb);
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  margin-top: auto;
}

.import-card__btn:hover:not(:disabled) {
  background: #2a4bd4;
}

.import-card__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.import-page__actions {
  text-align: center;
  margin-bottom: 1.5rem;
}

.import-page__btn-all {
  padding: 0.75rem 2rem;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #375dfb 0%, #6366f1 100%);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 4px 14px rgba(55, 93, 251, 0.2);
}

.import-page__btn-all:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(55, 93, 251, 0.3);
}

.import-page__btn-all:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.import-page__log {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  color: #e2e8f0;
}

.import-page__log-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0 0 0.6rem;
  color: #94a3b8;
}

.import-page__log-scroll {
  max-height: 280px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.78rem;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  gap: 0.6rem;
}

.log-entry__time {
  color: #64748b;
  flex-shrink: 0;
}

.log-entry__msg {
  word-break: break-word;
}
</style>