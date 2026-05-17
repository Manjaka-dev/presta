import { resourceApi } from '@/api/resources'
import { extractItems, extractSingleItem } from '@/utils/resourceData.js'
import { createStockMovement } from './stockService.js'

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

/**
 * Helper pour trouver le bon taux de taxe pour un item donné.
 * @param {object} item - L'objet item (doit contenir id_tax_rules_group).
 * @param {array} taxRules - La liste des règles de taxes (depuis l'API).
 * @param {array} taxes - La liste des taxes (depuis l'API).
 * @returns {{rate: number, name: string}} L'information sur la taxe.
 */
function getTaxInfoForItem(item, taxRules, taxes) {
  const groupId = item.id_tax_rules_group;
  if (!groupId || groupId === '0' || !taxRules || !taxes) {
    return { rate: 0, name: 'No Tax' };
  }

  // Trouver la règle qui s'applique à ce groupe de taxe
  const taxRule = taxRules.find(tr => String(tr.id_tax_rules_group) === String(groupId));
  if (!taxRule) {
    return { rate: 0, name: 'No Rule' };
  }

  // Utiliser l'ID de la taxe de cette règle pour trouver le taux
  const tax = taxes.find(t => String(t.id) === String(taxRule.id_tax));
  if (tax) {
    return { rate: parseFloat(tax.rate || 0), name: tax.name || 'Tax' };
  }

  return { rate: 0, name: 'Tax not found' };
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
  const { customerId, paymentModule, addressId, cartId, statusId, secureKey } = orderData

  if (!customerId || !addressId || !cartId) {
    throw new Error('Missing data for order creation')
  }

  // 1. Récupérer les détails complets du panier depuis PrestaShop
  const cartDetails = await getCartDetails(cartId)
  if (!cartDetails.items || cartDetails.items.length === 0) {
    throw new Error('Le panier est vide ou introuvable sur le serveur')
  }

  // 2. Calcul des taxes et totaux
  const { totalTaxAmount, itemsWithTax } = await calculateCartTaxes(cartDetails.items)
  const totalProductsHT = itemsWithTax.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1)), 0)
  const totalPaidTTC = totalProductsHT + totalTaxAmount

  const formatPrice = (val) => parseFloat(val || 0).toFixed(6)

  // 3. Construction des lignes de produits intégrées à la commande
  const orderRowsXml = itemsWithTax.map(item => {
    const priceHT = parseFloat(item.price) || 0
    const taxRate = parseFloat(item.taxRate) || 0
    const priceTTC = priceHT * (1 + taxRate / 100)
    const quantity = parseInt(item.quantity) || 1

    return `
        <order_row>
          <product_id>${item.id}</product_id>
          <product_attribute_id>${item.combinationId || 0}</product_attribute_id>
          <product_quantity>${quantity}</product_quantity>
          <product_name>${escapeXml(item.name)}</product_name>
          <product_price>${formatPrice(priceHT)}</product_price>
          <unit_price_tax_incl>${formatPrice(priceTTC)}</unit_price_tax_incl>
          <unit_price_tax_excl>${formatPrice(priceHT)}</unit_price_tax_excl>
        </order_row>`
  }).join('')

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // 4. XML complet requis pour que PrestaShop calcule la facture
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
    
    <total_discounts>0.000000</total_discounts>
    <total_discounts_tax_incl>0.000000</total_discounts_tax_incl>
    <total_discounts_tax_excl>0.000000</total_discounts_tax_excl>
    
    <total_paid>${formatPrice(totalPaidTTC)}</total_paid>
    <total_paid_tax_incl>${formatPrice(totalPaidTTC)}</total_paid_tax_incl>
    <total_paid_tax_excl>${formatPrice(totalProductsHT)}</total_paid_tax_excl>
    <total_paid_real>${formatPrice(totalPaidTTC)}</total_paid_real>
    
    <total_products>${formatPrice(totalProductsHT)}</total_products>
    <total_products_wt>${formatPrice(totalPaidTTC)}</total_products_wt>
    
    <total_shipping>0.000000</total_shipping>
    <total_shipping_tax_incl>0.000000</total_shipping_tax_incl>
    <total_shipping_tax_excl>0.000000</total_shipping_tax_excl>
    
    <conversion_rate>1.000000</conversion_rate>
    <secure_key>${secureKey}</secure_key>
    
    <date_add>${now}</date_add>
    <date_upd>${now}</date_upd>
    
    <associations>
      <order_rows>
        ${orderRowsXml}
      </order_rows>
    </associations>
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
  
  let customerRes;
  try {
      customerRes = await customerApi.get(checkoutData.customerId)
  } catch(e) {
      console.warn('[useCheckout] Client non trouvé ou erreur lors de la récupération.', e)
      // Si le client n'existe pas, on lève une erreur plus explicite
      throw new Error(`Le client avec l'ID ${checkoutData.customerId} n'existe pas. Veuillez vous reconnecter.`)
  }

  let secureKey = ''
  const customerObj = customerRes?.customer || customerRes?.customers?.[0] || customerRes?.prestashop?.customer
  if (customerObj) {
    if (typeof customerObj.secure_key === 'string') {
      secureKey = customerObj.secure_key
    } else if (customerObj.secure_key && typeof customerObj.secure_key === 'object') {
      secureKey = Object.values(customerObj.secure_key)[0]
    }
  } else if (customerRes?.__raw) {
    const match = customerRes.__raw.match(/<secure_key>(?:<!\[CDATA\[)?(.*?)(?:\\]>)?<\/secure_key>/)
    if (match) secureKey = match[1]
  }

  // PrestaShop peut parfois accepter la création d'une commande sans secure_key
  // Si le secureKey n'est pas trouvé, on met une valeur factice pour essayer de débloquer la création.
  if (!secureKey) {
    console.warn('[useCheckout] Failed to retrieve secure_key from:', customerRes, 'Using dummy value.')
    secureKey = 'dummy_secure_key_12345'
  }

  // 2. Créer l'entité Order directement avec les lignes (associations) et le statut de paiement direct.
  const orderXml = await buildOrderXml({ ...checkoutData, secureKey })
  const orderApi = resourceApi('orders')
  const orderResponse = await orderApi.create(orderXml)

  const orderIdMatch = orderResponse.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i)
  if (!orderIdMatch) throw new Error('Could not get order ID from response')

  const orderId = parseInt(orderIdMatch[1])
  
  // Dans PrestaShop la date n'est pas toujours forçable lors de la création d'une commande.
  // Ce code est pour les commandes passées manuellement sur le site (front-office).
  // on utilise la date courante. 
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  
  // 3. Décrémenter le stock manuellement et générer l'historique
  if (checkoutData.items && checkoutData.items.length > 0) {
      for (const item of checkoutData.items) {
          try {
              await createStockMovement({
                  productId: item.id || item.productId,
                  productAttributeId: item.combinationId || 0,
                  quantity: -item.quantity, // Quantité négative pour retirer du stock
                  reasonId: 3, // 3 = Customer Order
                  employeeId: 1,
                  dateAdd: now
              })
          } catch(e) {
              console.warn(`[useCheckout] Impossible de décrémenter le stock pour la commande ${orderId}`, e)
          }
      }
  }

  // 4. Ajouter l'historique d'état cible
  if (checkoutData.statusId) {
      const histApi = resourceApi('order_histories')
      try {
          const xmlHistFinal = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <order_history>
    <id_order>${orderId}</id_order>
    <id_order_state>${checkoutData.statusId}</id_order_state>
    <date_add>${now}</date_add>
  </order_history>
</prestashop>`
          await histApi.create(xmlHistFinal)
      } catch (e) {
          console.warn("Erreur lors de la création de l'historique de commande:", e)
      }
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
    const api = resourceApi('carts');

    // CORRECTION : Ajout de { display: 'full' } pour forcer l'API à renvoyer les associations.
    const r = await api.get(cartId, { display: 'full' });

    const cartData = extractSingleItem(r, api.resource);
    const cartItems = cartData?.associations?.cart_rows || [];

    if (!cartItems || cartItems.length === 0) {
      return { items: [], customerId: cartData?.id_customer || 0, addressId: cartData?.id_address_delivery || 0 };
    }

    const productIds = cartItems.map(i => i.id_product).filter(Boolean).join('|');
    let products = [];
    if (productIds) {
      const pApi = resourceApi('products');
      const pRes = await pApi.list({ display: 'full', 'filter[id]': `[${productIds}]` });
      products = extractItems(pRes, pApi.resource);
    }

    const comboIds = cartItems.map(i => i.id_product_attribute).filter(id => id && id !== '0').join('|');
    let combinations = [];
    if (comboIds) {
      const cApi = resourceApi('combinations');
      // FIXED missing bracket below
      const cRes = await cApi.list({ display: '[id,price]', 'filter[id]': `[${comboIds}]` }).catch(() => null);
      if (cRes) combinations = extractItems(cRes, cApi.resource);
    }

    const items = cartItems.map(item => {
      const p = products.find(p => String(p.id) === String(item.id_product));
      const priceHT = (p && p.price) ? (parseFloat(String(p.price).replace(',', '.')) || 0) : 0;

      let comboImpact = 0;
      if (item.id_product_attribute && item.id_product_attribute !== '0') {
         const combo = combinations.find(c => String(c.id) === String(item.id_product_attribute));
         if (combo && combo.price) {
            comboImpact = parseFloat(String(combo.price).replace(',', '.')) || 0;
         }
      }

      return {
        id: item.id_product,
        combinationId: item.id_product_attribute,
        quantity: parseInt(item.quantity || 1, 10),
        price: priceHT + comboImpact, // Le prix HT final (base + impact)
        name: p ? (extractItems(p.name, 'language')[0] || `Produit #${item.id_product}`) : `Produit #${item.id_product}`,
        id_tax_rules_group: p ? p.id_tax_rules_group : 0
      };
    });
    return {
      items,
      customerId: cartData?.id_customer || 0,
      addressId: cartData?.id_address_delivery || 0
    };
  } catch (e) {
    console.error(`[useCheckout] Erreur chargement panier ${cartId}`, e);
    return { items: [], customerId: 0, addressId: 0 };
  }
}

