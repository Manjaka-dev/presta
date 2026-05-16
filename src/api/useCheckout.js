import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

// --- Fonctions de calcul de taxe ---

let cachedTaxes = null
let cachedTaxRules = null

export const calculateCartTaxes = async (items) => {
  try {
    if (!cachedTaxes) {
      const taxesApi = resourceApi('taxes')
      const tRes = await taxesApi.list({ display: '[id,rate,name]' })
      cachedTaxes = extractItems(tRes, taxesApi.resource)
    }
    
    if (!cachedTaxRules) {
      const rulesApi = resourceApi('tax_rules')
      const rRes = await rulesApi.list({ display: '[id_tax_rules_group,id_tax]' })
      cachedTaxRules = extractItems(rRes, rulesApi.resource)
    }

    let totalTaxAmount = 0
    const itemsWithTax = items.map(item => {
      const taxInfo = getTaxInfoForItem(item, cachedTaxRules, cachedTaxes)
      const itemTax = (parseFloat(item.price) * (taxInfo.rate / 100)) * parseInt(item.quantity)
      totalTaxAmount += itemTax
      return { ...item, taxAmount: itemTax, taxRate: taxInfo.rate }
    })

    return { totalTaxAmount, itemsWithTax }
  } catch (e) {
    console.warn('[useCheckout] Could not calculate taxes', e)
    return { totalTaxAmount: 0, itemsWithTax: items.map(i => ({...i, taxAmount: 0, taxRate: 0})) }
  }
}

const getTaxInfoForItem = (item, taxRules, taxes) => {
  const groupId = item.id_tax_rules_group
  if (!groupId || groupId === '0' || !taxRules || !taxes) {
    return { rate: 0, name: 'No Tax' }
  }

  const taxRule = taxRules.find(tr => String(tr.id_tax_rules_group) === String(groupId))
  if (!taxRule) {
    return { rate: 0, name: 'No Rule' }
  }

  const tax = taxes.find(t => String(t.id) === String(taxRule.id_tax))
  if (tax) {
    return { rate: parseFloat(tax.rate || 0), name: tax.name || 'Tax' }
  }

  return { rate: 0, name: 'Tax not found' }
}

// --- Fonctions de création de Panier et Commande ---

const buildCartXml = (cartData) => {
  const { id, customerId, addressId = 1, idLang = 1, idCurrency = 1, items = [] } = cartData
  if (!customerId) throw new Error('customerId is required for cart')

  let associationsXml = ''
  if (items.length > 0) {
    associationsXml = `
    <associations>
      <cart_rows>
        ${items.map(item => `
        <cart_row>
          <id_product>${item.id}</id_product>
          <id_product_attribute>${item.combinationId || 0}</id_product_attribute>
          <id_address_delivery>${addressId}</id_address_delivery>
          <id_customization>0</id_customization>
          <quantity>${item.quantity}</quantity>
        </cart_row>`).join('')}
      </cart_rows>
    </associations>`
  } else {
    // Si le panier est vide, envoyer un <cart_rows> vide pour vider les associations existantes
    associationsXml = `
    <associations>
      <cart_rows></cart_rows>
    </associations>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <cart>
    ${id ? `<id>${id}</id>` : ''}
    <id_currency>${idCurrency}</id_currency>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_lang>${idLang}</id_lang>
    ${associationsXml}
  </cart>
</prestashop>`
}

export const createCart = async (cartData) => {
  const api = resourceApi('carts')
  
  // Créer directement le panier AVEC les articles en un seul appel POST.
  // C'est beaucoup plus simple et souvent plus fiable avec l'API PrestaShop.
  const xml = buildCartXml(cartData)
  const response = await api.create(xml)
  
  const match = response.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i)
  if (!match) throw new Error('Could not get cart ID from response')
  
  const cartId = parseInt(match[1])
  
  return cartId
}

export const updateCart = async (cartId, cartData) => {
  if (!cartId) throw new Error('cartId is required for updateCart')
  const api = resourceApi('carts')
  
  // Reconstruire le XML complet avec les nouvelles données (y compris les items)
  // et envoyer directement en PUT.
  const fullCartData = { ...cartData, id: cartId }
  const updateXml = buildCartXml(fullCartData)
  
  await api.update(cartId, updateXml)
  console.info('[useCheckout] Cart updated', { cartId })
  return true
}

