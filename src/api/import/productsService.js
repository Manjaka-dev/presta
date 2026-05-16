import { DEFAULT_CATEGORY_ID, DEFAULT_LANG_ID } from './constants'
import { createCrud, getXml, postXml, putXml } from './crud'
import { buildEntityXml, extractIdsByTag, getIdFromXml, getText, langField, parseXml } from '@/utils/xmlUtils'
import { slugify } from '@/utils/stringUtils'
import { resourceApi } from '@/api/resources'

export function listProductIds() {
  const crud = createCrud('products', 'product')
  return crud.listIds()
}

export async function createProduct(data, langId = DEFAULT_LANG_ID) {
  const payload = buildProductPayload(data, langId)
  const xml = buildEntityXml('product', payload)
  const responseXml = await postXml('products', xml)
  const id = getIdFromXml(responseXml, 'product')
  if (!id) {
    throw new Error('Missing product id in response')
  }
  return id
}

export async function findProductIdByReference(reference) {
  if (!reference) {
    return null
  }
  const xml = await getXml('products', {
    display: '[id]',
    'filter[reference]': `[${reference}]`
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'product')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}

export async function findProductInfoByReference(reference) {
  if (!reference) {
    return null
  }
  const xml = await getXml('products', {
    display: '[id,reference,price,name,id_tax_rules_group]',
    'filter[reference]': `[${reference}]`
  })
  const doc = parseXml(xml)
  const node = doc.querySelector('product')
  if (!node) {
    return null
  }
  const id = Number.parseInt(node.getAttribute('id') || getText(node, 'id'), 10)
  if (!Number.isFinite(id)) {
    return null
  }
  const name = getText(node, 'name')
  const price = Number.parseFloat(getText(node, 'price') || '0')
  const idTaxRulesGroup = Number.parseInt(getText(node, 'id_tax_rules_group') || '0', 10)
  return {
    id,
    name,
    price: Number.isFinite(price) ? price : 0,
    id_tax_rules_group: idTaxRulesGroup
  }
}

export async function updateProduct(id, data, langId = DEFAULT_LANG_ID) {
  const payload = buildProductPayload({ ...data, id }, langId)
  const xml = buildEntityXml('product', payload)
  await putXml(`products/${id}`, xml)
}

export async function patchProductAvailableDate(id, availableDate) {
  if (!id || !availableDate) return;
  const api = resourceApi('products')
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <product>
    <id>${id}</id>
    <available_date><![CDATA[${availableDate}]]></available_date>
  </product>
</prestashop>`
  await api.patch(id, xmlBody)
}

function buildProductPayload(data, langId) {
  const name = data.name?.trim() || ''
  const linkRewrite = data.linkRewrite?.trim() || slugify(name)
  const description = data.description ?? ''
  const descriptionShort = data.descriptionShort ?? ''
  const reference = data.reference ?? ''
  const price = Number.isFinite(Number(data.price)) ? Number(data.price).toFixed(2) : '0.00'
  const wholesalePrice = Number.isFinite(Number(data.wholesalePrice))
    ? Number(data.wholesalePrice).toFixed(2)
    : undefined
  const availableDate = data.availableDate ? data.availableDate : undefined
  const active = data.active === false ? 0 : 1
  const categoryId = data.categoryId ?? DEFAULT_CATEGORY_ID
  const minimalQuantity = data.minimalQuantity ?? 1
  const taxRulesGroupId = data.taxRulesGroupId ?? 0

  // Associer à la catégorie d'Accueil (2) par défaut et à la nouvelle catégorie créée
  const categoryAssociations = [
    { id: 2 }
  ]
  if (categoryId !== 2) {
    categoryAssociations.push({ id: categoryId })
  }

  return {
    id: data.id,
    active,
    state: 1, // Très important pour que le produit soit visible dans le BackOffice PrestaShop 1.7+
    indexed: 1,
    id_shop_default: 1,
    price,
    id_category_default: categoryId,
    visibility: 'both',
    name: langField(name, langId),
    link_rewrite: langField(linkRewrite, langId),
    description: langField(description, langId),
    description_short: langField(descriptionShort, langId),
    reference,
    wholesale_price: wholesalePrice,
    available_date: availableDate,
    minimal_quantity: minimalQuantity,
    show_price: 1,
    available_for_order: 1,
    id_tax_rules_group: taxRulesGroupId,
    associations: {
      categories: {
        category: categoryAssociations
      }
    }
  }
}
