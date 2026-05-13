import { createCrud, getXml, postXml } from './crud'
import { buildEntityXml, extractIdsByTag, getIdFromXml, getText, parseXml } from '@/utils/xmlUtils'
import { toFloat, toInt } from '@/utils/stringUtils'

const crud = createCrud('combinations', 'combination')

export const listCombinationIds = crud.listIds
export const readCombination = crud.read

export async function createCombinationForProduct(data) {
  const payload = {
    id_product: data.productId,
    reference: data.reference || '',
    price: data.priceImpact || '0.00',
    minimal_quantity: data.minimalQuantity ?? 1,
    associations: {
      product_option_values: {
        product_option_value: (data.valueIds || []).map((valueId) => ({ id: valueId }))
      }
    }
  }

  const xml = buildEntityXml('combination', payload)
  const responseXml = await postXml('combinations', xml)
  const id = getIdFromXml(responseXml, 'combination')
  if (!id) {
    throw new Error('Missing combination id in response')
  }
  return id
}

export async function listCombinationsByProduct(productId) {
  const xml = await getXml('combinations', {
    display: 'full',
    'filter[id_product]': productId
  })
  const doc = parseXml(xml)
  const nodes = Array.from(doc.querySelectorAll('combination'))
  return nodes
    .map((node) => {
      const id = toInt(node.getAttribute('id') || getText(node, 'id'), 0)
      if (!id) {
        return null
      }
      const optionNodes = node.querySelectorAll('associations > product_option_values > product_option_value')
      const optionValueIds = Array.from(optionNodes)
        .map((optionNode) => toInt(optionNode.getAttribute('id') || getText(optionNode, 'id'), 0))
        .filter((value) => value)
      const priceImpact = toFloat(getText(node, 'price') || '0', 0)
      return {
        id,
        optionValueIds,
        priceImpact
      }
    })
    .filter(Boolean)
}

export async function findCombinationByProductAndValueId(productId, valueId) {
  if (!productId || !valueId) {
    return null
  }
  const combinations = await listCombinationsByProduct(productId)
  return combinations.find((combination) => combination.optionValueIds.includes(valueId)) || null
}