export const deleteCart = async (cartId) => {
  if (!cartId) return false
  try {
    const api = resourceApi('carts')
    await api.remove(cartId)
    console.info(`[useCheckout] Cart ${cartId} deleted`)
    return true
  } catch (error) {
    console.error(`[useCheckout] Error deleting cart ${cartId}`, error)
    return false
  }
}

const buildOrderXml = async (orderData) => {
  const { customerId, paymentModule, addressId, items, cartId, statusId, secureKey } = orderData

  if (!customerId || !addressId || !items || items.length === 0) {
    throw new Error('Missing data for order creation')
  }

  const { totalTaxAmount } = await calculateCartTaxes(items)
  const totalProductsHT = items.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1)), 0)
  const totalPaidTTC = parseFloat((totalProductsHT + totalTaxAmount).toFixed(2)) || 0

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_cart>${cartId}</id_cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customerId}</id_customer>
    <id_carrier>1</id_carrier>
    <current_state>${statusId}</current_state>
    <module>${paymentModule}</module>
    <payment>Paiement à la livraison</payment>
    <total_paid>${totalPaidTTC.toFixed(2)}</total_paid>
    <total_paid_real>${totalPaidTTC.toFixed(2)}</total_paid_real>
    <total_products>${totalProductsHT.toFixed(2)}</total_products>
    <total_products_wt>${totalPaidTTC.toFixed(2)}</total_products_wt>
    <conversion_rate>1.000000</conversion_rate>
    <secure_key>${secureKey}</secure_key>
  </order>
</prestashop>`
}

const escapeXml = (text) => {
  if (typeof text !== 'string') return ''
  return text.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[c])
}

export const createOrder = async (checkoutData) => {
  // 1. Récupérer la secure_key du client
  const customerApi = resourceApi('customers')
  const customerRes = await customerApi.get(checkoutData.customerId)
  
  let secureKey = ''
  const customerObj = customerRes?.customer || customerRes?.customers?.[0] || customerRes?.prestashop?.customer
  if (customerObj) {
      if (typeof customerObj.secure_key === 'string') {
          secureKey = customerObj.secure_key
      } else if (customerObj.secure_key && typeof customerObj.secure_key === 'object') {
          secureKey = Object.values(customerObj.secure_key)[0]
      }
  } else if (customerRes?.__raw) {
      const match = customerRes.__raw.match(/<secure_key>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/secure_key>/)
      if (match) secureKey = match[1]
  }

  if (!secureKey) {
      console.error('[useCheckout] Failed to retrieve secure_key from:', customerRes)
      throw new Error('Could not retrieve customer secure_key')
  }

  // 2. Créer l'entité Order
  const orderXml = await buildOrderXml({ ...checkoutData, secureKey })
  const orderApi = resourceApi('orders')
  const orderResponse = await orderApi.create(orderXml)
  
  const orderIdMatch = orderResponse.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i)
  if (!orderIdMatch) throw new Error('Could not get order ID from response')
  const orderId = parseInt(orderIdMatch[1])

  // 3. Créer les order_details pour chaque produit
  const orderDetailsApi = resourceApi('order_details')
  const { itemsWithTax } = await calculateCartTaxes(checkoutData.items)

  for (const item of itemsWithTax) {
    const detailXml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order_detail>
    <id_order>${orderId}</id_order>
    <product_id>${item.id}</product_id>
    <product_attribute_id>${item.combinationId || 0}</product_attribute_id>
    <product_name>${escapeXml(item.name)}</product_name>
    <product_quantity>${item.quantity}</product_quantity>
    <product_price>${item.price}</product_price>
    <unit_price_tax_incl>${((item.price * (1 + item.taxRate / 100))).toFixed(2)}</unit_price_tax_incl>
    <unit_price_tax_excl>${item.price}</unit_price_tax_excl>
    <total_price_tax_incl>${((item.price * (1 + item.taxRate / 100)) * item.quantity).toFixed(2)}</total_price_tax_incl>
    <total_price_tax_excl>${(item.price * item.quantity).toFixed(2)}</total_price_tax_excl>
  </order_detail>
</prestashop>`
    await orderDetailsApi.create(detailXml)
  }

  return { success: true, orderId }
}

export const validateCheckoutData = async (checkoutData) => {
  const errors = []

  if (!checkoutData.customerId || checkoutData.customerId <= 0) {
    errors.push('ID client invalide')
  }

  if (!checkoutData.addressId || checkoutData.addressId <= 0) {
    errors.push('Adresse de livraison requise')
  }

  if (!checkoutData.items || checkoutData.items.length === 0) {
    errors.push('Panier vide')
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  }
}

