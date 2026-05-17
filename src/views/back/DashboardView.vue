<script setup>
import { reactive, computed, watch } from 'vue'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

const today = new Date()
const pad = (n) => String(n).padStart(2, '0')
const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

const state = reactive({
  // Stats journalières (qui est maintenant "Jour choisi")
  selectedDay: formatDate(today),
  todayOrders: 0,
  todayTotal: 0,
  loadingToday: false,

  // Filtre période
  period: 'monthly',
  customStart: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
  customEnd: formatDate(today),
  periodTotal: 0,
  periodOrders: 0,
  loadingPeriod: false,
  error: '',
})

const PERIODS = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  biannual: 'Semestriel',
  yearly: 'Annuel',
  custom: 'Personnalisé',
}

const getPeriodDates = () => {
  const now = new Date()
  let start, end = formatDate(now)
  switch (state.period) {
    case 'monthly':
      start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1)); break
    case 'quarterly':
      start = formatDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)); break
    case 'biannual':
      start = formatDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)); break
    case 'yearly':
      start = formatDate(new Date(now.getFullYear(), 0, 1)); break
    case 'custom':
      start = state.customStart; end = state.customEnd; break
    default:
      start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
  }
  return { start, end }
}

const loadToday = async () => {
  state.loadingToday = true
  try {
    const todayStr = state.selectedDay
    const api = resourceApi('orders')
    const res = await api.list({
      display: '[id,total_paid,date_add]',
      'filter[date_add]': `[${todayStr} 00:00:00,${todayStr} 23:59:59]`,
      date: 1, // Filter by date array requires date=1 flag
      limit: 1000,
    })
    const items = extractItems(res, api.resource)

    state.todayOrders = items.length
    state.todayTotal = items.reduce((s, o) => s + (parseFloat(o.total_paid) || 0), 0)
  } catch (e) {
    console.error('[Dashboard] Erreur stats journalières', e)
  } finally {
    state.loadingToday = false
  }
}

const loadPeriod = async () => {
  state.loadingPeriod = true
  state.error = ''
  try {
    const { start, end } = getPeriodDates()
    const api = resourceApi('orders')
    const res = await api.list({
      display: '[id,total_paid,date_add]',
      'filter[date_add]': `[${start} 00:00:00,${end} 23:59:59]`,
      date: 1,
      limit: 1000,
    })
    const items = extractItems(res, api.resource)

    state.periodOrders = items.length
    state.periodTotal = items.reduce((s, o) => s + (parseFloat(o.total_paid) || 0), 0)
  } catch (e) {
    state.error = e.message || 'Erreur de chargement'
    console.error('[Dashboard] Erreur stats période', e)
  } finally {
    state.loadingPeriod = false
  }
}

const fmtEur = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

watch(() => state.period, loadPeriod)
watch(() => state.selectedDay, loadToday)

loadToday()
loadPeriod()
</script>

<template>
  <section class="dashboard">
    <header class="dashboard-header">
      <h1>📊 Dashboard</h1>
      <p class="muted">Vue d'ensemble des ventes</p>
    </header>

    <!-- Stats d'un jour spécifique -->
    <div class="stats-section">
      <div class="section-header-flex">
          <h2 class="section-title">Aperçu Journalier</h2>
          <label class="date-selector">
              Jour : <input type="date" v-model="state.selectedDay" class="date-input" />
          </label>
      </div>

      <div v-if="state.loadingToday" class="loading-block">Chargement…</div>
      <div v-else class="kpi-grid">
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-label">Commandes</div>
          <div class="kpi-value">{{ state.todayOrders }}</div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-label">Ventes du jour</div>
          <div class="kpi-value">{{ fmtEur(state.todayTotal) }}</div>
        </div>
        <div class="kpi-card kpi-card--purple">
          <div class="kpi-label">Panier moyen</div>
          <div class="kpi-value">{{ state.todayOrders > 0 ? fmtEur(state.todayTotal / state.todayOrders) : '—' }}</div>
        </div>
      </div>
    </div>

    <!-- Stats par Période -->
    <div class="stats-section">
      <h2 class="section-title">Analyse par période</h2>

      <div class="period-controls">
        <div class="period-tabs">
          <button
            v-for="(label, key) in PERIODS"
            :key="key"
            :class="['period-tab', { active: state.period === key }]"
            @click="state.period = key"
          >{{ label }}</button>
        </div>

        <div v-if="state.period === 'custom'" class="custom-dates">
          <label>Du <input type="date" v-model="state.customStart" class="date-input" /></label>
          <label>Au <input type="date" v-model="state.customEnd" class="date-input" /></label>
          <button class="button button--primary btn-apply" @click="loadPeriod">Appliquer</button>
        </div>
      </div>

      <div v-if="state.error" class="error-block"><p>{{ state.error }}</p></div>
      <div v-else-if="state.loadingPeriod" class="loading-block">Chargement…</div>
      <div v-else class="kpi-grid">
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-label">Commandes (période)</div>
          <div class="kpi-value">{{ state.periodOrders }}</div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-label">Total des ventes</div>
          <div class="kpi-value">{{ fmtEur(state.periodTotal) }}</div>
        </div>
        <div class="kpi-card kpi-card--purple">
          <div class="kpi-label">Panier moyen</div>
          <div class="kpi-value">{{ state.periodOrders > 0 ? fmtEur(state.periodTotal / state.periodOrders) : '—' }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dashboard {
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.dashboard-header { margin-bottom: 2rem; }
.dashboard-header h1 { margin: 0; font-size: 2rem; }
.muted { color: #6b7280; margin: 0.25rem 0 0; }

.stats-section { margin-bottom: 2.5rem; }
.section-header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
.section-title { font-size: 1.2rem; font-weight: 600; color: #374151; margin: 0; }
.date-selector { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; font-weight: 500; }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.25rem;
}
.kpi-card {
  background: white;
  border-radius: 14px;
  padding: 1.5rem;
  border-left: 5px solid transparent;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
}
.kpi-card--blue { border-color: #3b82f6; }
.kpi-card--green { border-color: #10b981; }
.kpi-card--purple { border-color: #8b5cf6; }
.kpi-label { font-size: 0.85rem; color: #6b7280; margin-bottom: 0.5rem; font-weight: 500; }
.kpi-value { font-size: 2rem; font-weight: 700; color: #111827; }

.period-controls { margin-bottom: 1.25rem; }
.period-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.period-tab {
  padding: 0.45rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  background: white;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
}
.period-tab.active, .period-tab:hover {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}
.custom-dates {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem;
  background: #f8faff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.custom-dates label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
.date-input {
  padding: 0.4rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.btn-apply { padding: 0.45rem 1.25rem; font-size: 0.875rem; }

.loading-block {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 10px;
}
.error-block {
  background: #fef2f2;
  border: 1px solid #fee2e2;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: #ef4444;
}
.error-block p { margin: 0; }
</style>