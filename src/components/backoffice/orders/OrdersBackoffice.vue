<script setup>
import { reactive } from 'vue'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

// Tous les statuts disponibles
const EDITABLE_STATUSES = reactive({})

// --- CONFIGURATION POUR FILTRAGE / RENOMMAGE ---
// Filtrer par ID (recommandé). Laisser vide [] pour autoriser tous les statuts.
const ALLOWED_STATUS_IDS = [] // ex: [1, 2, 6]

// Alternative: filtrer par nom exact (si vous ne connaissez pas les IDs).
// Si ALLOWED_STATUS_IDS contient des valeurs, il a priorité.
const ALLOWED_STATUS_NAMES = [
    'Annulé',
    'Erreur de paiement',
    'Paiement accepté'
] // ex: ['Annulé', 'Payment failed']

// Renommage: map statut ID -> nouveau libellé
// OU map nom exact -> nouveau libellé. Exemples:
// { 6: 'Arrêter' }            -> remplace par ID
// { 'Annulé': 'Arrêter' }     -> remplace par nom exact retourné par l'API
const NAME_OVERRIDES = {
  // 6: 'Arrêter',
  'Erreur de paiement': 'echec paiement',
  'Paiement accepté': 'paiement effectué'
}
// --- fin configuration ---

const state = reactive({
  loading: false,
  orders: [],
  total: 0,
  error: '',
  statesLoaded: false,
})

const editing = reactive({
  orderId: null,
  statusId: null,
  saving: false,
})

const loadOrderStates = async () => {
  try {
    const api = resourceApi('order_states')
    const response = await api.list({
      display: '[id,name]',
      limit: 200,
    })
    const items = extractItems(response, api.resource)

    // vider l'objet réactif si rechargement
    Object.keys(EDITABLE_STATUSES).forEach(k => delete EDITABLE_STATUSES[k])

    const normalizeName = (rawName) => {
      if (rawName === null || rawName === undefined) return ''
      if (typeof rawName === 'string') return rawName
      if (Array.isArray(rawName) && rawName.length) return rawName[0]
      if (typeof rawName === 'object') {
        // Try to find a string value or common nested fields
        for (const v of Object.values(rawName)) {
          if (typeof v === 'string') return v
          if (v && typeof v === 'object') {
            if (typeof v.language === 'string') return v.language
            if (typeof v['#text'] === 'string') return v['#text']
            const firstKey = Object.keys(v)[0]
            if (firstKey && typeof v[firstKey] === 'string') return v[firstKey]
          }
        }
        const vals = Object.values(rawName)
        if (vals.length) return String(vals[0])
      }
      return String(rawName)
    }

    items.forEach(s => {
      const id = parseInt(s.id)
      if (Number.isNaN(id)) return

      const labelRaw = normalizeName(s.name)

      // Filtre par ID si défini
      if (Array.isArray(ALLOWED_STATUS_IDS) && ALLOWED_STATUS_IDS.length > 0) {
        if (!ALLOWED_STATUS_IDS.includes(id)) return
      } else if (Array.isArray(ALLOWED_STATUS_NAMES) && ALLOWED_STATUS_NAMES.length > 0) {
        // Filtre par nom si ALLOWED_STATUS_IDS vide
        if (!ALLOWED_STATUS_NAMES.includes(labelRaw)) return
      }

      let label = labelRaw
      // Override par ID prioritaire
      if (NAME_OVERRIDES.hasOwnProperty(id)) {
        label = NAME_OVERRIDES[id]
      } else if (NAME_OVERRIDES.hasOwnProperty(labelRaw)) {
        // Override par nom exact (string key)
        label = NAME_OVERRIDES[labelRaw]
      }

      EDITABLE_STATUSES[id] = label
    })

    state.statesLoaded = true
    console.info('[OrdersBackoffice] loaded order states', { count: Object.keys(EDITABLE_STATUSES).length })
  } catch (error) {
    console.error('[OrdersBackoffice] error loading order states', error)
    state.statesLoaded = true // Continue anyway
  }
}

const loadOrders = async () => {
  state.loading = true
  state.error = ''
  try {
    const api = resourceApi('orders')
    const response = await api.list({
      display: '[id,id_customer,total_paid,date_add,current_state]',
      limit: 50,
    })
    const items = extractItems(response, api.resource)
    state.orders = items.map(order => ({
      id: order.id,
      customer: order.id_customer,
      total: order.total_paid,
      date: order.date_add,
      statusId: parseInt(order.current_state),
    }))
    state.total = state.orders.length
    console.info('[OrdersBackoffice] loaded', { count: state.total })
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    console.error('[OrdersBackoffice] error', error)
  } finally {
    state.loading = false
  }
}

const getStatusLabel = (statusId) => {
  return EDITABLE_STATUSES[statusId] || `Status #${statusId}`
}

const isEditableStatus = (statusId) => {
  return statusId in EDITABLE_STATUSES
}

const startEditing = (orderId, currentStatusId) => {
  editing.orderId = orderId
  editing.statusId = currentStatusId
}

