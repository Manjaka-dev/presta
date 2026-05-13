import { DEFAULT_LANG_ID } from './constants'
import { getXml, postXml } from './crud'
import { buildEntityXml, extractIdsByTag, getIdFromXml, langField, parseXml } from '@/utils/xmlUtils'

export async function createProductOption(data, langId = DEFAULT_LANG_ID) {
  const name = data.name?.trim() || ''
  if (!name) {
    throw new Error('Missing product option name')
  }
  const groupType = data.groupType || 'select'

  const payload = {
    name: langField(name, langId),
    public_name: langField(name, langId),
    group_type: groupType
  }

  const xml = buildEntityXml('product_option', payload)
  const responseXml = await postXml('product_options', xml)
  const id = getIdFromXml(responseXml, 'product_option')
  if (!id) {
    throw new Error('Missing product_option id in response')
  }
  return id
}

export async function findProductOptionIdByName(name) {
  if (!name) {
    return null
  }
  const xml = await getXml('product_options', {
    display: '[id]',
    'filter[name]': name
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'product_option')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}
