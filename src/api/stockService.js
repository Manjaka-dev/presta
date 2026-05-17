import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'
import { getXml, putXml } from './import/crud.js'

// Charge tous les produits
export const loadAllProducts = async (limit = 500) => {
  const api = resourceApi('products')
  const response = await api.list({ display: '[id,name,reference]', limit })
  return extractItems(response, api.resource)
}

// Charge les raisons de mouvement (display=full pour avoir les noms)
export const loadStockReasons = async () => {
  const api = resourceApi('stock_movement_reasons')
  const response = await api.list({ display: 'full', limit: 100 })
  return extractItems(response, api.resource)
}

// Charge les déclinaisons d'un produit
export const loadProductCombinations = async (productId) => {
  if (!productId) return []
  const api = resourceApi('combinations')
  const response = await api.list({
    'filter[id_product]': String(productId),
    display: 'full',
    limit: 500,
  })
  return extractItems(response, api.resource)
}

/**
 * Charge le stock_available pour un produit et une déclinaison donnée.
 * @param {string} productId - ID du produit
 * @param {string|number} productAttributeId - ID de la déclinaison (0 pour le produit de base)
 */
export const loadStockAvailable = async (productId, productAttributeId = 0) => {
  const api = resourceApi('stock_availables')
  // Attention: prestashop nécessite que la valeur du filtre pour l'attribut corresponde exactement
  const response = await api.list({
    'filter[id_product]': String(productId),
    'filter[id_product_attribute]': String(productAttributeId),
    display: 'full',
    limit: 1,
  })
  const items = extractItems(response, api.resource)
  return items[0] || null
}

/**
 * Charge les mouvements de stock.
 * IMPORTANT : PrestaShop retourne la clé "stock_mvts" (et non "stock_movements") !
 */
export const loadStockMovements = async (params = {}) => {
  const api = resourceApi('stock_movements')
  const defaultParams = {
    display: 'full',
    sort: '[id_DESC]',
    limit: 200,
  }
  const response = await api.list({ ...defaultParams, ...params })

  if (response && response.stock_mvts) {
    return Array.isArray(response.stock_mvts) ? response.stock_mvts : [response.stock_mvts]
  }
  return extractItems(response, api.resource)
}

export const updateStockMovementDate = async (movementId, date) => {
    // Comme pour les commandes, on doit récupérer le XML complet et le patcher
    const currentXml = await getXml(`stock_movements/${movementId}`)
    
    // Remplacer la balise <date_add> dans le XML brut
    let newXml = currentXml
    newXml = newXml.replace(/<date_add>.*?<\/date_add>/, `<date_add><![CDATA[${date}]]></date_add>`)
    
    return putXml(`stock_movements/${movementId}`, newXml)
}

/**
 * Crée un mouvement de stock (ajout ou retrait).
 * C'est la méthode correcte pour une gestion de stock traçable.
 * @param {{productId: string, productAttributeId: string|number, quantity: number, reasonId: string, employeeId: number, dateAdd: string}} data
 */
