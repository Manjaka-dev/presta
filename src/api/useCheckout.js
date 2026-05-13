import { resourceApi } from '@/api/resources'

/**
 * Construit le XML d'un panier PrestaShop
 * @param {Object} cartData - { customerId, cartItems[] }
 * @returns {string} XML payload
 */
const buildCartXml = (cartData) => {
  const { customerId, addressId = 1, idLang = 1, idCurrency = 1, items } = cartData

  if (!customerId || items.length === 0) {
    throw new Error('Données de panier incomplètes')
  }

  // Construire les lignes du panier
  let associationsXml = ''
  items.forEach((item) => {
    associationsXml += `
    <cart_row>
      <id_product>${item.id}</id_product>
      <id_product_attribute>${item.combinationId || 0}</id_product_attribute>
      <quantity>${item.quantity}</quantity>
    </cart_row>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>${idCurrency}</id_currency>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_lang>${idLang}</id_lang>
    <associations>
      <cart_rows>${associationsXml}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`

  return xml
}

/**
 * Crée un panier dans PrestaShop
 * @param {Object} cartData - { customerId, items[] }
 * @returns {Promise<number>} ID du panier créé
 */
export const createCart = async (cartData) => {
  try {
    const xml = buildCartXml({
      customerId: cartData.customerId,
      addressId: cartData.addressId || 1,
      items: cartData.items,
    })

    console.debug('[useCheckout] Creating cart with XML:', xml)

    const api = resourceApi('carts')
    const response = await api.create(xml)

    let cartId = null
    if (response && typeof response === 'string') {
      const match = response.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i) || response.match(/id["\s:=]+(\d+)/i)
      cartId = match ? parseInt(match[1]) : null
    }

    console.info('[useCheckout] Cart created', { cartId, response })

    if (!cartId) {
      throw new Error('Impossible de récupérer l\'ID du panier créé')
    }

    return cartId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const body = error.body || ''

    console.error('[useCheckout] Error creating cart', { message, body, error })

    let errorMsg = 'Impossible de créer le panier'
    if (body) {
      const xmlMatch = body.match(/<message><!\[CDATA\[(.*?)]]><\/message>/s)
      if (xmlMatch) {
        errorMsg = xmlMatch[1]
      } else {
        try {
          const json = JSON.parse(body)
          if (json.errors && Array.isArray(json.errors)) {
            errorMsg = json.errors[0].message || errorMsg
          }
        } catch (e) {
          // ignore
        }
      }
    }

    throw new Error(errorMsg)
  }
}

/**
 * Récupère le statut d'un panier
 * @param {number} cartId - ID du panier
 * @returns {Promise<Object>} Infos du panier
 */
export const getCartStatus = async (cartId) => {
  try {
    const api = resourceApi('carts')
    const response = await api.get(cartId, { display: '[id,id_customer,id_currency,id_lang]' })

    let cart = null
    if (response && response.prestashop) {
      cart = response.prestashop.cart || response.prestashop.carts
    }

    console.debug('[useCheckout] Cart status:', cart)
    return cart
  } catch (error) {
    console.warn('[useCheckout] Could not fetch cart status', error)
    return null
  }
}

/**
 * Récupère le statut d'une commande
 * @param {number} orderId - ID de la commande
 * @returns {Promise<Object>} Infos de la commande
 */
export const getOrderStatus = async (orderId) => {
  try {
    const api = resourceApi('orders')
    const response = await api.get(orderId, { display: '[id,reference,current_state,total_paid,date_add]' })

    let order = null
    if (response && response.prestashop) {
      order = response.prestashop.order || response.prestashop.orders
    }

    console.debug('[useCheckout] Order status:', order)
    return order
  } catch (error) {
    console.warn('[useCheckout] Could not fetch order status', error)
    return null
  }
}

/**
 * Valide les données nécessaires avant création
 * @param {Object} checkoutData - Données du checkout
 * @returns {Promise<Object>} Résultat de validation { isValid, errors[] }
 */
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
  } else {
    // Vérification des stocks serveur
    try {
        const stockApi = resourceApi('stock_availables')
        const stockResponse = await stockApi.list({
          display: '[id_product,id_product_attribute,quantity]',
          limit: 1000,
        })
        
        let stocks = []
        if (Array.isArray(stockResponse)) {
            stocks = stockResponse
        } else if (stockResponse.stock_availables && Array.isArray(stockResponse.stock_availables)) {
            stocks = stockResponse.stock_availables
        } else if (stockResponse.prestashop?.stock_availables) {
            const stocksData = stockResponse.prestashop.stock_availables.stock_available
            stocks = Array.isArray(stocksData) ? stocksData : stocksData ? [stocksData] : []
        }

        checkoutData.items.forEach((item, idx) => {
          if (!item.id || item.id <= 0) {
             errors.push(`Article ${idx + 1} : ID produit invalide`)
             return
          }
          if (!item.quantity || item.quantity <= 0) {
              errors.push(`Article ${idx + 1} : Quantité invalide`)
              return
          }
          if (!item.price || item.price < 0) {
              errors.push(`Article ${idx + 1} : Prix invalide`)
              return
          }
          
          // Vérification du stock
          const itemCombinationId = item.combinationId ? parseInt(item.combinationId) : 0
          const itemStockEntries = stocks.filter(s => parseInt(s.id_product) === parseInt(item.id))
          
          let availableQty = 0
          
          if (itemStockEntries.length > 0) {
              // Si le produit a des combinaisons
              if (itemCombinationId > 0) {
                 const comboStock = itemStockEntries.find(s => parseInt(s.id_product_attribute) === itemCombinationId)
                 if (comboStock) availableQty = parseInt(comboStock.quantity || 0)
              } else {
                  // Total pour un produit sans combinaison
                  availableQty = itemStockEntries.reduce((sum, s) => sum + parseInt(s.quantity || 0), 0)
              }
          }
          
          if (item.quantity > availableQty) {
              errors.push(`Stock insuffisant pour l'article ${item.name}. (Demandé: ${item.quantity}, Disponible: ${availableQty})`)
          }
        })
    } catch (e) {
       console.error('[useCheckout] Erreur lors de la vérification des stocks', e)
       errors.push("Impossible de vérifier la disponibilité des stocks.")
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Construit le XML d'une commande PrestaShop à partir des articles du panier
 * @param {Object} orderData - { customerId, paymentModule, addressId, items[], cartId }
 * @returns {string} XML payload
 */
const buildOrderXml = (orderData) => {
  const { customerId, paymentModule, addressId, items, cartId } = orderData

  if (!customerId || !addressId || items.length === 0) {
    throw new Error('Données de commande incomplètes')
  }

  // Calculer les totaux
  const totalProducts = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const totalPaid = parseFloat(totalProducts.toFixed(2))
  const totalPaidReal = parseFloat(totalProducts.toFixed(2))
  const totalProductsWt = parseFloat(totalProducts.toFixed(2))

  // Construire les lignes de commande
  let associationsXml = ''
  items.forEach((item) => {
    associationsXml += `
    <order_row>
      <product_id>${item.id}</product_id>
      <product_attribute_id>${item.combinationId || 0}</product_attribute_id>
      <product_quantity_mutilated>0</product_quantity_mutilated>
      <product_quantity>${item.quantity}</product_quantity>
      <product_name>${escapeXml(item.name)}</product_name>
      <product_reference></product_reference>
      <product_ean13></product_ean13>
      <product_isbn></product_isbn>
      <product_upc></product_upc>
      <product_price>${item.price}</product_price>
    </order_row>`
  })

  // Créer le XML de la commande avec TOUS les champs requis
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_address_delivery>${addressId}</id_address_delivery>
    <id_address_invoice>${addressId}</id_address_invoice>
    <id_cart>${cartId || 0}</id_cart>
    <id_carrier>1</id_carrier>
    <id_currency>1</id_currency>
    <id_customer>${customerId}</id_customer>
    <id_lang>1</id_lang>
    <current_state>1</current_state>
    <payment>Paiement à la livraison</payment>
    <module>${escapeXml(paymentModule)}</module>
    <total_paid>${totalPaid}</total_paid>
    <total_paid_real>${totalPaidReal}</total_paid_real>
    <total_products>${totalProducts.toFixed(2)}</total_products>
    <total_products_wt>${totalProductsWt}</total_products_wt>
    <conversion_rate>1</conversion_rate>
    <associations>
      <order_rows>${associationsXml}
      </order_rows>
    </associations>
  </order>
</prestashop>`

  return xml
}

/**
 * Échappe les caractères spéciaux XML
 */
const escapeXml = (text) => {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Crée une commande sur le serveur PrestaShop
 * @param {Object} checkoutData - { customerId, addressId, items[], paymentModule, cartId }
 * @returns {Promise<Object>} Commande créée avec l'ID
 */
export const createOrder = async (checkoutData) => {
  try {
    const xml = buildOrderXml({
      customerId: checkoutData.customerId,
      addressId: checkoutData.addressId || 1, // Utiliser adresse par défaut si non fournie
      paymentModule: checkoutData.paymentModule || 'bank-transfer',
      items: checkoutData.items,
      cartId: checkoutData.cartId || 0, // Utiliser le panier par défaut si non fourni
    })

    console.debug('[useCheckout] Creating order with XML:', xml)

    const api = resourceApi('orders')
    const response = await api.create(xml)

    // Analyser la réponse pour obtenir l'ID de la commande
    // La réponse peut être du texte brut contenant l'ID
    let orderId = null
    if (response && typeof response === 'string') {
      // Essayer d'extraire l'ID du texte de réponse
      const match = response.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i) || response.match(/id["\s:=]+(\d+)/i)
      orderId = match ? parseInt(match[1]) : null
    }

    console.info('[useCheckout] Order created', { orderId, response })

    return {
      success: true,
      orderId: orderId,
      message: 'Commande créée avec succès',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const body = error.body || ''

    console.error('[useCheckout] Error creating order', {
      message,
      body,
      error,
    })

    // Extraire le message d'erreur du XML/JSON si présent
    let errorMsg = 'Impossible de créer la commande'
    if (body) {
      const xmlMatch = body.match(/<message><!\[CDATA\[(.*?)]]><\/message>/s)
      if (xmlMatch) {
        errorMsg = xmlMatch[1]
      } else {
        try {
          const json = JSON.parse(body)
          if (json.errors && Array.isArray(json.errors)) {
            errorMsg = json.errors[0].message || errorMsg
          }
        } catch (e) {
          // ignore
        }
      }
    }

    throw new Error(errorMsg)
  }
}

/**
 * Récupère les adresses du client (optionnel pour le workflow simplifié)
 */
export const getCustomerAddresses = async (customerId) => {
  try {
    const api = resourceApi('addresses')
    const response = await api.list({
      'filter[id_customer]': `${customerId}`,
      display: '[id,firstname,lastname,address1,city,postcode]',
      limit: 100,
    })

    // Extraire les adresses
    let addresses = []
    if (response && response.prestashop) {
      const data = response.prestashop.addresses
      if (Array.isArray(data)) {
        addresses = data
      } else if (data && typeof data === 'object') {
        addresses = [data]
      }
    }

    console.debug('[useCheckout] Customer addresses:', addresses)
    return addresses
  } catch (error) {
    console.warn('[useCheckout] Could not fetch customer addresses', error)
    return []
  }
}