// Supprime une commande avec cascade (order_details, order_histories)
export const deleteOrder = async (orderId) => {
  if (!orderId) throw new Error('orderId is required')

  // 1. Supprimer les lignes de commande (order_details)
  try {
    const detailsApi = resourceApi('order_details')
    // FIXED missing bracket below
    const details = extractItems(dRes, detailsApi.resource)
    await Promise.allSettled(details.map(d => detailsApi.remove(d.id)))
  } catch (e) {
    console.warn('[deleteOrder] Could not delete order_details:', e.message)
  }

  // 2. Supprimer l'historique des statuts (order_histories)
  try {
    const histApi = resourceApi('order_histories')
    // FIXED missing bracket below
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

/**
 * Calcule le montant total TTC d'un panier en utilisant les vraies données
 * de produits, déclinaisons et taxes.
 * @param {string|number} cartId - L'ID du panier à calculer.
 * @returns {Promise<number>} Le montant total TTC du panier.
 */
export async function calculateCartTotal(cartId) {
  if (!cartId) return 0;

  try {
    // 1. Récupérer les détails complets du panier (produits, prix HT, impact déclinaison)
    // La fonction getCartDetails fait déjà 90% du travail pour nous.
    const { items } = await getCartDetails(cartId);

    if (!items || items.length === 0) {
      return 0; // Panier vide
    }

    // 2. Charger les taxes et les règles de taxes (avec mise en cache)
    // On ne fait ces appels API qu'une seule fois.
    if (!cachedTaxes) {
      const taxesApi = resourceApi('taxes');
      // FIXED missing bracket below
      const tRes = await taxesApi.list({ display: '[id,rate,name]' });
      cachedTaxes = extractItems(tRes, taxesApi.resource);
    }

    if (!cachedTaxRules) {
      const rulesApi = resourceApi('tax_rules');
      const rRes = await rulesApi.list({ display: '[id_tax_rules_group,id_tax]' });
      cachedTaxRules = extractItems(rRes, rulesApi.resource);
    }

    // 3. Calculer le total ligne par ligne
    let totalTTC = 0;
    for (const item of items) {
      // Le prix HT (produit de base + impact déclinaison) est déjà calculé par getCartDetails
      const priceHT = parseFloat(item.price);
      const quantity = parseInt(item.quantity, 10);

      // Trouver le taux de taxe pour cet item
      const taxInfo = getTaxInfoForItem(item, cachedTaxRules, cachedTaxes);
      const taxRate = parseFloat(taxInfo.rate) / 100; // ex: 20 -> 0.20

      // Calculer le prix TTC pour cette ligne
      const lineTotalTTC = (priceHT * (1 + taxRate)) * quantity;

      totalTTC += lineTotalTTC;
    }

    return parseFloat(totalTTC.toFixed(2)); // Retourner une valeur propre avec 2 décimales

  } catch (error) {
    console.error(`[calculateCartTotal] Erreur lors du calcul réel du panier ${cartId}:`, error);
    return 0; // En cas d'erreur, retourner 0 pour ne pas bloquer l'interface
  }
}