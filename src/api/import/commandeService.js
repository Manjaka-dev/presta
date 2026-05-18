/**
 * Service d'import de commandes depuis CSV
 * Gère la création customer + address + cart + order + detail + history
 */
import { DEFAULT_LANG_ID } from './constants'
import { createCustomer, findCustomerIdByEmail } from './customersService'
import { createAddress } from './addressesService'
import { createOrder as createOrderEntity, updateOrderDate } from './ordersService'
import { createOrderDetail } from './orderDetailsService'
import { createOrderHistory } from './orderHistoriesService'
import { findProductInfoByReference } from './productsService'
import { findProductOptionValueIdByName } from './productOptionValuesService'
import { findCombinationByProductAndValueId } from './combinationsService'
import { getXml } from './crud'
import { toInt } from '@/utils/stringUtils'
import { getText, parseXml } from '@/utils/xmlUtils'
import { calculateCartTaxes, createCart as createCartFromCheckout } from '../useCheckout' // Importer la fonction de calcul de taxe et createCart
import { createStockMovement } from '../stockService'
import { requestXml } from '@/api/httpClient'

function toIsoDateTime(raw) {
  if (!raw) return null
  const parts = raw.split('/')
  if (parts.length !== 3) return null
  const [day, month, year] = parts
  if (!day || !month || !year) return null
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 12:00:00`
}

function getNormalizedStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!normalized || normalized.includes('panier')) {
    return 'cart'
  }
  if (normalized.includes('accepte') || normalized.includes('effectue') || normalized.includes('payer') || normalized.includes('payee') || normalized.includes('paye')) {
    return 'paid'
  }
  if (normalized.includes('annul')) {
    return 'cancelled'
  }
  if (normalized.includes('livre')) {
    return 'delivered'
  }
  return 'pending'
}

async function changeOrderStatusCustom(orderId, targetStatusId, dateStr) {
  const datetimeStr = dateStr || new Date().toLocaleString('sv').slice(0, 19)
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <manual_order_state>
    <id_order>${orderId}</id_order>
    <id_order_state>${targetStatusId}</id_order_state>
    <id_employee>1</id_employee>
    <date>${datetimeStr}</date>
  </manual_order_state>
</prestashop>`
  await requestXml('POST', 'custom_order_state', xmlBody)
}

