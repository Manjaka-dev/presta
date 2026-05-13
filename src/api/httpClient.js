const getConfig = () => {
  const baseUrl = import.meta.env.VITE_PRESTA_BASE_URL
  const apiKey = import.meta.env.VITE_PRESTA_API_KEY
  const proxyFlag = import.meta.env.VITE_PRESTA_USE_PROXY

  return {
    baseUrl,
    apiKey,
    proxyFlag,
  }
}

const buildRelativeUrl = (baseUrl, endpoint, params = {}) => {
  const normalizedBase = baseUrl ? baseUrl.replace(/\/$/, '') : ''
  const path = `${normalizedBase}/api/${endpoint}`
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    searchParams.set(key, value)
  })

  const query = searchParams.toString().replace(/%5B/gi, '[').replace(/%5D/gi, ']').replace(/%2C/gi, ',')
  return query ? `${path}?${query}` : path
}

const buildUrl = (endpoint, params = {}) => {
  const { baseUrl, proxyFlag } = getConfig()
  const normalizedFlag = proxyFlag === 'true' ? true : proxyFlag === 'false' ? false : undefined
  const isLocalhost = Boolean(baseUrl && /^https?:\/\/localhost(?::\d+)?(\/|$)/.test(baseUrl))
  const shouldUseProxy = import.meta.env.DEV && (normalizedFlag ?? (!baseUrl || isLocalhost))

  if (shouldUseProxy) {
    return buildRelativeUrl('', endpoint, params)
  }

  if (!baseUrl) {
    return buildRelativeUrl('', endpoint, params)
  }

  const normalizedBase = baseUrl.replace(/\/$/, '')

  if (normalizedBase.startsWith('http://') || normalizedBase.startsWith('https://')) {
    const url = new URL(`${normalizedBase}/api/${endpoint}`)

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return
      }
      url.searchParams.set(key, value)
    })

    return url.toString().replace(/%5B/gi, '[').replace(/%5D/gi, ']').replace(/%2C/gi, ',')
  }

  return buildRelativeUrl(normalizedBase, endpoint, params)
}

const buildHeaders = (extraHeaders = {}) => {
  const { apiKey } = getConfig()
  const headers = {
    ...extraHeaders,
  }

  if (apiKey) {
    headers.Authorization = `Basic ${btoa(`${apiKey}:`)}`
  }

  return headers
}

const requestRaw = async (method, endpoint, body = null, params = {}, extraHeaders = {}) => {
  const url = buildUrl(endpoint, params)
  const headers = buildHeaders(extraHeaders)

  // Debug: afficher l'URL exacte et les params si activé via VITE_PRESTA_DEBUG_API=true
  try {
    const debugEnabled = import.meta.env.VITE_PRESTA_DEBUG_API === 'true'
    if (debugEnabled) {
      // Afficher l'URL telle qu'envoyée et les paramètres bruts
      console.debug('[httpClient] request', { method, url, params, headers, body })
    }
  } catch (e) {
    // Not blocking if import.meta is unavailable in some contexts
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  })

  const text = await response.text()

  if (!response.ok) {
    // Log response details to help debugging (status + body + url)
    try {
      console.error('[httpClient] request failed', { url, status: response.status, body: text })
    } catch (e) {
      // ignore logging errors
    }
    // Attach status and response body to the Error object so callers/logging can inspect them
    const err = new Error(text || `Request failed with status ${response.status}`)
    err.status = response.status
    err.body = text
    throw err
  }

  return text
}

const requestJson = async (method, endpoint, body = null, params = {}) => {
  const text = await requestRaw(
    method,
    endpoint,
    body,
    params,
    {
      'Output-Format': 'JSON',
      Accept: 'application/json',
    }
  )

  try {
    return JSON.parse(text)
  } catch (error) {
    return { __raw: text }
  }
}

const requestXml = async (method, endpoint, xmlBody, params = {}) => {
  const body = xmlBody || ''

  return requestRaw(method, endpoint, body, params, {
    'Content-Type': 'text/xml',
    Accept: 'text/xml',
  })
}

const getProductImageUrl = (productId, imageId) => {
  const { apiKey } = getConfig()
  const endpoint = `images/products/${productId}/${imageId}`
  const params = apiKey ? { ws_key: apiKey } : {}
  return buildUrl(endpoint, params)
}

const requestFormData = async (endpoint, formData, params = {}) => {
  const url = buildUrl(endpoint, params)
  const headers = buildHeaders()
  // Do NOT set Content-Type — browser sets it with boundary for multipart

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })

  const text = await response.text()

  if (!response.ok) {
    try {
      console.error('[httpClient] formdata upload failed', { url, status: response.status, body: text })
    } catch (e) {
      // ignore
    }
    const err = new Error(text || `Upload failed with status ${response.status}`)
    err.status = response.status
    err.body = text
    throw err
  }

  return text
}

export { requestRaw, requestJson, requestXml, requestFormData, getProductImageUrl, buildUrl, buildHeaders }
