/**
 * Service d'import de commandes depuis CSV
 * Gère la création customer + address + cart + order + detail + history
 */
import { DEFAULT_LANG_ID } from './constants'
import { createCustomer, findCustomerIdByEmail } from './customersService'
import { createAddress } from './addressesService'
import { createCart } from './cartsService'
import { createOrder } from './ordersService'
import { createOrderDetail } from './orderDetailsService'
import { createOrderHistory } from './orderHistoriesService'
import { findProductInfoByReference } from './productsService'
import { findProductOptionValueIdByName } from './productOptionValuesService'
import { findCombinationByProductAndValueId } from './combinationsService'
import { getXml } from './crud'
import { toInt } from '@/utils/stringUtils'
import { getText, parseXml } from '@/utils/xmlUtils'

export async function createOrderFromCsvRow(row, config) {
  const orderItems = parseOrderItems(row.achat)
  if (!orderItems.length) {
    throw new Error('Champ achat vide ou invalide')
  }

  const customerId = await ensureCustomer(row, config)
  const secureKey = await fetchCustomerSecureKey(customerId)
  if (!secureKey) {
    throw new Error('Missing secure_key for customer')
  }
  const addressId = await createAddressForCustomer(customerId, row, config)
  const resolvedItems = await resolveOrderItems(orderItems)

  if (!resolvedItems.length) {
    throw new Error('Aucun produit valide trouvé')
  }

  const cartId = await createCartForOrder(customerId, addressId, resolvedItems, config)
  const totals = computeOrderTotals(resolvedItems)
  const orderStateId = resolveOrderStateId(row.etat, config)

  const orderId = await createOrder({
    id_cart: cartId,
    id_currency: config.currencyId,
    id_lang: config.langId,
    id_customer: customerId,
    id_address_delivery: addressId,
    id_address_invoice: addressId,
    id_carrier: config.carrierId,
    id_shop: config.shopId,
    id_shop_group: config.shopGroupId,
    current_state: orderStateId,
    payment: 'Paiement a la livraison',
    module: config.cashModule,
    total_paid: totals.totalPaid,
    total_paid_real: totals.totalPaid,
    total_paid_tax_incl: totals.totalPaid,
    total_paid_tax_excl: totals.totalPaid,
    total_products: totals.totalProducts,
    total_products_wt: totals.totalProducts,
    total_discounts: totals.totalDiscounts,
    total_discounts_tax_incl: totals.totalDiscounts,
    total_discounts_tax_excl: totals.totalDiscounts,
    total_shipping: totals.totalShipping,
    total_shipping_tax_incl: totals.totalShipping,
    total_shipping_tax_excl: totals.totalShipping,
    total_wrapping: totals.totalWrapping,
    total_wrapping_tax_incl: totals.totalWrapping,
    total_wrapping_tax_excl: totals.totalWrapping,
    secure_key: secureKey,
    conversion_rate: 1
  })

  for (const item of resolvedItems) {
    const lineName = item.karazany ? `${item.name} (${item.karazany})` : item.name
    const unitPrice = formatMoney(item.price)
    const lineTotal = formatMoney(item.price * item.quantity)
    await createOrderDetail({
      id_order: orderId,
      product_id: item.id,
      product_attribute_id: item.productAttributeId || 0,
      product_name: lineName,
      product_reference: item.reference,
      product_quantity: item.quantity,
      product_price: unitPrice,
      unit_price_tax_incl: unitPrice,
      unit_price_tax_excl: unitPrice,
      total_price_tax_incl: lineTotal,
      total_price_tax_excl: lineTotal,
      id_warehouse: config.warehouseId,
      id_shop: config.shopId
    })
  }

  if (orderStateId) {
    await createOrderHistory({
      id_order: orderId,
      id_order_state: orderStateId
    })
  }

  return orderId
}

export function buildOrderConfig() {
  return {
    langId: toInt(import.meta.env.VITE_DEFAULT_LANG_ID || DEFAULT_LANG_ID, DEFAULT_LANG_ID),
    shopId: toInt(import.meta.env.VITE_DEFAULT_SHOP_ID || '1', 1),
    shopGroupId: toInt(import.meta.env.VITE_DEFAULT_SHOP_GROUP_ID || '1', 1),
    currencyId: toInt(import.meta.env.VITE_DEFAULT_CURRENCY_ID || '1', 1),
    countryId: toInt(import.meta.env.VITE_DEFAULT_COUNTRY_ID || '8', 8),
    stateId: toInt(import.meta.env.VITE_DEFAULT_STATE_ID || '0', 0),
    customerGroupId: toInt(import.meta.env.VITE_DEFAULT_CUSTOMER_GROUP_ID || '3', 3),
    carrierId: toInt(import.meta.env.VITE_DEFAULT_CARRIER_ID || '1', 1),
    warehouseId: toInt(import.meta.env.VITE_DEFAULT_WAREHOUSE_ID || '1', 1),
    defaultCity: (import.meta.env.VITE_DEFAULT_CITY || 'Paris').trim(),
    defaultPostcode: (import.meta.env.VITE_DEFAULT_POSTCODE || '75000').trim(),
    cashModule: (import.meta.env.VITE_CASH_MODULE || 'ps_cashondelivery').trim(),
    orderStatePendingId: toInt(import.meta.env.VITE_ORDER_STATE_PENDING_ID || '14', 14),
    orderStatePaidId: toInt(import.meta.env.VITE_ORDER_STATE_PAID_ID || '2', 2),
    orderStateErrorId: toInt(import.meta.env.VITE_ORDER_STATE_ERROR_ID || '8', 8)
  }
}