export async function createOrderFromCsvRow(row, config, cache = null) {
  const orderItems = parseOrderItems(row.achat)
  if (!orderItems.length) {
    throw new Error('Champ achat vide ou invalide')
  }

  const email = row.email?.trim() || ''
  const purchase = row.achat?.trim() || ''
  const orderSignature = `${email.toLowerCase()}_${purchase}`

  const statusType = getNormalizedStatus(row.etat)
  const orderDate = toIsoDateTime(row.date) || new Date().toISOString().slice(0, 19).replace('T', ' ')

  // 1. Gestion avec cache (mise à jour séquentielle)
  if (cache && cache.has(orderSignature)) {
    const existing = cache.get(orderSignature)

    // Sous-cas B1: Était un panier simple, maintenant promu en commande
    if (!existing.orderId) {
      if (statusType === 'cart') {
        return `Panier ${existing.cartId} (déjà existant)`
      }

      const totals = await computeOrderTotals(existing.resolvedItems)
      const orderId = await createOrderEntity({
        id_cart: existing.cartId,
        id_currency: config.currencyId,
        id_lang: config.langId,
        id_customer: existing.customerId,
        id_address_delivery: existing.addressId,
        id_address_invoice: existing.addressId,
        id_carrier: config.carrierId,
        id_shop: config.shopId,
        id_shop_group: config.shopGroupId,
        current_state: config.orderStatePaidId, // Toujours valider le paiement en premier !
        payment: 'Paiement a la livraison',
        module: config.cashModule,
        total_paid: totals.totalPaid,
        total_paid_real: totals.totalPaid,
        total_paid_tax_incl: totals.totalPaid,
        total_paid_tax_excl: totals.totalProducts,
        total_products: totals.totalProducts,
        total_products_wt: totals.totalPaid,
        total_discounts: "0.00",
        total_discounts_tax_incl: "0.00",
        total_discounts_tax_excl: "0.00",
        total_shipping: "0.00",
        total_shipping_tax_incl: "0.00",
        total_shipping_tax_excl: "0.00",
        total_wrapping: "0.00",
        total_wrapping_tax_incl: "0.00",
        total_wrapping_tax_excl: "0.00",
        secure_key: existing.secureKey,
        conversion_rate: 1,
        date_add: orderDate,
        date_upd: orderDate
      })

      if (row.date) {
        try {
          await updateOrderDate(orderId, orderDate)
        } catch(e) {
          console.warn(`[commandeService] Impossible de patcher la date pour la commande ${orderId}`, e)
        }
      }

      const { itemsWithTax } = await calculateCartTaxes(existing.resolvedItems)

      for (const item of itemsWithTax) {
        const lineName = item.karazany ? `${item.name} (${item.karazany})` : item.name
        const unitPriceHT = formatMoney(item.price)
        const unitPriceTTC = formatMoney(item.price * (1 + item.taxRate / 100))
        const lineTotalHT = formatMoney(item.price * item.quantity)
        const lineTotalTTC = formatMoney((item.price * (1 + item.taxRate / 100)) * item.quantity)

        await createOrderDetail({
          id_order: orderId,
          product_id: item.id,
          product_attribute_id: item.productAttributeId || 0,
          product_name: lineName,
          product_reference: item.reference,
          product_quantity: item.quantity,
          product_price: unitPriceHT,
          unit_price_tax_incl: unitPriceTTC,
          unit_price_tax_excl: unitPriceHT,
          total_price_tax_incl: lineTotalTTC,
          total_price_tax_excl: lineTotalHT,
          id_warehouse: config.warehouseId,
          id_shop: config.shopId
        })
        
        try {
          await createStockMovement({
            productId: item.id,
            productAttributeId: item.productAttributeId || 0,
            quantity: -item.quantity,
            reasonId: 3,
            employeeId: 1,
            warehouseId: config.warehouseId
          })
        } catch(e) {
          console.warn(`[commandeService] Impossible de décrémenter le stock pour la commande ${orderId}`, e)
        }
      }

      await createOrderHistory({
        id_order: orderId,
        id_order_state: config.orderStatePaidId,
        date_add: orderDate
      })

      let finalStatusId = config.orderStatePaidId
      if (statusType === 'cancelled') {
        finalStatusId = 6
        await changeOrderStatusCustom(orderId, 6, orderDate)
      } else if (statusType === 'delivered') {
        finalStatusId = 5
        await changeOrderStatusCustom(orderId, 5, orderDate)
      }

      existing.orderId = orderId
      existing.currentState = finalStatusId

      return `Commande ${orderId} (promue depuis panier, statut: ${statusType})`
    }

    // Sous-cas B2: Commande déjà créée
    if (statusType === 'cart') {
      return `Commande ${existing.orderId} (déjà créée, transition panier ignorée)`
    }

    let targetStatusId = config.orderStatePaidId
    if (statusType === 'cancelled') {
      targetStatusId = 6
    } else if (statusType === 'delivered') {
      targetStatusId = 5
    }

    if (existing.currentState === targetStatusId) {
      return `Commande ${existing.orderId} (statut déjà ${statusType})`
    }

    await changeOrderStatusCustom(existing.orderId, targetStatusId, orderDate)
    existing.currentState = targetStatusId

    return `Commande ${existing.orderId} (statut mis à jour vers: ${statusType} le ${row.date})`
  }

  // 2. Flux standard (première fois qu'on voit cet achat de ce client)
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

  if (statusType === 'cart') {
    if (cache) {
      cache.set(orderSignature, {
        cartId,
        orderId: null,
        customerId,
        secureKey,
        addressId,
        resolvedItems,
        currentState: 'cart'
      })
    }
    return `Panier ${cartId}`
  }

  const totals = await computeOrderTotals(resolvedItems)

  const orderId = await createOrderEntity({
    id_cart: cartId,
    id_currency: config.currencyId,
    id_lang: config.langId,
    id_customer: customerId,
    id_address_delivery: addressId,
    id_address_invoice: addressId,
    id_carrier: config.carrierId,
    id_shop: config.shopId,
    id_shop_group: config.shopGroupId,
    current_state: config.orderStatePaidId, // Toujours créé à l'état payé d'abord !
    payment: 'Paiement a la livraison',
    module: config.cashModule,
    total_paid: totals.totalPaid,
    total_paid_real: totals.totalPaid,
    total_paid_tax_incl: totals.totalPaid,
    total_paid_tax_excl: totals.totalProducts,
    total_products: totals.totalProducts,
    total_products_wt: totals.totalPaid,
    total_discounts: "0.00",
    total_discounts_tax_incl: "0.00",
    total_discounts_tax_excl: "0.00",
    total_shipping: "0.00",
    total_shipping_tax_incl: "0.00",
    total_shipping_tax_excl: "0.00",
    total_wrapping: "0.00",
    total_wrapping_tax_incl: "0.00",
    total_wrapping_tax_excl: "0.00",
    secure_key: secureKey,
    conversion_rate: 1,
    date_add: orderDate,
    date_upd: orderDate
  })

  if (row.date) {
    try {
      await updateOrderDate(orderId, orderDate)
    } catch(e) {
      console.warn(`[commandeService] Impossible de patcher la date pour la commande ${orderId}`, e)
    }
  }

  const { itemsWithTax } = await calculateCartTaxes(resolvedItems)

  for (const item of itemsWithTax) {
    const lineName = item.karazany ? `${item.name} (${item.karazany})` : item.name
    const unitPriceHT = formatMoney(item.price)
    const unitPriceTTC = formatMoney(item.price * (1 + item.taxRate / 100))
    const lineTotalHT = formatMoney(item.price * item.quantity)
    const lineTotalTTC = formatMoney((item.price * (1 + item.taxRate / 100)) * item.quantity)

    await createOrderDetail({
      id_order: orderId,
      product_id: item.id,
      product_attribute_id: item.productAttributeId || 0,
      product_name: lineName,
      product_reference: item.reference,
      product_quantity: item.quantity,
      product_price: unitPriceHT,
      unit_price_tax_incl: unitPriceTTC,
      unit_price_tax_excl: unitPriceHT,
      total_price_tax_incl: lineTotalTTC,
      total_price_tax_excl: lineTotalHT,
      id_warehouse: config.warehouseId,
      id_shop: config.shopId
    })
    
    try {
      await createStockMovement({
        productId: item.id,
        productAttributeId: item.productAttributeId || 0,
        quantity: -item.quantity,
        reasonId: 3,
        employeeId: 1,
        warehouseId: config.warehouseId
      })
    } catch(e) {
      console.warn(`[commandeService] Impossible de décrémenter le stock pour la commande ${orderId}`, e)
    }
  }

  await createOrderHistory({
    id_order: orderId,
    id_order_state: config.orderStatePaidId,
    date_add: orderDate
  })

  let finalStatusId = config.orderStatePaidId
  if (statusType === 'cancelled') {
    finalStatusId = 6
    await changeOrderStatusCustom(orderId, 6, orderDate)
  } else if (statusType === 'delivered') {
    finalStatusId = 5
    await changeOrderStatusCustom(orderId, 5, orderDate)
  }

  if (cache) {
    cache.set(orderSignature, {
      cartId,
      orderId,
      customerId,
      secureKey,
      addressId,
      resolvedItems,
      currentState: finalStatusId
    })
  }

  return `Commande ${orderId}`
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
      productAttributeId,
      id_tax_rules_group: info.id_tax_rules_group || 0
    })
  }
  return resolved
}

async function createCartForOrder(customerId, addressId, items, config) {
  const cartData = {
    customerId: customerId,
    addressId: addressId,
    idCurrency: config.currencyId,
    idLang: config.langId,
    items: items.map(item => ({
      id: item.id,
      combinationId: item.productAttributeId || 0,
      quantity: item.quantity
    }))
  }

  // Utiliser la fonction robuste de useCheckout qui crée puis patch le panier avec nodeType
  const cartId = await createCartFromCheckout(cartData)

  return cartId
}

async function computeOrderTotals(items) {
  const totalProductsHT = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const { totalTaxAmount } = await calculateCartTaxes(items)
  const totalPaidTTC = totalProductsHT + totalTaxAmount
  
  return {
    totalProducts: formatMoney(totalProductsHT),
    totalPaid: formatMoney(totalPaidTTC),
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
  if (normalized.includes('accepte') || normalized.includes('effectue') || normalized.includes('payer') || normalized.includes('payee') || normalized.includes('paye')) return config.orderStatePaidId
  if (normalized.includes('erreur')) return config.orderStateErrorId
  if (normalized.includes('annul')) return 6 // default PS cancelled state is 6
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