const cancelEditing = () => {
  editing.orderId = null
  editing.statusId = null
}

const saveStatus = async () => {
  if (!editing.orderId || !editing.statusId) return

  editing.saving = true
  try {
    const api = resourceApi('orders')
    // Pour mettre à jour le statut, on doit patcher avec le champ current_state
    // L'ID est requis dans le XML pour la mise à jour
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order>
    <id>${editing.orderId}</id>
    <current_state>${editing.statusId}</current_state>
  </order>
</prestashop>`

    await api.patch(editing.orderId, xmlBody)

    // Mettre à jour l'ordre dans la liste
    const order = state.orders.find(o => o.id === editing.orderId)
    if (order) {
      order.statusId = editing.statusId
    }

    console.info('[OrdersBackoffice] status updated', {
      orderId: editing.orderId,
      newStatus: editing.statusId,
    })

    cancelEditing()
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    console.error('[OrdersBackoffice] update error', error)
  } finally {
    editing.saving = false
  }
}

// Charger les statuts puis les commandes au montage
const init = async () => {
  await loadOrderStates()
  await loadOrders()
}

init()
</script>

<template>
  <section class="orders-page">
    <header class="orders-page__header">
      <div>
        <h1>Commandes</h1>
        <p class="muted">Gestion des commandes et statuts</p>
      </div>
      <button class="button button--ghost" type="button" @click="loadOrders" :disabled="state.loading">
        {{ state.loading ? 'Chargement…' : 'Rafraîchir' }}
      </button>
    </header>

    <div v-if="state.error" class="error-block">
      <p>{{ state.error }}</p>
    </div>

    <div v-if="!state.loading && state.orders.length === 0" class="empty-state">
      <p class="muted">Aucune commande trouvée</p>
    </div>

    <div v-else-if="state.orders.length" class="orders-list">
      <div class="orders-list__header">
        <div class="col--id">ID</div>
        <div class="col--customer">Client</div>
        <div class="col--total">Total</div>
        <div class="col--date">Date</div>
        <div class="col--status">Statut</div>
        <div class="col--action">Action</div>
      </div>

      <div v-for="order in state.orders" :key="order.id" class="orders-list__row">
        <div class="col--id">{{ order.id }}</div>
        <div class="col--customer">{{ order.customer }}</div>
        <div class="col--total">{{ parseFloat(order.total).toFixed(2) }}€</div>
        <div class="col--date">{{ new Date(order.date).toLocaleDateString() }}</div>

        <div class="col--status">
          <template v-if="editing.orderId === order.id">
            <select v-model.number="editing.statusId" class="status-select small">
              <option v-for="(label, statusId) in EDITABLE_STATUSES" :key="statusId" :value="parseInt(statusId)">
                {{ label }}
              </option>
            </select>
          </template>
          <template v-else>
            <span class="status-badge" :class="`status-${order.statusId}`">
              {{ getStatusLabel(order.statusId) }}
            </span>
          </template>
        </div>

        <div class="col--action">
          <template v-if="editing.orderId === order.id">
            <button
              class="button button--small"
              type="button"
              @click="saveStatus"
              :disabled="editing.saving"
            >
              {{ editing.saving ? 'Envoi…' : 'Valider' }}
            </button>
            <button
              class="button button--small button--ghost"
              type="button"
              @click="cancelEditing"
              :disabled="editing.saving"
            >
              Annuler
            </button>
          </template>
          <template v-else-if="isEditableStatus(order.statusId)">
            <button
              class="button button--small button--ghost"
              type="button"
              @click="startEditing(order.id, order.statusId)"
            >
              Modifier
            </button>
          </template>
          <template v-else>
            <span class="muted small">Non modifiable</span>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.orders-page {
  padding: 1rem;
}

.orders-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.orders-page__header h1 {
  margin: 0;
}

.orders-page__header p {
  margin: 0.25rem 0 0;
}

.error-block {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: var(--danger);
}

.error-block p {
  margin: 0;
  font-size: 0.9rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
}

.orders-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  overflow-x: auto;
}

.orders-list__header {
  display: grid;
  grid-template-columns: 80px 100px 100px 120px 150px 130px;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f9faff;
  font-weight: 600;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--border);
}

.orders-list__row {
  display: grid;
  grid-template-columns: 80px 100px 100px 120px 150px 130px;
  gap: 0.75rem;
  padding: 0.75rem;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.orders-list__row:hover {
  background: #fafbff;
}

.col--id {
  font-weight: 600;
  font-size: 0.9rem;
}

.col--customer,
.col--total,
.col--date {
  font-size: 0.85rem;
}

.col--status {
  font-size: 0.85rem;
}

.col--action {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  background: #e8e8e8;
  color: #333;
}

.status-badge.status-1 {
  background: #d4edda;
  color: #155724;
}

.status-badge.status-2 {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.status-6 {
  background: #f0f0f0;
  color: #666;
}

.status-select {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  font-family: inherit;
}

.button--small {
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
}

.small {
  font-size: 0.75rem;
}
</style>