export const createStockMovement = async ({ productId, productAttributeId = 0, quantity, reasonId, employeeId = 1, dateAdd = null }) => {
  if (!productId || !reasonId || quantity === 0) {
    throw new Error('Informations manquantes pour créer le mouvement de stock.')
  }

  // 1. Récupérer l'id_stock correspondant au produit/déclinaison
  // On passe en priorité par l'API stock_availables qui est plus fiable et bien mappée
  const stockAvail = await loadStockAvailable(productId, productAttributeId)

  let stockId;
  if (stockAvail && stockAvail.id) {
      stockId = stockAvail.id
  } else {
      // Fallback API stocks
      const stockApi = resourceApi('stocks')
      const stockResponse = await stockApi.list({
        'filter[id_product]': String(productId),
        display: '[id,id_product_attribute]',
        limit: 100,
      })
      const stocks = extractItems(stockResponse, stockApi.resource)
      // find exact match
      const exactStock = stocks.find(s => String(s.id_product_attribute) === String(productAttributeId))
      
      if (exactStock) {
        stockId = exactStock.id
      } else if (stocks.length > 0 && String(productAttributeId) === '0') {
         // si productAttributeId=0, on prend le premier
         stockId = stocks[0].id
      } else {
         throw new Error(`Aucun stock physique trouvé pour ce produit/déclinaison.`)
      }
  }


  // 2. Préparer le payload XML pour la création du mouvement
  const sign = quantity > 0 ? 1 : -1
  const physicalQuantity = Math.abs(quantity)
  const now = dateAdd || new Date().toISOString().slice(0, 19).replace('T', ' ')

  const mvtApi = resourceApi('stock_movements')
  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <stock_mvt>
    <id_stock>${stockId}</id_stock>
    <id_stock_mvt_reason>${reasonId}</id_stock_mvt_reason>
    <id_employee>${employeeId}</id_employee>
    <physical_quantity>${physicalQuantity}</physical_quantity>
    <sign>${sign}</sign>
    <price_te>0</price_te>
    <date_add>${now}</date_add>
  </stock_mvt>
</prestashop>`.trim()

  // 3. Envoyer la requête de création
  const response = await mvtApi.create(xmlPayload)
  
  // Patch pour forcer la date de création si dateAdd est fourni
  if (dateAdd) {
      const match = response.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i)
      if (match) {
          const mvtId = parseInt(match[1])
          try {
              await updateStockMovementDate(mvtId, dateAdd)
          } catch(e) {
              console.warn(`[stockService] Impossible de forcer la date du mouvement de stock ${mvtId}`, e)
          }
      }
  }

  // 4. Retourner le nouveau stock pour confirmation (optionnel mais utile)
  const stockAvailableAfter = await loadStockAvailable(productId, productAttributeId)
  return { newQty: stockAvailableAfter ? parseInt(stockAvailableAfter.quantity) : 'N/A' }
}


/**
 * Construit un map { id_stock_available → stock_available_item }
 * Permet de relier id_stock (dans stock_mvts) → id_product
 */
export const loadStockAvailablesMap = async () => {
  const api = resourceApi('stock_availables')
  const response = await api.list({
    display: '[id,id_product,id_product_attribute]',
    limit: 2000, // Augmenter la limite pour couvrir plus de produits
  })
  const items = extractItems(response, api.resource)
  const map = {}
  for (const item of items) {
    map[String(item.id)] = item
  }
  return map
}

/**
 * Enrichit les mouvements avec des noms lisibles.
 */
export const enrichStockMovements = (movements, products, reasons, stockAvailablesMap = {}, combinations = []) => {
  const combinationNameMap = new Map(combinations.map(c => [String(c.id), getCombinationName(c.associations?.product_option_values)]))

  return movements.map(m => {
    const stockAvailable = stockAvailablesMap[String(m.id_stock)]
    const productId = (m.id_product && m.id_product !== '0')
      ? m.id_product
      : stockAvailable?.id_product

    const product = productId ? products.find(p => String(p.id) === String(productId)) : null
    let productName = product ? getCleanName(product.name) : (productId ? `Produit ${productId}` : 'Produit inconnu')

    // Ajouter le nom de la déclinaison si disponible
    if (stockAvailable && stockAvailable.id_product_attribute && stockAvailable.id_product_attribute !== '0') {
      const comboName = combinationNameMap.get(stockAvailable.id_product_attribute)
      if (comboName) {
        productName += ` - ${comboName}`
      }
    }

    const reasonObj = reasons.find(r => String(r.id) === String(m.id_stock_mvt_reason))
    const reasonName = reasonObj ? getCleanName(reasonObj.name) : `Raison ${m.id_stock_mvt_reason}`

    return {
      ...m,
      id_product: productId || m.id_product,
      productName,
      reason: reasonName,
    }
  })
}

// Helpers internes
function getCleanName(name) {
  if (typeof name === 'object' && name !== null) {
    return Object.values(name)[0] || ''
  }
  return String(name || '')
}

function getCombinationName(values) {
    if (!values || !Array.isArray(values)) return ''
    return values.map(v => v.value || v.id).join(', ')
}