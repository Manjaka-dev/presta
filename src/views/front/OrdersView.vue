<script setup>
import { reactive, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { getCustomerId, setCustomerId } from '@/api/customerIdentity'
import { loadCustomerOrders } from '@/api/useCustomerOrders'

const route = useRoute()
const router = useRouter()
const state = reactive({ loading: false, error: '', orders: [] })
const form = reactive({ customerId: route.query.customerId || getCustomerId() || '' })

const hasCustomer = computed(() => Boolean(parseInt(form.customerId || '')))

const statusClass = (label = '') => {
  const value = String(label).toLowerCase()
  if (/(paid|accepted|shipped|delivered|valid|en cours)/.test(value)) return 'status-pill--ok'
  if (/(cancel|failed|refuse|error|problem)/.test(value)) return 'status-pill--bad'
  return 'status-pill--neutral'
}

const loadOrders = async () => {
  state.loading = true
  state.error = ''
  state.orders = []

  const customerId = setCustomerId(form.customerId)
  if (!customerId) {
    state.error = 'Renseigne un identifiant client pour afficher ses commandes.'
    state.loading = false
    return
  }

  try {
    state.orders = await loadCustomerOrders(customerId)
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
  }
}

const handleLogout = () => {
  sessionStorage.removeItem('customerId')
  sessionStorage.removeItem('isAnonymous')
  localStorage.removeItem('customerId')
  router.push('/front/login')
}

onMounted(() => { if (hasCustomer.value) loadOrders() })
</script>

<template>
  <section class="orders-page">
    <header class="orders-page__header">
      <div>
        <h1>Mes commandes</h1>
        <p class="muted">Liste des commandes passées par le client courant</p>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <RouterLink to="/front/products" class="button button--ghost">Retour boutique</RouterLink>
        <button @click="handleLogout" class="button button--danger">Déconnexion</button>
      </div>
    </header>

    <div v-if="state.error" class="card orders-page__state orders-page__state--error">{{ state.error }}</div>
    <div v-else-if="!state.loading && state.orders.length === 0" class="card orders-page__state">Aucune commande à afficher.</div>

    <div v-else class="orders-list">
      <RouterLink
        v-for="order in state.orders"
        :key="order.id"
        :to="{ name: 'front-order-detail', params: { id: order.id }, query: { customerId: form.customerId } }"
        class="order-card card"
      >
        <div class="order-card__top">
          <div>
            <strong>{{ order.reference }}</strong>
            <p class="muted small">{{ new Date(order.dateAdd).toLocaleDateString() }}</p>
          </div>
          <span class="status-pill" :class="statusClass(order.statusLabel)">{{ order.statusLabel }}</span>
        </div>

        <div class="order-card__meta">
          <span>Montant</span>
          <strong>{{ order.totalPaid }}€</strong>
        </div>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.orders-page{max-width:1120px;margin:0 auto;padding:1rem}.orders-page__header{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}.orders-page__toolbar{display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem}.orders-page__toolbar-row{display:flex;gap:.75rem;flex-wrap:wrap}.orders-page__input{border:1px solid var(--border);border-radius:10px;padding:.75rem .9rem;min-width:220px;font-size:1rem}.orders-page__state{padding:1rem}.orders-page__state--error{background:#fff2f2;color:var(--danger)}.orders-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.order-card{display:block}.order-card__top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.85rem}.order-card__meta{display:flex;align-items:center;justify-content:space-between;gap:1rem}.status-pill{display:inline-flex;align-items:center;padding:.35rem .7rem;border-radius:999px;font-size:.82rem;font-weight:700}.status-pill--ok{background:#e9f7ef;color:#18794e}.status-pill--bad{background:#fee;color:var(--danger)}.status-pill--neutral{background:#eef2ff;color:var(--primary)}.small{font-size:.85rem}
</style>