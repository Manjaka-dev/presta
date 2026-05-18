import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

const extractSingleItem = (payload, resource) => {
  if (!payload || payload.__raw) return null
  let data = payload.prestashop || payload
  if (Array.isArray(data)) return data[0] || null

  for (const key of [resource?.endpoint, resource?.key, 'order', 'orders']) {
    const value = data?.[key]
    if (Array.isArray(value)) return value[0] || null
    if (value && typeof value === 'object') return value
  }

  const firstArray = Object.values(data || {}).find(value => Array.isArray(value))
  if (firstArray) return firstArray[0] || null

  return data && typeof data === 'object' && 'id' in data ? data : null
}

const getStatusMap = async () => {
  const api = resourceApi('order_states')
  const response = await api.list({ display: '[id,name]', limit: 500 })
  const items = extractItems(response, api.resource)
  return Object.fromEntries(items.map(state => [parseInt(state.id), state.name]))
}

const mapStatusLabel = (id, rawLabel) => {
  const norm = String(rawLabel || '').toLowerCase()
  if (id === 2 || norm.includes('accepté') || norm.includes('accepted')) return 'paiement effectué'
  if (id === 5 || norm.includes('livré') || norm.includes('delivered')) return 'livré'
  if (id === 6 || norm.includes('annulé') || norm.includes('cancel')) return 'annulé'
  return rawLabel || `Statut #${id}`
}

export const loadCustomerOrders = async (customerId) => {
  if (!customerId && customerId !== 0) throw new Error('customerId requis')

  const api = resourceApi('orders')
  const response = await api.list({
    'filter[id_customer]': customerId,
    display: 'full',
    sort: '[id_DESC]',
    limit: 100
  })
  // Debug: afficher la réponse brute pour aider à diagnostiquer les erreurs liées aux filtres
  if (response && response.__raw) {
    console.debug('[useCustomerOrders] raw orders response (unparsed):', response.__raw)
  } else {
    console.debug('[useCustomerOrders] orders response:', response)
  }
  const items = extractItems(response, api.resource)
  const statuses = await getStatusMap()

  return items.map(order => {
    const statusId = parseInt(order.current_state || 0)
    return {
      id: parseInt(order.id),
      customerId: parseInt(order.id_customer),
      reference: order.reference || `#${order.id}`,
      statusId,
      statusLabel: mapStatusLabel(statusId, statuses[statusId]),
      totalPaid: parseFloat(order.total_paid || 0).toFixed(2),
      dateAdd: order.date_add,
    }
  })
}

export const loadCustomerOrderDetail = async (customerId, orderId) => {
  if (!customerId && customerId !== 0) throw new Error('customerId requis')
  const api = resourceApi('orders')
  const response = await api.get(orderId, { display: 'full' })
  const order = extractSingleItem(response, api.resource)
  if (!order || parseInt(order.id_customer) !== parseInt(customerId)) {
    throw new Error('Commande non trouvée')
  }

  const [statusMap, detailsResponse, historiesResponse] = await Promise.all([
    getStatusMap(),
    resourceApi('order_details').list({ 'filter[id_order]': orderId, display: '[id_order,product_name,product_quantity,unit_price_tax_incl,total_price_tax_incl]', limit: 500 }),
    resourceApi('order_histories').list({ 'filter[id_order]': orderId, display: 'full', sort: '[id_ASC]', limit: 500 }),
  ])

  // Debug: afficher les réponses brutes des détails et historques de commande
  if (detailsResponse && detailsResponse.__raw) console.debug('[useCustomerOrders] order_details raw:', detailsResponse.__raw)
  else console.debug('[useCustomerOrders] order_details response:', detailsResponse)
  if (historiesResponse && historiesResponse.__raw) console.debug('[useCustomerOrders] order_histories raw:', historiesResponse.__raw)
  else console.debug('[useCustomerOrders] order_histories response:', historiesResponse)

  const details = extractItems(detailsResponse, resourceApi('order_details').resource).map(line => ({
    id: parseInt(line.id || 0),
    productName: line.product_name,
    quantity: parseInt(line.product_quantity || 0),
    unitPrice: parseFloat(line.unit_price_tax_incl || 0).toFixed(2),
    totalPrice: parseFloat(line.total_price_tax_incl || 0).toFixed(2),
  }))

  const histories = extractItems(historiesResponse, resourceApi('order_histories').resource).map(history => {
    const stateId = parseInt(history.id_order_state || 0)
    return {
      id: parseInt(history.id || 0),
      stateId,
      stateLabel: mapStatusLabel(stateId, statusMap[stateId]),
      dateAdd: history.date_add,
    }
  })

  const currentStatusId = parseInt(order.current_state || 0)
  return {
    order: {
      id: parseInt(order.id),
      reference: order.reference || `#${order.id}`,
      statusId: currentStatusId,
      statusLabel: mapStatusLabel(currentStatusId, statusMap[currentStatusId]),
      totalPaid: parseFloat(order.total_paid || 0).toFixed(2),
      dateAdd: order.date_add,
      payment: order.payment,
      deliveryNumber: order.delivery_number,
      invoiceNumber: order.invoice_number,
      valid: String(order.valid) === '1' || order.valid === 1,
    },
    details,
    histories,
  }
}