export function validateOrderConfig(config) {
  if (!config.currencyId) throw new Error('Missing VITE_DEFAULT_CURRENCY_ID')
  if (!config.langId) throw new Error('Missing VITE_DEFAULT_LANG_ID')
  if (!config.shopId) throw new Error('Missing VITE_DEFAULT_SHOP_ID')
  if (!config.carrierId) throw new Error('Missing VITE_DEFAULT_CARRIER_ID')
}

export function parseOrderItems(raw) {
  if (!raw) return []
  const rawText = String(raw).trim()
  const needsUnescape = /""[^\\"]+""/.test(rawText)
  const normalized = needsUnescape ? rawText.replace(/""/g, '"') : rawText
  const inner = normalized.replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '')
  if (!inner) return []

  const tuplePattern = /\([^()]*\)/g
  const itemPattern = /^\(\s*"([^"]*)"\s*;\s*([0-9]+)\s*;\s*"([^"]*)"\s*\)$/

  return (inner.match(tuplePattern) || [])
    .map((tuple) => {
      const match = tuple.match(itemPattern)
      if (!match) return null
      return {
        reference: match[1].trim(),
        quantity: toInt(match[2], 0),
        karazany: match[3].trim()
      }
    })
    .filter(Boolean)
}

async function ensureCustomer(row, config) {
  const email = row.email?.trim()
  if (!email) throw new Error('Missing email')
  const existingId = await findCustomerIdByEmail(email)
  if (existingId) return existingId

  const name = row.nom?.trim() || 'Client'
  const nameParts = name.split(' ').filter(Boolean)
  const firstname = nameParts.shift() || name
  const lastname = nameParts.join(' ') || name
  const password = row.pwd?.trim() || 'changeme'

  return createCustomer({
    id_lang: config.langId,
    id_shop: config.shopId,
    id_shop_group: config.shopGroupId,
    id_default_group: config.customerGroupId,
    firstname,
    lastname,
    email,
    passwd: password,
    active: 1
  })
}

async function createAddressForCustomer(customerId, row, config) {
  if (!config.countryId) throw new Error('Missing VITE_DEFAULT_COUNTRY_ID')
  const name = row.nom?.trim() || 'Client'
  const nameParts = name.split(' ').filter(Boolean)
  const firstname = nameParts.shift() || name
  const lastname = nameParts.join(' ') || name

  return createAddress({
    id_customer: customerId,
    id_country: config.countryId,
    id_state: config.stateId,
    alias: 'Import',
    firstname,
    lastname,
    address1: row.adresse?.trim() || 'N/A',
    city: config.defaultCity,
    postcode: config.defaultPostcode
  })
}

async function resolveOrderItems(items) {
  const resolved = []
  for (const item of items) {
    const info = await findProductInfoByReference(item.reference)
    if (!info) {
      console.warn(`[commandeService] Produit non trouvé: ${item.reference}`)
      continue
    }
    let productAttributeId = 0
    let price = info.price
    if (item.karazany) {
      const combination = await findCombinationForKarazany(info.id, item.karazany)
      if (combination) {
        productAttributeId = combination.id
        price = info.price + combination.priceImpact
      } else {
        console.warn(`[commandeService] Déclinaison non trouvée: ${item.reference} ${item.karazany}`)
      }
    }
    resolved.push({
      id: info.id,
      name: info.name || item.reference,
      price,
      reference: item.reference,
      quantity: item.quantity,
      karazany: item.karazany,
      productAttributeId
    })
  }
  return resolved
}

async function createCartForOrder(customerId, addressId, items, config) {
  const cartRows = items.map((item) => ({
    id_product: item.id,
    id_product_attribute: item.productAttributeId || 0,
    id_address_delivery: addressId,
    quantity: item.quantity
  }))

  return createCart({
    id_customer: customerId,
    id_address_delivery: addressId,
    id_address_invoice: addressId,
    id_currency: config.currencyId,
    id_lang: config.langId,
    id_shop: config.shopId,
    id_shop_group: config.shopGroupId,
    associations: {
      cart_rows: {
        cart_row: cartRows
      }
    }
  })
}

function computeOrderTotals(items) {
  const totalProductsValue = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const totalProducts = formatMoney(totalProductsValue)
  return {
    totalProducts,
    totalPaid: totalProducts,
    totalDiscounts: formatMoney(0),
    totalShipping: formatMoney(0),
    totalWrapping: formatMoney(0)
  }
}

function formatMoney(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0.00'
  return numeric.toFixed(2)
}

function resolveOrderStateId(status, config) {
  const normalized = String(status || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (normalized.includes('accepte')) return config.orderStatePaidId
  if (normalized.includes('erreur')) return config.orderStateErrorId
  return config.orderStatePendingId
}

async function fetchCustomerSecureKey(customerId) {
  const xml = await getXml(`customers/${customerId}`)
  const doc = parseXml(xml)
  return getText(doc, 'secure_key')
}

async function findCombinationForKarazany(productId, karazany) {
  if (!karazany) return null
  const valueId = await findProductOptionValueIdByName(karazany)
  if (!valueId) return null
  return findCombinationByProductAndValueId(productId, valueId)
}
