<script setup>
import { reactive, onMounted, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getCustomerId, setCustomerId } from '@/api/customerIdentity'
import { loadCustomerOrderDetail } from '@/api/useCustomerOrders'

const route = useRoute()
const state = reactive({ loading: true, error: '', order: null, details: [], histories: [] })
const form = reactive({ customerId: route.query.customerId || getCustomerId() || '' })
const orderId = parseInt(route.params.id)

const hasCustomer = computed(() => Boolean(parseInt(form.customerId || '')))

const load = async () => {
  state.loading = true
  state.error = ''
  const customerId = setCustomerId(form.customerId)
  if (!customerId) {
    state.error = 'Renseigne un identifiant client pour afficher le détail de la commande.'
    state.loading = false
    return
  }

  try {
    const result = await loadCustomerOrderDetail(customerId, orderId)
    state.order = result.order
    state.details = result.details
    state.histories = result.histories
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
  }
}

onMounted(() => { if (hasCustomer.value) load() })
</script>

<template>
  <section class="order-detail-page">
    <header class="order-detail-page__header">
      <div>
        <h1>Détail commande</h1>
        <p class="muted">Contenu, statut et historique</p>
      </div>
      <RouterLink :to="{ name: 'front-orders', query: { customerId: form.customerId } }" class="button button--ghost">Retour liste</RouterLink>
    </header>

    <div class="card order-detail-page__toolbar">
      <label for="customer-id-detail">Identifiant client</label>
      <div class="order-detail-page__toolbar-row">
        <input id="customer-id-detail" v-model="form.customerId" type="number" min="1" class="order-detail-page__input" placeholder="Ex: 2" />
        <button class="button" type="button" @click="load" :disabled="state.loading">{{ state.loading ? 'Chargement…' : 'Rafraîchir' }}</button>
      </div>
    </div>

    <div v-if="state.loading" class="card order-detail-page__state">Chargement du détail…</div>
    <div v-else-if="state.error" class="card order-detail-page__state order-detail-page__state--error">{{ state.error }}</div>

    <div v-else-if="state.order" class="order-detail-layout">
      <section class="card">
        <div class="order-detail__head">
          <div>
            <h2>{{ state.order.reference }}</h2>
            <p class="muted">{{ new Date(state.order.dateAdd).toLocaleString() }}</p>
          </div>
          <span class="status-pill">{{ state.order.statusLabel }}</span>
        </div>
        <div class="order-detail__grid">
          <div><span class="muted">Montant</span><strong>{{ state.order.totalPaid }}€</strong></div>
          <div><span class="muted">Paiement</span><strong>{{ state.order.payment || '—' }}</strong></div>
          <div><span class="muted">Facture</span><strong>{{ state.order.invoiceNumber || '—' }}</strong></div>
          <div><span class="muted">Livraison</span><strong>{{ state.order.deliveryNumber || '—' }}</strong></div>
        </div>
      </section>

      <section class="card">
        <h3>Produits commandés</h3>
        <div v-if="state.details.length === 0" class="muted">Aucune ligne trouvée.</div>
        <div v-else class="detail-lines">
          <article v-for="line in state.details" :key="line.id" class="detail-line">
            <div>
              <strong>{{ line.productName }}</strong>
              <p class="muted small">{{ line.quantity }} × {{ line.unitPrice }}€</p>
            </div>
            <strong>{{ line.totalPrice }}€</strong>
          </article>
        </div>
      </section>

      <section class="card">
        <h3>Historique des statuts</h3>
        <div v-if="state.histories.length === 0" class="muted">Aucun historique disponible.</div>
        <div v-else class="history-timeline">
          <div v-for="item in state.histories" :key="item.id" class="history-item">
            <span class="history-item__dot" />
            <div>
              <strong>{{ item.stateLabel }}</strong>
              <p class="muted small">{{ new Date(item.dateAdd).toLocaleString() }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.order-detail-page{max-width:1120px;margin:0 auto;padding:1rem}.order-detail-page__header{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}.order-detail-page__toolbar{display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem}.order-detail-page__toolbar-row{display:flex;gap:.75rem;flex-wrap:wrap}.order-detail-page__input{border:1px solid var(--border);border-radius:10px;padding:.75rem .9rem;min-width:220px;font-size:1rem}.order-detail-page__state{padding:1rem}.order-detail-page__state--error{background:#fff2f2;color:var(--danger)}.order-detail-layout{display:grid;gap:1rem}.order-detail__head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem}.order-detail__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.order-detail__grid > div{display:flex;flex-direction:column;gap:.25rem}.detail-lines{display:flex;flex-direction:column;gap:.75rem}.detail-line{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 0;border-bottom:1px solid var(--border)}.detail-line:last-child{border-bottom:none}.history-timeline{display:flex;flex-direction:column;gap:1rem}.history-item{display:flex;align-items:flex-start;gap:.75rem}.history-item__dot{width:12px;height:12px;border-radius:999px;background:var(--primary);margin-top:.35rem;box-shadow:0 0 0 4px rgba(55,93,251,.12)}.status-pill{display:inline-flex;align-items:center;padding:.35rem .7rem;border-radius:999px;font-size:.82rem;font-weight:700;background:#eef2ff;color:var(--primary)}.small{font-size:.85rem}
</style>

