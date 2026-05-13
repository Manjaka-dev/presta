/**
 * Factory CRUD générique pour les entités PrestaShop
 * Utilise le httpClient existant (requestRaw, requestXml)
 */
import { requestRaw, requestXml } from '@/api/httpClient'
import { buildEntityXml, getIdFromXml, xmlToJson, extractIdsByTag, parseXml } from '@/utils/xmlUtils'
import { DEFAULT_PAGE_SIZE } from './constants'

export async function fetchAllIds(resource, itemTag, pageSize = DEFAULT_PAGE_SIZE) {
  const ids = []
  let offset = 0

  while (true) {
    const xml = await requestRaw('GET', resource, null, {
      display: '[id]',
      limit: `${offset},${pageSize}`
    }, { Accept: 'application/xml' })
    const doc = parseXml(xml)
    const batch = extractIdsByTag(doc, itemTag)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))

    if (!batch.length) {
      break
    }

    ids.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    offset += pageSize
  }

  return ids
}

export async function getXml(path, query = {}) {
  return requestRaw('GET', path, null, query, { Accept: 'application/xml' })
}

export async function postXml(path, body, query = {}) {
  return requestRaw('POST', path, body, query, {
    'Content-Type': 'text/xml',
    Accept: 'application/xml'
  })
}

export async function putXml(path, body, query = {}) {
  return requestRaw('PUT', path, body, query, {
    'Content-Type': 'text/xml',
    Accept: 'application/xml'
  })
}

export async function deleteXml(path, query = {}, ignore404 = false) {
  try {
    return await requestRaw('DELETE', path, null, query, { Accept: 'application/xml' })
  } catch (error) {
    if (ignore404 && error.status === 404) {
      return ''
    }
    throw error
  }
}

export function createCrud(resource, tag) {
  return {
    listIds() {
      return fetchAllIds(resource, tag)
    },
    async read(id) {
      const xml = await getXml(`${resource}/${id}`)
      return xmlToJson(xml)
    },
    async create(data) {
      const xml = buildEntityXml(tag, data)
      const responseXml = await postXml(resource, xml)
      const newId = getIdFromXml(responseXml, tag)
      if (!newId) {
        throw new Error(`Missing ${tag} id in response`)
      }
      return newId
    },
    async update(id, data) {
      const xml = buildEntityXml(tag, { ...data, id })
      await putXml(`${resource}/${id}`, xml)
    },
    async remove(id) {
      await deleteXml(`${resource}/${id}`, {}, true)
    }
  }
}
