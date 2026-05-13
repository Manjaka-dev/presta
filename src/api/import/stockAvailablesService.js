import { getXml, postXml, putXml } from './crud'
import { buildEntityXml, extractIdsByTag, getIdFromXml, parseXml } from '@/utils/xmlUtils'
import { toInt } from '@/utils/stringUtils'

function getText(node, selector, fallback = '') {
  const el = node.querySelector(selector)
  return el && el.textContent ? el.textContent.trim() : fallback
}

export async function findStockIdByProductId(productId) {
  const xml = await getXml('stock_availables', {
    display: '[id]',
    'filter[id_product]': productId,
    'filter[id_product_attribute]': 0
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'stock_available')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}

export async function findStockIdByProductAndAttribute(productId, productAttributeId) {
  const xml = await getXml('stock_availables', {
    display: '[id]',
    'filter[id_product]': productId,
    'filter[id_product_attribute]': productAttributeId
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'stock_available')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}

async function updateStockAvailable(id, data) {
  const xml = buildEntityXml('stock_available', { ...data, id })
  await putXml(`stock_availables/${id}`, xml)
}

async function setStockQuantityById(id, quantity) {
  const xml = await getXml(`stock_availables/${id}`)
  const doc = parseXml(xml)
  const node = doc.querySelector('stock_available')
  if (!node) {
    throw new Error('stock_available not found')
  }
  const payload = {
    id,
    id_product: toInt(getText(node, 'id_product'), 0),
    id_product_attribute: toInt(getText(node, 'id_product_attribute'), 0),
    id_shop: toInt(getText(node, 'id_shop'), 0),
    id_shop_group: toInt(getText(node, 'id_shop_group'), 0),
    quantity,
    depends_on_stock: toInt(getText(node, 'depends_on_stock'), 0),
    out_of_stock: toInt(getText(node, 'out_of_stock'), 0)
  }
  await updateStockAvailable(id, payload)
}

export async function setQuantityForProduct(productId, quantity) {
  const stockId = await findStockIdByProductId(productId)
  if (!stockId) {
    console.warn('[stockService] No stock_available found for product', productId)
    return
  }
  await setStockQuantityById(stockId, quantity)
}

export async function setQuantityForProductAttribute(productId, productAttributeId, quantity) {
  const stockId = await findStockIdByProductAndAttribute(productId, productAttributeId)
  if (!stockId) {
    console.warn('[stockService] No stock_available found for combination', productId, productAttributeId)
    return
  }
  await setStockQuantityById(stockId, quantity)
}
