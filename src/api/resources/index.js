import { getResource } from '@/config/resources.js'
import { requestJson, requestRaw, requestXml } from '../httpClient'

const ensureMethod = (resource, method) => {
  if (!resource.methods.includes(method)) {
    throw new Error(`Method ${method.toUpperCase()} is not allowed for ${resource.key}`)
  }
}

const logApiError = (action, resourceKey, endpoint, error) => {
  const message = error instanceof Error ? error.message : String(error)
  const xmlMessage = message.match(/<message><!\[CDATA\[(.*?)]]><\/message>/s)?.[1] || message

  console.error(`[API ${action}]`, {
    resourceKey,
    endpoint,
    message: xmlMessage,
    rawError: message,
  })
}

export const resourceApi = (resourceKey) => {
  const resource = getResource(resourceKey)

  if (!resource) {
    throw new Error(`Unknown resource: ${resourceKey}`)
  }

  const endpoint = resource.endpoint

  return {
    resource,
    list: async (params = {}) => {
      ensureMethod(resource, 'get')
      return requestJson('GET', endpoint, null, params)
    },
    get: async (id, params = {}) => {
      ensureMethod(resource, 'get')
      return requestJson('GET', `${endpoint}/${id}`, null, params)
    },
    getRawXml: async (id) => {
      ensureMethod(resource, 'get')
      return requestRaw('GET', `${endpoint}/${id}`)
    },
    create: async (xmlBody) => {
      ensureMethod(resource, 'post')
      try {
        return await requestXml('POST', endpoint, xmlBody)
      } catch (error) {
        logApiError('CREATE', resourceKey, endpoint, error)
        throw error
      }
    },
    update: async (id, xmlBody) => {
      ensureMethod(resource, 'put')
      try {
        return await requestXml('PUT', `${endpoint}/${id}`, xmlBody)
      } catch (error) {
        logApiError('UPDATE', resourceKey, `${endpoint}/${id}`, error)
        throw error
      }
    },
    patch: async (id, xmlBody) => {
      ensureMethod(resource, 'patch')
      try {
        return await requestXml('PATCH', `${endpoint}/${id}`, xmlBody)
      } catch (error) {
        logApiError('PATCH', resourceKey, `${endpoint}/${id}`, error)
        throw error
      }
    },
    remove: async (id) => {
      ensureMethod(resource, 'delete')
      try {
        return await requestRaw('DELETE', `${endpoint}/${id}`)
      } catch (error) {
        logApiError('DELETE', resourceKey, `${endpoint}/${id}`, error)
        throw error
      }
    },
    schemaBlank: async () => {
      ensureMethod(resource, 'get')
      return requestRaw('GET', endpoint, null, { schema: 'blank' })
    },
    schemaSynopsis: async () => {
      ensureMethod(resource, 'get')
      return requestRaw('GET', endpoint, null, { schema: 'synopsis' })
    },
  }
}

