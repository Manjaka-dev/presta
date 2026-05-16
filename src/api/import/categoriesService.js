import { DEFAULT_CATEGORY_ID, DEFAULT_LANG_ID } from './constants'
import { getXml, postXml, putXml } from './crud'
import { buildEntityXml, extractIdsByTag, getIdFromXml, langField, parseXml } from '@/utils/xmlUtils'
import { slugify } from '@/utils/stringUtils'

export async function createCategory(data, langId = DEFAULT_LANG_ID) {
  const payload = buildCategoryPayload(data, langId)
  const xml = buildEntityXml('category', payload)
  const responseXml = await postXml('categories', xml)
  const id = getIdFromXml(responseXml, 'category')
  if (!id) {
    throw new Error('Missing category id in response')
  }
  return id
}

export async function findCategoryIdByName(name) {
  if (!name) {
    return null
  }
  const xml = await getXml('categories', {
    display: '[id]',
    'filter[name]': `[${name}]`
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'category')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}

function buildCategoryPayload(data, langId) {
  const name = data.name?.trim() || ''
  const linkRewrite = data.linkRewrite?.trim() || slugify(name)
  const description = data.description ?? ''
  const active = data.active === false ? 0 : 1
  const parentId = data.parentId ?? DEFAULT_CATEGORY_ID

  const payload = {
    id: data.id,
    id_parent: parentId,
    active,
    name: langField(name, langId),
    link_rewrite: langField(linkRewrite, langId),
  }
  
  if (description) {
    payload.description = langField(description, langId)
  }
  
  return payload
}
