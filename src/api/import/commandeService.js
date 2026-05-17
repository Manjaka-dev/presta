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

function toIsoDateTime(raw) {
  if (!raw) return null
  const parts = raw.split('/')
  if (parts.length !== 3) return null
  const [day, month, year] = parts
  if (!day || !month || !year) return null
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 12:00:00`
}

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
  
  // S'il n'y a pas d'état, on s'arrête à la création du panier
  if (!row.etat || row.etat.trim() === '') {
    return `Panier ${cartId}` // On renvoie l'ID du panier
  }

  const totals = await computeOrderTotals(resolvedItems) // Await this async function
  const orderStateId = resolveOrderStateId(row.etat, config)
  
  const orderDate = toIsoDateTime(row.date) || new Date().toISOString().slice(0, 19).replace('T', ' ')

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
    current_state: orderStateId, // Créé à l'état cible directement
    payment: 'Paiement a la livraison',
    module: config.cashModule,
    total_paid: totals.totalPaid,
    total_paid_real: totals.totalPaid,
    total_paid_tax_incl: totals.totalPaid,
    total_paid_tax_excl: totals.totalProducts, // HT
    total_products: totals.totalProducts, // HT
    total_products_wt: totals.totalPaid, // TTC
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

  // Patch: PrestaShop n'autorise parfois pas de forcer la date de création lors du POST (création) 
  // car le constructeur d'ObjectModel la force. On tente un PUT pour forcer la date
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
    
    // Décrémenter le stock manuellement
    try {
        await createStockMovement({
            productId: item.id,
            productAttributeId: item.productAttributeId || 0,
            quantity: -item.quantity, // Quantité négative pour retirer du stock
            reasonId: 3, // 3 = Customer Order
            employeeId: 1
        })
    } catch(e) {
        console.warn(`[commandeService] Impossible de décrémenter le stock pour la commande ${orderId}`, e)
    }
  }

  // Historique de l'état cible (pour afficher le bon état dans l'admin)
  await createOrderHistory({
    id_order: orderId,
    id_order_state: orderStateId,
    date_add: orderDate
  })

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