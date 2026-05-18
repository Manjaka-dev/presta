import { resourceApi } from '@/api/resources'
import { processQueue, retry } from '@/utils/asyncQueue.js'
import { extractItems } from '@/utils/resourceData.js'

// We only reset resources that we import/recreate
export const RESOURCES_TO_RESET = [
  // Orders & related
  { key: 'order_details', label: 'Order Details', deletable: true },
  { key: 'order_histories', label: 'Order Histories', deletable: true },
  { key: 'orders', label: 'Orders', deletable: true },
  // Carts & related
  { key: 'carts', label: 'Carts', deletable: true },
  { key: 'addresses', label: 'Addresses', deletable: true },
  { key: 'customers', label: 'Customers', deletable: true },
  // Products & Stock
  { key: 'combinations', label: 'Combinations', deletable: true },
  { key: 'product_option_values', label: 'Product Option Values', deletable: true },
  { key: 'product_options', label: 'Product Options', deletable: true },
  { key: 'products', label: 'Products', deletable: true },
  // Categories
  { key: 'categories', label: 'Categories', deletable: true, protectIds: [1, 2] },
  // Taxes
  { key: 'tax_rules', label: 'Tax Rules', deletable: true },
  { key: 'tax_rule_groups', label: 'Tax Rule Groups', deletable: true },
  { key: 'taxes', label: 'Taxes', deletable: true },
]

export const resetResource = async (resourceDef, state, stats) => {
  const api = resourceApi(resourceDef.key)
  const data = await api.list({ display: '[id]', limit: 1000 })
  const items = extractItems(data, api.resource)

  let ids = items
	.map((item) => item.id || item[api.resource.key])
	.filter((value) => value !== undefined && value !== null)
    .map((value) => parseInt(value, 10))

  // Protection des IDs critiques (ex: Root Category = 1, Home Category = 2)
  if (resourceDef.protectIds) {
    ids = ids.filter(id => !resourceDef.protectIds.includes(id))
  }

  if (!ids.length) {
	if (state) state.skipped += 1
    if (stats) {
        stats.results.push({
            resource: resourceDef.label,
            status: 'skipped',
            count: 0,
            error: null,
        })
    }
	if (state) state.message = `${resourceDef.label}: rien à supprimer`
	console.info('[ResetService] skip', { resource: resourceDef.key, reason: 'no ids' })
	return
  }

  if (!resourceDef.deletable) {
	if (state) state.warnings += 1
    if (stats) {
        stats.results.push({
            resource: resourceDef.label,
            status: 'todo',
            count: 0,
            error: 'DELETE method unavailable',
        })
    }
	if (state) state.message = `${resourceDef.label}: TODO (DELETE indisponible)`
	console.info('[ResetService] todo', {
	  resource: resourceDef.key,
	  note: 'delete method unavailable',
	  ids: ids.length,
	})
	return
  }

  console.info('[ResetService] delete start', {
	resource: resourceDef.key,
	ids: ids.length,
  })

  let localFailed = 0
  const queueWorker = async (id) => {
    try {
      await retry(() => api.remove(id), 3, 1000)
      if (state) state.success += 1
    } catch (error) {
      localFailed += 1
      if (state) state.failed += 1
      console.error('[ResetService] item delete failed', {
        resource: resourceDef.key,
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await processQueue(ids, queueWorker, 5)

  if (stats) {
      stats.results.push({
        resource: resourceDef.label,
        status: localFailed > 0 ? 'partial' : 'success',
        count: ids.length - localFailed,
        error: localFailed > 0 ? `${localFailed} erreur(s)` : null,
      })
  }
  if (state) state.message = `${resourceDef.label}: ${ids.length} supprimé(s)`
}

export const runReset = async (state = null, stats = null) => {
  if (state && state.loading) return

  if (state) {
      state.loading = true
      state.success = 0
      state.failed = 0
      state.skipped = 0
      state.warnings = 0
      state.message = ''
      state.error = ''
  }
  
  if (stats) {
      stats.total = RESOURCES_TO_RESET.length
      stats.processed = 0
      stats.results = []
  }

  console.info('[ResetService] start')

  try {
	for (const resourceDef of RESOURCES_TO_RESET) {
	  await resetResource(resourceDef, state, stats)
      if (stats) stats.processed += 1
	}

	if (state && !state.error) {
	  console.info('[ResetService] done', {
		success: state.success,
		skipped: state.skipped,
		warnings: state.warnings,
	  })
	}
  } catch (error) {
	if (state) {
        state.failed += 1
        state.error = error instanceof Error ? error.message : String(error)
        state.message = ''
    }
	console.error('[ResetService] error', error)
    throw error
  } finally {
	if (state) state.loading = false
  }
}
