import { DEFAULT_LANG_ID } from './constants'
import { getXml, postXml } from './crud'
import { buildEntityXml, extractIdsByTag, getIdFromXml, langField, parseXml } from '@/utils/xmlUtils'

export async function createProductOptionValue(data, langId = DEFAULT_LANG_ID) {
  const name = data.name?.trim() || ''
  const groupId = data.groupId
  if (!name || !groupId) {
    throw new Error('Missing product option value name or group id')
  }

  const payload = {
    id_attribute_group: groupId,
    name: langField(name, langId)
  }

  const xml = buildEntityXml('product_option_value', payload)
  const responseXml = await postXml('product_option_values', xml)
  const id = getIdFromXml(responseXml, 'product_option_value')
  if (!id) {
    throw new Error('Missing product_option_value id in response')
  }
  return id
}

export async function findProductOptionValueIdByName(name, groupId) {
  if (!name) {
    return null
  }
  const query = {
    display: '[id]',
    'filter[name]': name
  }
  if (groupId) {
    query['filter[id_attribute_group]'] = groupId
  }
  const xml = await getXml('product_option_values', query)
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'product_option_value')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}