// --- Autres fonctions utilitaires ---

export const getCustomerAddresses = async (customerId) => {
  try {
    const api = resourceApi('addresses')
    const response = await api.list({ 'filter[id_customer]': `[${customerId}]`, display: 'full' })
    return extractItems(response, api.resource)
  } catch (error) {
    console.warn('[useCheckout] Could not fetch customer addresses', error)
    return []
  }
}

export const getCartDetails = async (cartId) => {
  try {
    const api = resourceApi('carts')
    const r = await api.get(cartId)
    const cartItems = extractItems(r?.prestashop?.cart?.associations?.cart_rows, 'cart_row')
    
    if (!cartItems || cartItems.length === 0) {
      return { items: [], customerId: r?.prestashop?.cart?.id_customer || 0, addressId: r?.prestashop?.cart?.id_address_delivery || 0 }
    }

    const productIds = cartItems.map(i => i.id_product).filter(Boolean).join('|')
    let products = []
    if (productIds) {
      const pApi = resourceApi('products')
      const pRes = await pApi.list({ display: 'full', 'filter[id]': `[${productIds}]` })
      products = extractItems(pRes, pApi.resource)
    }

    const comboIds = cartItems.map(i => i.id_product_attribute).filter(id => id && id !== '0').join('|')
    let combinations = []
    if (comboIds) {
      const cApi = resourceApi('combinations')
      const cRes = await cApi.list({ display: '[id,price]', 'filter[id]': `[${comboIds}]` }).catch(() => null)
      if (cRes) combinations = extractItems(cRes, cApi.resource)
    }

    const items = cartItems.map(item => {
      const p = products.find(p => String(p.id) === String(item.id_product))
      const priceHT = (p && p.price) ? (parseFloat(String(p.price).replace(',', '.')) || 0) : 0
      
      let comboImpact = 0
      if (item.id_product_attribute && item.id_product_attribute !== '0') {
         const combo = combinations.find(c => String(c.id) === String(item.id_product_attribute))
         if (combo && combo.price) {
            comboImpact = parseFloat(String(combo.price).replace(',', '.')) || 0
         }
      }

      return {
        id: item.id_product,
        combinationId: item.id_product_attribute,
        quantity: parseInt(item.quantity || 1, 10),
        price: priceHT + comboImpact, // Le prix est toujours HT ici
        name: p ? (extractItems(p.name, 'language')[0] || `Produit #${item.id_product}`) : `Produit #${item.id_product}`,
        id_tax_rules_group: p ? p.id_tax_rules_group : 0
      }
    })

    return { 
      items, 
      customerId: r?.prestashop?.cart?.id_customer || 0,
      addressId: r?.prestashop?.cart?.id_address_delivery || 0 
    }
  } catch (e) {
    console.error(`[useCheckout] Erreur chargement panier ${cartId}`, e)
    return { items: [], customerId: 0, addressId: 0 }
  }
}

// Supprime une commande avec cascade (order_details, order_histories)
export const deleteOrder = async (orderId) => {
  if (!orderId) throw new Error('orderId is required')
  
  // 1. Supprimer les lignes de commande (order_details)
  try {
    const detailsApi = resourceApi('order_details')
    const dRes = await detailsApi.list({ 'filter[id_order]': `[${orderId}]`, display: '[id]' })
    const details = extractItems(dRes, detailsApi.resource)
    await Promise.allSettled(details.map(d => detailsApi.remove(d.id)))
  } catch (e) {
    console.warn('[deleteOrder] Could not delete order_details:', e.message)
  }

  // 2. Supprimer l'historique des statuts (order_histories)
  try {
    const histApi = resourceApi('order_histories')
    const hRes = await histApi.list({ 'filter[id_order]': `[${orderId}]`, display: '[id]' })
    const histories = extractItems(hRes, histApi.resource)
    await Promise.allSettled(histories.map(h => histApi.remove(h.id)))
  } catch (e) {
    console.warn('[deleteOrder] Could not delete order_histories:', e.message)
  }

  // 3. Supprimer la commande elle-même
  const orderApi = resourceApi('orders')
  await orderApi.remove(orderId)
  console.info(`[deleteOrder] Order ${orderId} deleted with cascade`)
}