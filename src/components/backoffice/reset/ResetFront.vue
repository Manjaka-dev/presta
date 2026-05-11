<script setup>
import { reactive } from 'vue'
import { resourceApi } from '@/api/resources'
import { processQueue, retry } from '@/utils/asyncQueue.js'
import { extractItems } from '@/utils/resourceData.js'

const RESOURCES_TO_RESET = [
  // Commandes et dérivées (à supprimer en premier)
  { key: 'order_details', label: 'Order Details', deletable: true },
  { key: 'order_histories', label: 'Order Histories', deletable: true },
  { key: 'order_invoices', label: 'Order Invoices', deletable: true },
  { key: 'order_payments', label: 'Order Payments', deletable: true },
  { key: 'order_slip', label: 'Order Slip', deletable: true },
  { key: 'order_cart_rules', label: 'Order Cart Rules', deletable: true },
  { key: 'order_carriers', label: 'Order Carriers', deletable: true },
  { key: 'orders', label: 'Orders', deletable: true },
  // Clients et paniers
  { key: 'customers', label: 'Customers', deletable: true },
  { key: 'carts', label: 'Carts', deletable: true },
  // Produits et variantes
  { key: 'combinations', label: 'Combinations', deletable: true },
  { key: 'product_option_values', label: 'Product Option Values', deletable: true },
  { key: 'product_options', label: 'Product Options', deletable: true },
  { key: 'products', label: 'Products', deletable: true },
  // Catégories et taxes
  { key: 'categories', label: 'Categories', deletable: true },
  { key: 'taxes', label: 'Taxes', deletable: true },
  { key: 'tax_rules', label: 'Tax Rules', deletable: true },
  { key: 'tax_rule_groups', label: 'Tax Rule Groups', deletable: true },
]

const state = reactive({
  loading: false,
  success: 0,
  failed: 0,
  skipped: 0,
  warnings: 0,
  message: '',
  error: '',
})

const stats = reactive({
  total: 0,
  processed: 0,
  results: [], // { resource, status, count, error }
})

const resetResource = async (resourceDef) => {
  const api = resourceApi(resourceDef.key)
  const data = await api.list({ display: '[id]' })
  const items = extractItems(data, api.resource)
  const ids = items
	.map((item) => item.id || item[api.resource.key])
	.filter((value) => value !== undefined && value !== null)

  if (!ids.length) {
	state.skipped += 1
    stats.results.push({
      resource: resourceDef.label,
      status: 'skipped',
      count: 0,
      error: null,
    })
	state.message = `${resourceDef.label}: rien à supprimer`
	console.info('[ResetFront] skip', { resource: resourceDef.key, reason: 'no ids' })
	return
  }

  if (!resourceDef.deletable) {
	state.warnings += 1
    stats.results.push({
      resource: resourceDef.label,
      status: 'todo',
      count: 0,
      error: 'DELETE method unavailable',
    })
	state.message = `${resourceDef.label}: TODO (DELETE indisponible)`
	console.info('[ResetFront] todo', {
	  resource: resourceDef.key,
	  note: 'delete method unavailable',
	  ids: ids.length,
	})
	return
  }

  console.info('[ResetFront] delete start', {
	resource: resourceDef.key,
	ids: ids.length,
  })

  const worker = async (id) => {
	await retry(() => api.remove(id), 3, 1000)
	state.success += 1
  }

  let localFailed = 0
  const queueWorker = async (id) => {
    try {
      await retry(() => api.remove(id), 3, 1000)
      state.success += 1
    } catch (error) {
      localFailed += 1
      state.failed += 1
      console.error('[ResetFront] item delete failed', {
        resource: resourceDef.key,
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await processQueue(ids, queueWorker, 5)

  stats.results.push({
    resource: resourceDef.label,
    status: localFailed > 0 ? 'partial' : 'success',
    count: ids.length - localFailed,
    error: localFailed > 0 ? `${localFailed} erreur(s)` : null,
  })
  state.message = `${resourceDef.label}: ${ids.length} supprimé(s)`
}

const runReset = async () => {
  if (state.loading) return

  state.loading = true
  state.success = 0
  state.failed = 0
  state.skipped = 0
  state.warnings = 0
  state.message = ''
  state.error = ''
  stats.total = RESOURCES_TO_RESET.length
  stats.processed = 0
  stats.results = []

  console.info('[ResetFront] start')

  try {
	for (const resourceDef of RESOURCES_TO_RESET) {
	  await resetResource(resourceDef)
      stats.processed += 1
	}

	if (!state.error) {
	  console.info('[ResetFront] done', {
		success: state.success,
		skipped: state.skipped,
		warnings: state.warnings,
	  })
	}
  } catch (error) {
	state.failed += 1
	state.error = error instanceof Error ? error.message : String(error)
	state.message = ''
	console.error('[ResetFront] error', error)
  } finally {
	state.loading = false
  }
}
</script>

<template>
  <section class="reset-page" :aria-busy="state.loading">
	<div class="reset-page__content">
	  <button
		class="button button--danger reset-page__button"
		type="button"
		:disabled="state.loading"
		@click="runReset"
	  >
		{{ state.loading ? 'Réinitialisation…' : 'Réinitialiser' }}
	  </button>

	  <p v-if="state.message && !state.error" class="reset-page__message reset-page__message--ok">
		{{ state.message }}
	  </p>
	  <p v-else-if="state.error" class="reset-page__message reset-page__message--error">
		{{ state.error }}
	  </p>

      <div v-if="stats.results.length && !state.loading" class="reset-page__results">
        <h3>Résumé</h3>
        <p class="reset-page__stats">
          Supprimé: <strong>{{ state.success }}</strong> |
          Échoué: <strong>{{ state.failed }}</strong> |
          Sauté: <strong>{{ state.skipped }}</strong> |
          TODO: <strong>{{ state.warnings }}</strong>
        </p>
        <ul class="reset-page__details">
          <li v-for="(result, idx) in stats.results" :key="idx" :class="`detail--${result.status}`">
            <span class="detail__resource">{{ result.resource }}</span>
            <span class="detail__count" v-if="result.count > 0">{{ result.count }} supprimé</span>
            <span class="detail__status" v-if="result.error">{{ result.error }}</span>
            <span class="detail__status detail__status--skip" v-else-if="result.status === 'skipped'">Rien à supprimer</span>
            <span class="detail__status detail__status--todo" v-else-if="result.status === 'todo'">À faire</span>
          </li>
        </ul>
      </div>
	</div>
  </section>
</template>

<style scoped>
.reset-page {
  min-height: calc(100vh - 4rem);
  display: grid;
  place-items: center;
}

.reset-page__content {
  display: grid;
  gap: 0.75rem;
  justify-items: center;
  text-align: center;
}

.reset-page__button {
  min-width: 180px;
}

.reset-page__message {
  margin: 0;
  font-size: 0.9rem;
}

.reset-page__message--ok {
  color: #2a8a43;
}

.reset-page__message--error {
  color: var(--danger);
}
</style>