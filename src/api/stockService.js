import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'
export const loadAllProducts = async (limit = 500) => {
  const api = resourceApi('products')
  const response = await api.list({ display: '[id,name,quantity]', limit })
  return extractItems(response, api.resource)
}
export const loadStockReasons = async () => {
  const api = resourceApi('stock_movement_reasons')
  const response = await api.list({ display: '[id,name]', limit: 100 })
  return extractItems(response, api.resource)
}
export const loadWarehouses = async () => {
  const api = resourceApi('warehouses')
  const response = await api.list({ display: '[id,name]', limit: 100 })
  return extractItems(response, api.resource)
}
export const loadStockMovements = async (params = {}) => {
  const api = resourceApi('stock_movements')
  const defaultParams = {
    display: '[id,id_product,physical_quantity,sign,date_add,id_stock_mvt_reason,id_warehouse,reference]',
    sort: '[date_add_DESC]',
    limit: 1000,
  }
  const response = await api.list({ ...defaultParams, ...params })
  return extractItems(response, api.resource)
}
export const createStockMovement = async (data) => {
  const api = resourceApi('stock_movements')
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <stock_mvt>
    <id_employee>1</id_employee>
    <id_stock>${data.stockId}</id_stock>
    <id_stock_mvt_reason>${data.reasonId}</id_stock_mvt_reason>
    <physical_quantity>${data.quantity}</physical_quantity>
    <sign>${data.sign || 1}</sign>
    <price_te>0</price_te>
    <date_add>${data.dateAdd || now}</date_add>
  </stock_mvt>
</prestashop>`.trim()
  return await api.create(xmlPayload)
}
export const enrichStockMovements = (movements, products, reasons, warehouses) => {
  return movements.map(m => ({
    ...m,
    productName: products.find(p => String(p.id) === String(m.id_product))?.name || `Produit ${m.id_product}`,
    reason: reasons.find(r => String(r.id) === String(m.id_stock_mvt_reason))?.name || `Raison ${m.id_stock_mvt_reason}`,
    warehouse: warehouses.find(w => String(w.id) === String(m.id_warehouse))?.name || `Entrepôt ${m.id_warehouse}`,
  }))
}
